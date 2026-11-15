/**
 * Application NOVIA côté serveur : relie l'API, le moteur et les repositories.
 *
 *   API → application (ici) → moteur (src/engine) → règles pures (src/core) → repositories
 *
 * Chaque opération métier : une transaction PostgreSQL de l'entreprise (verrouillée), état
 * chargé, moteur exécuté, différence enregistrée, échéances resynchronisées, révision
 * incrémentée. Les règles (STOP, attribution, SmartFill, reprise humaine…) restent dans le
 * moteur : aucune n'est réécrite en SQL.
 *
 * P2 : exécution SHADOW uniquement. Aucun fournisseur réel n'est enregistré ; la file
 * d'envoi est traitée sans transport (« aurait envoyé »).
 */
import { randomUUID } from 'node:crypto'
import { timeZoneOf, type BusinessProfile } from '../../src/config/profile'
import { createEngine, type Draft, type Engine, type EngineResult } from '../../src/engine/engine'
import type { NoviaInput } from '../../src/engine/events'
import type { NoviaState } from '../../src/engine/model'
import { anonymizeCustomer, exportCustomer } from '../../src/engine/privacy'
import { expectedJobs } from '../../src/engine/schedule'
import type { NoviaStore } from '../../src/engine/store'
import type { Db, Sql } from '../infra/db'
import { createShadowProviders, type ServerClock } from '../infra/shadow-providers'
import { audit } from '../repositories/audit'
import { loadProfile } from '../repositories/business'
import { syncJobs } from '../repositories/jobs'
import { loadState, saveState, type Actor } from '../repositories/state'

export const MAX_JOB_ATTEMPTS = 5
/** délai avant de relire une séquence restée à la même étape (attente, autre suivi en cours) */
const RECHECK_MS = 60 * 60_000

export interface Unit {
  engine: Engine
  profile: BusinessProfile
  state(): NoviaState
  sql: Sql
}

/** Store transactionnel : le moteur écrit dans le modèle, la différence part en base. */
function unitStore(initial: NoviaState, persist: (prev: NoviaState, next: NoviaState) => Promise<void>) {
  let state = initial
  let dirty = false
  const store: NoviaStore = {
    businessId: initial.businessId,
    read: () => state,
    async transact(work) {
      const { state: next, value } = work(state)
      if (next !== state) {
        if (next.businessId !== state.businessId) throw new Error('Isolation : un état ne change jamais d’entreprise.')
        await persist(state, next)
        state = next
        dirty = true
      }
      return value
    },
    subscribe: () => () => undefined,
  }
  return { store, isDirty: () => dirty, read: () => state }
}

