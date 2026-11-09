/**
 * Moteur NOVIA : point d'entrée UNIQUE de toute écriture métier.
 *
 *   entrée → isolation (businessId) → inbox (déduplication) → version (périmé ?)
 *          → orchestration (transaction atomique : état + décisions + file d'envoi)
 *          → envoi (simulé / shadow / réel) → résultat explicite, jamais d'exception
 */
import { timeZoneOf, type BusinessProfile } from '../config/profile'
import { ValidationError } from '../core/appointmentStatus'
import { ConsentError } from '../core/consent'
import type { TechnicalProviders } from '../providers/types'
import { isExternalSource, type InputBody, type NoviaInput } from './events'
import { LIMITS, type ExecutionMode, type NoviaState } from './model'
import { applyDeliveries, runDeliveries } from './dispatch'
import { decide, dueReminders, EngineError, Tx } from './orchestration'
import type { NoviaStore } from './store'

export type EngineResult<T = unknown> =
  | { ok: true; value: T; duplicate?: true; stale?: true }
  | { ok: false; error: string; code: 'rejected' | 'isolation' | 'internal' }

export interface EngineOptions<S extends NoviaState> {
  store: NoviaStore<S>
  profile: BusinessProfile
  providers: TechnicalProviders
  execution: ExecutionMode
}

/** Entrée sans enveloppe : le moteur complète source, date et identifiant. */
export type Draft = InputBody & Partial<Pick<NoviaInput, 'eventId' | 'source' | 'occurredAt' | 'externalRefs' | 'version' | 'businessId'>>

const targetAppointment = (input: NoviaInput) =>
  'appointmentId' in input && (input.type === 'AttendanceRecorded' || input.type === 'BookingCancelled' || input.type === 'BookingRescheduled') ? input.appointmentId : undefined

export function createEngine<S extends NoviaState>(opts: EngineOptions<S>) {
  const { store, profile, providers, execution } = opts
  if (store.businessId !== profile.businessId) throw new Error('Isolation : le store et le profil ne désignent pas la même entreprise.')
  const ctx = { profile, execution, has: { crm: !!providers.crm, voice: !!providers.voice } }
  let counter = 0

  /** Exécute les envois en attente, puis enregistre leurs résultats. */
  async function flush() {
    const deliveries = await runDeliveries(store.read(), providers, profile, execution)
    if (!deliveries.length) return
    const at = providers.clock.now().toISOString()
    await store.transact((s) => ({ state: applyDeliveries(s, deliveries, at) as S, value: undefined }))
  }

  async function execute<T = unknown>(draft: Draft): Promise<EngineResult<T>> {
    const input = {
      eventId: `${draft.source ?? 'novia-pro'}-${++counter}`,
      source: 'novia-pro',
      businessId: store.businessId,
      occurredAt: providers.clock.now().toISOString(),
      ...draft,
    } as NoviaInput
    if (input.businessId !== store.businessId) return { ok: false, error: 'Isolation : cet événement appartient à une autre entreprise.', code: 'isolation' }
    let result: EngineResult<T>
    try {
      result = await store.transact((state) => {
        const tx = new Tx(state, providers.clock.now(), ctx, input)
        const inboxKey = `${input.source}:${input.eventId}`
        if (isExternalSource(input.source)) {
          // inbox : un événement externe n'est traité qu'une fois
          if (state.inbox.includes(inboxKey)) {
            tx.journal('duplicate', `Événement déjà traité (${inboxKey}) : ignoré.`)
            return { state: tx.state as S, value: { ok: true, value: undefined as T, duplicate: true } as EngineResult<T> }
          }
          tx.update((s) => ({ ...s, inbox: [inboxKey, ...s.inbox].slice(0, LIMITS.inbox) }))
          // version : un événement fondé sur un état plus ancien que le nôtre est ignoré
          const target = targetAppointment(input)
          const current = target ? tx.appointment(target) : undefined
          if (current && input.version !== undefined && input.version < (current.version ?? 0)) {
            tx.journal('stale', `Événement périmé (version ${input.version} < ${current.version}) : ignoré.`, { appointmentId: current.id })
            return { state: tx.state as S, value: { ok: true, value: undefined as T, stale: true } as EngineResult<T> }
          }
          tx.journal('event', `${input.type} reçu de ${input.source}.`)
        }
        const value = decide(tx, input) as T
        return { state: tx.state as S, value: { ok: true, value } as EngineResult<T> }
      })
    } catch (e) {
      // refus métier : rien n'est enregistré (transaction abandonnée)
      if (e instanceof EngineError || e instanceof ValidationError || e instanceof ConsentError) return { ok: false, error: e.message, code: 'rejected' }
      return { ok: false, error: e instanceof Error ? e.message : 'Action impossible', code: 'internal' }
    }
    await flush()
    return result
  }

  /**
   * Ordonnanceur minimal : déclenche les rappels W02 arrivés à échéance. En P2, appelé
   * périodiquement côté serveur ; en démo, jamais (les rappels y sont seulement calculés).
   */
  async function tick() {
    const s = store.read()
    const due = dueReminders(s, { ...profile.rules, sendWindow: s.settings.sendWindow }, providers.clock.now())
    for (const d of due) await execute({ type: 'ReminderDue', source: 'novia-engine', ...d })
    return due.length
  }

  return { execute, flush, tick, store, profile, execution, timeZone: timeZoneOf(profile), clockMode: providers.clock.mode, now: () => providers.clock.now() }
}

export type Engine = ReturnType<typeof createEngine>