export function createNoviaApp(deps: { db: Db; clock: ServerClock }) {
  const { db, clock } = deps
  const providers = createShadowProviders(clock)

  /** Unité de travail d'UNE entreprise : tout ou rien. */
  async function withBusiness<T>(businessId: string, actor: Actor, work: (u: Unit) => Promise<T>): Promise<{ value: T; revision: number }> {
    return db.businessTx(businessId, async (sql) => {
      const profile = await loadProfile(sql, businessId)
      const loaded = await loadState(sql, businessId)
      const unit = unitStore(loaded, (prev, next) => saveState(sql, prev, next, actor))
      const engine = createEngine({ store: unit.store, profile, providers, execution: 'shadow', dispatch: 'deferred' })
      const value = await work({ engine, profile, state: unit.read, sql })
      if (unit.isDirty()) {
        const s = unit.read()
        const rules = { ...profile.rules, sendWindow: s.settings.sendWindow }
        await syncJobs(sql, businessId, expectedJobs(s, rules, timeZoneOf(profile), clock.now()))
      }
      const r = await sql.query(`update businesses set revision = revision + ${unit.isDirty() ? 1 : 0} where id = $1 returning revision`, [businessId])
      return { value, revision: Number(r.rows[0].revision) }
    })
  }

  /** Une commande de la professionnelle (déjà validée et autorisée par l'API). */
  async function command(businessId: string, actor: Actor, draft: Draft, auditDetail: Record<string, unknown> = {}) {
    const input = { ...draft, businessId, source: 'novia-pro', eventId: randomUUID(), occurredAt: clock.now().toISOString() } as Draft
    const r = await withBusiness(businessId, actor, async (u) => {
      const result = await u.engine.execute(input)
      await audit(u.sql, businessId, actor, `command.${draft.type}`, entityOf(input as NoviaInput), { ok: result.ok, ...auditDetail, ...(result.ok ? {} : { error: result.error }) })
      return result
    })
    // la file d'envoi est traitée APRÈS validation de la décision (outbox), sans transport
    await flushOutbox(businessId)
    return r
  }

  /**
   * Événement entrant (P2 : événements de test du pilote uniquement). Inbox : un même
   * (source, eventId) n'est traité qu'UNE fois, même reçu trois fois.
   */
  async function ingest(businessId: string, actor: Actor, event: Draft & { source: string; eventId: string; occurredAt: string }) {
    const r = await withBusiness(businessId, actor, async (u): Promise<EngineResult & { duplicate?: true }> => {
      const inserted = await u.sql.query(
        `insert into inbox_events (business_id, source, event_id, type, occurred_at, payload, status) values ($1,$2,$3,$4,$5,$6,'received')
         on conflict (business_id, source, event_id) do nothing returning event_id`,
        [businessId, event.source, event.eventId, event.type, event.occurredAt, redactPayload(event)],
      )
      if (!inserted.rowCount) {
        await audit(u.sql, businessId, actor, 'inbox.duplicate', null, { source: event.source, eventId: event.eventId })
        return { ok: true, value: undefined, duplicate: true }
      }
      const result = await u.engine.execute({ ...event, businessId })
      await u.sql.query(`update inbox_events set status = $4, processed_at = now(), error = $5 where business_id = $1 and source = $2 and event_id = $3`, [
        businessId,
        event.source,
        event.eventId,
        result.ok ? 'processed' : result.code === 'rejected' ? 'rejected' : 'failed',
        result.ok ? null : result.error,
      ])
      await audit(u.sql, businessId, actor, `event.${event.type}`, entityOf(event as NoviaInput), { source: event.source, eventId: event.eventId, ok: result.ok })
      return result
    })
    await flushOutbox(businessId)
    return r
  }

  /** Traite la file d'envoi d'une entreprise (shadow : rien ne sort du serveur). */
  async function flushOutbox(businessId: string) {
    return withBusiness(businessId, { type: 'novia', id: 'outbox' }, async (u) => {
      const pending = u.state().outbox.filter((o) => o.status === 'pending' || o.status === 'retrying').length
      if (pending) await u.engine.flush()
      return pending
    })
  }

  /**
   * Ordonnanceur : exécute les échéances dues (toutes entreprises), une par une, chacune
   * dans la transaction de son entreprise. Les gardes sont relues AU MOMENT de l'exécution
   * par le moteur. Échec technique : nouvel essai avec délai croissant, puis « failed ».
   */
  async function runDueJobs(limit = 50) {
    const now = clock.now()
    const due = await db.schedulerTx(
      async (c) =>
        (
          await c.query(
            `select business_id, key from scheduled_jobs
             where (status = 'pending' and due_at <= $1) or (status = 'running' and locked_until < $1)
             order by due_at limit $2`,
            [now, limit],
          )
        ).rows as { business_id: string; key: string }[],
    )
    let executed = 0
    for (const j of due) {
      try {
        const r = await withBusiness(j.business_id, { type: 'novia', id: 'scheduler' }, async (u) => {
          const job = (await u.sql.query(`select * from scheduled_jobs where business_id = $1 and key = $2 for update`, [j.business_id, j.key])).rows[0]
          const stale = job?.status === 'running' && new Date(job.locked_until).getTime() < now.getTime()
          if (!job || (!(job.status === 'pending' && new Date(job.due_at).getTime() <= now.getTime()) && !stale)) return false
          await u.sql.query(`update scheduled_jobs set status = 'running', attempts = attempts + 1, locked_until = $3, updated_at = now() where business_id = $1 and key = $2`, [
            j.business_id,
            j.key,
            new Date(now.getTime() + 5 * 60_000),
          ])
          // l'identifiant de l'échéance sert de clé : rejouer la même échéance ne décide rien deux fois
          const result = await u.engine.execute({ type: job.kind, ...job.payload, source: 'novia-engine', eventId: job.key })
          const s = u.state()
          const again = expectedJobs(s, { ...u.profile.rules, sendWindow: s.settings.sendWindow }, timeZoneOf(u.profile), now).find((x) => x.key === j.key)
          if (again && job.kind === 'SequenceStepDue') {
            // la séquence n'a pas avancé (attente, autre suivi) : relue plus tard
            const next = new Date(Math.max(again.dueAt.getTime(), now.getTime() + RECHECK_MS))
            await u.sql.query(`update scheduled_jobs set status = 'pending', due_at = $3, locked_until = null, updated_at = now() where business_id = $1 and key = $2`, [j.business_id, j.key, next])
          } else {
            await u.sql.query(`update scheduled_jobs set status = 'done', locked_until = null, last_error = $3, updated_at = now() where business_id = $1 and key = $2`, [
              j.business_id,
              j.key,
              result.ok ? null : result.error,
            ])
          }
          return true
        })
        if (r.value) executed++
      } catch (e) {
        await failJob(j.business_id, j.key, e)
      }
      await flushOutbox(j.business_id).catch(() => undefined)
    }
    return executed
  }

  /** Panne pendant une échéance : la transaction est annulée, l'échéance est retentée plus tard. */
  async function failJob(businessId: string, key: string, e: unknown) {
    const message = e instanceof Error ? e.message.slice(0, 300) : 'Erreur inattendue'
    await db.businessTx(businessId, async (c) => {
      const r = await c.query(`update scheduled_jobs set attempts = attempts + 1 where business_id = $1 and key = $2 returning attempts`, [businessId, key])
      const attempts = Number(r.rows[0]?.attempts ?? MAX_JOB_ATTEMPTS)
      const status = attempts >= MAX_JOB_ATTEMPTS ? 'failed' : 'pending'
      const retryAt = new Date(clock.now().getTime() + 2 ** attempts * 60_000)
      await c.query(`update scheduled_jobs set status = $3, due_at = $4, last_error = $5, locked_until = null, updated_at = now() where business_id = $1 and key = $2`, [
        businessId,
        key,
        status,
        retryAt,
        message,
      ])
      await audit(c, businessId, { type: 'novia', id: 'scheduler' }, 'job.failed', { type: 'job', id: key }, { attempts, final: status === 'failed' })
    })
  }

  /** Entreprises dont la file d'envoi attend (rattrapage après un arrêt). */
  async function flushAllOutboxes() {
    const ids = await db.schedulerTx(async (c) => (await c.query(`select distinct business_id from outbox_messages where status in ('pending', 'retrying')`)).rows.map((r) => r.business_id as string))
    for (const id of ids) await flushOutbox(id)
    return ids.length
  }

  /* ---------- Lecture ---------- */

  async function snapshot(businessId: string) {
    return db.businessTx(businessId, async (c) => {
      const profile = await loadProfile(c, businessId)
      const state = await loadState(c, businessId)
      const rev = await c.query('select revision from businesses where id = $1', [businessId])
      return { profile, state, revision: Number(rev.rows[0].revision) }
    })
  }

  async function revision(businessId: string) {
    return Number((await db.pool.query('select revision from businesses where id = $1', [businessId])).rows[0]?.revision ?? -1)
  }

  async function shadowDecisions(businessId: string, limit = 100) {
    return db.businessTx(businessId, async (c) =>
      (
        await c.query(
          `select at, customer_id, appointment_id, workflow, action, result, reason, guards, input_type from shadow_decisions where business_id = $1 order by id desc limit $2`,
          [businessId, limit],
        )
      ).rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() })),
    )
  }

  async function auditLog(businessId: string, limit = 100) {
    return db.businessTx(businessId, async (c) =>
      (await c.query(`select at, actor_type, actor_id, action, entity_type, entity_id, detail from audit_log where business_id = $1 order by id desc limit $2`, [businessId, limit])).rows.map(
        (r) => ({ ...r, at: new Date(r.at).toISOString() }),
      ),
    )
  }

  /* ---------- Données personnelles ---------- */

  async function exportCustomerData(businessId: string, actor: Actor, customerId: string) {
    return withBusiness(businessId, actor, async (u) => {
      // l'export lit TOUT l'historique de la cliente, pas seulement la fenêtre chargée
      const full = exportCustomer(u.state(), customerId, clock.now())
      if (!full) return undefined
      const messages = (
        await u.sql.query(`select id, at, sender, purpose, body, status from messages where business_id = $1 and customer_id = $2 order by at`, [businessId, customerId])
      ).rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() }))
      await audit(u.sql, businessId, actor, 'customer.exported', { type: 'customer', id: customerId })
      return { ...full, allMessages: messages }
    })
  }

  async function anonymizeCustomerData(businessId: string, actor: Actor, customerId: string) {
    return withBusiness(businessId, actor, async (u) => {
      if (!u.state().customers.some((c) => c.id === customerId)) return false
      await u.sql.query(`select set_config('novia.anonymizing', 'on', true)`)
      await u.engine.store.transact((s) => ({ state: anonymizeCustomer(s, customerId, clock.now()), value: undefined }))
      // hors de la fenêtre chargée : contenus effacés directement (même règle)
      await u.sql.query(`update messages set body = '[contenu supprimé]' where business_id = $1 and customer_id = $2`, [businessId, customerId])
      await u.sql.query(`update consent_records set proof_ref = '[contenu supprimé]' where business_id = $1 and customer_id = $2 and proof_ref is not null`, [businessId, customerId])
      await u.sql.query(`update inbox_events set payload = '{}' where business_id = $1 and payload->>'customerId' = $2`, [businessId, customerId])
      await u.sql.query(`update outbox_messages set payload = payload - 'purpose' where business_id = $1 and payload->>'customerId' = $2`, [businessId, customerId])
      await u.sql.query(`update scheduled_jobs set status = 'cancelled' where business_id = $1 and status = 'pending' and payload->>'runId' in (select id from sequences where business_id = $1 and customer_id = $2)`, [
        businessId,
        customerId,
      ])
      await audit(u.sql, businessId, actor, 'customer.anonymized', { type: 'customer', id: customerId })
      return true
    })
  }

  return { withBusiness, command, ingest, flushOutbox, flushAllOutboxes, runDueJobs, snapshot, revision, shadowDecisions, auditLog, exportCustomerData, anonymizeCustomerData }
}

export type NoviaApp = ReturnType<typeof createNoviaApp>

/** Entité visée par une entrée (pour l'audit). */
function entityOf(input: NoviaInput): { type: string; id: string } | null {
  if ('appointmentId' in input && input.appointmentId) return { type: 'appointment', id: input.appointmentId }
  if ('customerId' in input && input.customerId) return { type: 'customer', id: input.customerId }
  if ('conversationId' in input && input.conversationId) return { type: 'conversation', id: input.conversationId }
  if ('opportunityId' in input && input.opportunityId) return { type: 'opportunity', id: input.opportunityId }
  if ('runId' in input && input.runId) return { type: 'sequence', id: input.runId }
  return null
}

/** Payload d'inbox : sans corps de message ni coordonnées (minimisation). */
function redactPayload(e: Record<string, unknown>) {
  const { body, contact, ...rest } = e
  return { ...rest, ...(body ? { body: '[non conservé]' } : {}), ...(contact ? { contact: '[non conservé]' } : {}) }
}
