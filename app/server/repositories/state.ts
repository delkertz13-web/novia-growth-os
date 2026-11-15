/**
 * Repository de l'état NOVIA d'UNE entreprise, sur PostgreSQL.
 *
 * Le moteur travaille sur un modèle (`NoviaState`) ; ce repository le CHARGE depuis des
 * tables relationnelles et ENREGISTRE la différence après chaque transaction. Le moteur ne
 * connaît ni SQL ni la base ; la base ne contient aucune règle métier (seulement des
 * contraintes d'intégrité et l'isolation par entreprise).
 *
 * Toutes les requêtes sont paramétrées. Chaque fonction s'exécute dans `db.businessTx`
 * (entreprise déclarée à la base, ligne verrouillée).
 *
 * Collections « fenêtrées » (comme en P1) : messages automatiques (50 derniers), outbox
 * (200 dernières + toutes celles en attente), journal (200 dernières entrées). Une entrée
 * qui sort de la fenêtre reste en base : elle n'est jamais supprimée par un enregistrement.
 */
import type {
  Appointment,
  ConsentRecord,
  Conversation,
  ConversationMessage,
  Customer,
  ExternalRef,
  NoviaSettings,
  Opportunity,
  VoiceCall,
  VoiceSettings,
  WaitlistEntry,
  WorkflowRun,
} from '../../src/core/types'
import { LIMITS, STATE_VERSION, type JournalEntry, type NoviaState, type OutboundMessage, type OutboxEntry } from '../../src/engine/model'
import type { Sql } from '../infra/db'

export interface Actor {
  type: 'user' | 'novia' | 'system' | 'test'
  id: string
}

/* ------------------------------------------------------------------ */
/* Conversions                                                          */
/* ------------------------------------------------------------------ */

const iso = (v: Date | string | null | undefined) => (v == null ? undefined : (v instanceof Date ? v : new Date(v)).toISOString())
const num = (v: string | number | null | undefined) => (v == null ? undefined : Number(v))
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** retire les clés `undefined` : le modèle rechargé est identique au modèle enregistré */
function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k]
  return o
}
/** position d'un identifiant court (m12 → 12) : ordre de création */
const ordOf = (id: string) => Number(/(\d+)$/.exec(id)?.[1] ?? 0)

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/* ------------------------------------------------------------------ */
/* Chargement                                                           */
/* ------------------------------------------------------------------ */

export async function loadState(c: Sql, businessId: string): Promise<NoviaState> {
  const q = async (sql: string, params: unknown[] = [businessId]) => (await c.query(sql, params)).rows as Row[]
  const [biz] = await q('select seq from businesses where id = $1')
  const [settings] = await q('select settings, voice from business_settings where business_id = $1')

  const refs = await q('select entity_type, entity_id, provider, external_id from external_refs where business_id = $1 order by provider')
  const refsOf = (type: string, id: string): ExternalRef[] | undefined => {
    const r = refs.filter((x) => x.entity_type === type && x.entity_id === id).map((x) => ({ provider: x.provider, id: x.external_id }))
    return r.length ? r : undefined
  }

  const consentRows = await q('select * from consent_records where business_id = $1 order by customer_id, position')
  const consentsOf = new Map<string, ConsentRecord[]>()
  for (const r of consentRows) {
    const list = consentsOf.get(r.customer_id) ?? []
    list.push(clean({ id: r.id, at: iso(r.at)!, channel: r.channel, purpose: r.purpose, state: r.state, source: r.source, proofRef: r.proof_ref ?? undefined }))
    consentsOf.set(r.customer_id, list)
  }
  const customers: Customer[] = (await q('select * from customers where business_id = $1 order by created_at, id')).map((r) =>
    clean({
      id: r.id,
      businessId,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      email: r.email,
      source: r.lead_source,
      createdAt: iso(r.created_at)!,
      lifecycle: r.lifecycle,
      consent: { transactional: r.consent_transactional, marketing: r.consent_marketing },
      optOut: r.opt_out,
      consents: consentsOf.get(r.id) ?? [],
      humanTakeover: r.human_takeover,
      lastActivityAt: iso(r.last_activity_at)!,
      referrerId: r.extra.referrerId,
      noShowRecovered: r.extra.noShowRecovered,
      externalRefs: refsOf('customer', r.id),
      anonymizedAt: iso(r.anonymized_at),
    }),
  )

  const payments = new Map((await q('select * from payments where business_id = $1')).map((r) => [r.appointment_id, r]))
  const appointments: Appointment[] = (await q('select * from appointments where business_id = $1 order by start_at, id')).map((r) => {
    const p = payments.get(r.id)
    return clean({
      id: r.id,
      businessId,
      ref: r.ref,
      customerId: r.customer_id,
      serviceId: r.service_id,
      start: iso(r.start_at)!,
      durationMin: r.duration_min,
      price: num(r.price)!,
      deposit: num(r.deposit)!,
      status: r.status,
      bookingOrigin: r.booking_origin,
      attribution: r.attribution,
      rescheduledFromId: r.rescheduled_from_id ?? undefined,
      rescheduledToId: r.rescheduled_to_id ?? undefined,
      history: r.history,
      paymentProof: p ? { kind: p.kind, amount: num(p.amount)!, at: iso(p.declared_at)! } : undefined,
      bookedAt: iso(r.booked_at),
      version: r.version || undefined,
      externalRefs: refsOf('appointment', r.id),
    })
  })

  const actions = new Map<string, WorkflowRun['actions']>()
  for (const r of await q('select * from sequence_actions where business_id = $1 order by sequence_id, position')) {
    const list = actions.get(r.sequence_id) ?? []
    list.push({ at: iso(r.at)!, kind: r.kind, label: r.label })
    actions.set(r.sequence_id, list)
  }
  const runs: WorkflowRun[] = (await q('select * from sequences where business_id = $1 order by started_at, id')).map((r) =>
    clean({
      id: r.id,
      businessId,
      workflow: r.workflow,
      customerId: r.customer_id,
      appointmentId: r.appointment_id ?? undefined,
      state: r.state,
      step: r.step,
      messagesSent: r.messages_sent,
      startedAt: iso(r.started_at)!,
      endedAt: iso(r.ended_at),
      outcome: r.outcome ?? undefined,
      actions: actions.get(r.id) ?? [],
    }),
  )

  const opportunities: Opportunity[] = (await q('select * from opportunities where business_id = $1 order by created_at, id')).map((r) =>
    clean({
      id: r.id,
      businessId,
      kind: r.kind,
      amount: num(r.amount)!,
      status: r.status,
      createdAt: iso(r.created_at)!,
      sourceAppointmentId: r.source_appointment_id ?? undefined,
      slotStart: iso(r.slot_start),
      slotDurationMin: r.slot_duration_min ?? undefined,
      resultAppointmentId: r.result_appointment_id ?? undefined,
    }),
  )
  const waitlist: WaitlistEntry[] = (await q('select * from waitlist_entries where business_id = $1 order by created_at, id')).map((r) => ({
    id: r.id,
    businessId,
    customerId: r.customer_id,
    serviceId: r.service_id,
    ...r.preferences,
    createdAt: iso(r.created_at)!,
  }))

  const convMessages = new Map<string, ConversationMessage[]>()
  for (const r of await q('select * from messages where business_id = $1 and conversation_id is not null order by conversation_id, position')) {
    const list = convMessages.get(r.conversation_id) ?? []
    list.push(clean({ id: r.id, at: iso(r.at)!, from: r.sender, body: r.body, faqId: r.faq_id ?? undefined, delivery: r.status ?? undefined }))
    convMessages.set(r.conversation_id, list)
  }
  const conversations: Conversation[] = (await q('select * from conversations where business_id = $1 order by id')).map((r) =>
    clean({
      id: r.id,
      businessId,
      customerId: r.customer_id,
      channel: r.channel,
      needsHuman: r.needs_human,
      needsHumanReason: r.needs_human_reason ?? undefined,
      unread: r.unread,
      messages: convMessages.get(r.id) ?? [],
      externalRefs: refsOf('conversation', r.id),
    }),
  )

  const names = new Map(customers.map((x) => [x.id, `${x.firstName} ${x.lastName}`]))
  const messages: OutboundMessage[] = (
    await q(`select * from messages where business_id = $1 and conversation_id is null order by at desc, position desc limit ${LIMITS.messages}`)
  ).map((r) =>
    clean({
      id: r.id,
      at: iso(r.at)!,
      to: names.get(r.customer_id) ?? 'Cliente',
      customerId: r.customer_id ?? undefined,
      appointmentId: r.appointment_id ?? undefined,
      channel: 'sms' as const,
      purpose: r.purpose,
      body: r.body,
      businessId,
      idempotencyKey: r.idempotency_key ?? undefined,
      status: r.status ?? undefined,
    }),
  )

  const calls: VoiceCall[] = (await q('select call from voice_calls where business_id = $1 order by at desc, id')).map((r) => r.call)

  const outbox: OutboxEntry[] = (
    await q(
      `select * from outbox_messages where business_id = $1 and (status in ('pending', 'retrying') or key in
         (select key from outbox_messages where business_id = $1 order by created_at desc, key desc limit ${LIMITS.outbox}))
       order by created_at desc, key desc`,
    )
  ).map((r) =>
    clean({
      key: r.key,
      businessId,
      kind: r.kind,
      ref: r.ref,
      createdAt: iso(r.created_at)!,
      status: r.status,
      attempts: r.attempts,
      lastError: r.last_error ?? undefined,
      externalRef: r.payload.externalRef,
    }),
  )

  const inbox = (await q(`select source, event_id from inbox_events where business_id = $1 order by received_at desc limit ${LIMITS.inbox}`)).map(
    (r) => `${r.source}:${r.event_id}`,
  )

  const journal: JournalEntry[] = (
    await q(`select at, action, entity_type, entity_id, detail from audit_log where business_id = $1 and actor_type = 'novia' and action like 'journal.%'
             order by id desc limit ${LIMITS.journal}`)
  ).map((r) =>
    clean({
      at: iso(r.at)!,
      kind: r.action.slice('journal.'.length),
      label: r.detail.label,
      input: r.detail.input,
      customerId: r.detail.customerId,
      appointmentId: r.detail.appointmentId,
      decision: r.detail.decision,
    }),
  )

  return {
    version: STATE_VERSION,
    businessId,
    seq: biz.seq,
    customers,
    appointments,
    runs,
    opportunities,
    waitlist,
    messages,
    voice: settings.voice as VoiceSettings,
    conversations,
    calls,
    settings: settings.settings as NoviaSettings,
    outbox,
    inbox,
    journal,
  }
}

/* ------------------------------------------------------------------ */
/* Enregistrement de la différence                                      */
/* ------------------------------------------------------------------ */

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]))

export async function saveState(c: Sql, prev: NoviaState, next: NoviaState, actor: Actor): Promise<void> {
  if (prev.businessId !== next.businessId) throw new Error('Isolation : un état ne change jamais d’entreprise.')
  const b = next.businessId
  const run = (sql: string, params: unknown[]) => c.query(sql, params)

  if (prev.seq !== next.seq) await run('update businesses set seq = $2 where id = $1', [b, next.seq])
  if (!same(prev.settings, next.settings) || !same(prev.voice, next.voice))
    await run('update business_settings set settings = $2, voice = $3, updated_at = now() where business_id = $1', [b, next.settings, next.voice])

  /* clientes, registre de consentement, reprise humaine */
  const pc = byId(prev.customers)
  for (const x of next.customers) {
    const old = pc.get(x.id)
    if (old && same(old, x)) continue
    const cols = [
      b, x.id, x.firstName, x.lastName, x.phone, x.email, x.source, x.lifecycle, x.consent.transactional, x.consent.marketing, x.optOut,
      x.humanTakeover, x.createdAt, x.lastActivityAt, x.anonymizedAt ?? null, clean({ referrerId: x.referrerId, noShowRecovered: x.noShowRecovered }),
    ]
    await run(
      `insert into customers (business_id, id, first_name, last_name, phone, email, lead_source, lifecycle, consent_transactional, consent_marketing,
         opt_out, human_takeover, created_at, last_activity_at, anonymized_at, extra)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (business_id, id) do update set first_name = $3, last_name = $4, phone = $5, email = $6, lead_source = $7, lifecycle = $8,
         consent_transactional = $9, consent_marketing = $10, opt_out = $11, human_takeover = $12, last_activity_at = $14, anonymized_at = $15, extra = $16`,
      cols,
    )
    const before = old?.consents ?? []
    for (const [i, k] of x.consents.entries()) {
      if (i < before.length) {
        // le registre est en ajout seul : seule l'anonymisation peut effacer une preuve (trigger)
        if (!same(before[i], k)) await run('update consent_records set proof_ref = $3 where business_id = $1 and id = $2', [b, k.id, k.proofRef ?? null])
        continue
      }
      await run(
        `insert into consent_records (business_id, id, customer_id, position, at, channel, purpose, state, source, proof_ref)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [b, k.id, x.id, i, k.at, k.channel, k.purpose, k.state, k.source, k.proofRef ?? null],
      )
    }
    if ((old?.humanTakeover ?? false) !== x.humanTakeover)
      await run('insert into human_takeovers (business_id, customer_id, value, at, actor) values ($1,$2,$3,now(),$4)', [b, x.id, x.humanTakeover, `${actor.type}:${actor.id}`])
    await saveRefs(c, b, 'customer', x.id, old?.externalRefs, x.externalRefs)
  }

  /* rendez-vous et paiements déclarés */
  const pa = byId(prev.appointments)
  for (const a of next.appointments) {
    const old = pa.get(a.id)
    if (old && same(old, a)) continue
    await run(
      `insert into appointments (business_id, id, ref, customer_id, service_id, start_at, duration_min, price, deposit, status, booking_origin, attribution,
         rescheduled_from_id, rescheduled_to_id, booked_at, version, history)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (business_id, id) do update set start_at = $6, duration_min = $7, price = $8, deposit = $9, status = $10, booking_origin = $11,
         attribution = $12, rescheduled_from_id = $13, rescheduled_to_id = $14, booked_at = $15, version = $16, history = $17`,
      [
        b, a.id, a.ref, a.customerId, a.serviceId, a.start, a.durationMin, a.price, a.deposit, a.status, a.bookingOrigin, a.attribution,
        a.rescheduledFromId ?? null, a.rescheduledToId ?? null, a.bookedAt ?? null, a.version ?? 0, JSON.stringify(a.history),
      ],
    )
    if (a.paymentProof && !same(old?.paymentProof, a.paymentProof))
      await run(
        `insert into payments (business_id, appointment_id, kind, amount, declared_at) values ($1,$2,$3,$4,$5)
         on conflict (business_id, appointment_id) do update set kind = $3, amount = $4, declared_at = $5`,
        [b, a.id, a.paymentProof.kind, a.paymentProof.amount, a.paymentProof.at],
      )
    await saveRefs(c, b, 'appointment', a.id, old?.externalRefs, a.externalRefs)
  }

  /* séquences et leurs actions (ajout seul) */
  const pr = byId(prev.runs)
  for (const r of next.runs) {
    const old = pr.get(r.id)
    if (old && same(old, r)) continue
    await run(
      `insert into sequences (business_id, id, workflow, customer_id, appointment_id, state, step, messages_sent, started_at, ended_at, outcome)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (business_id, id) do update set state = $6, step = $7, messages_sent = $8, ended_at = $10, outcome = $11`,
      [b, r.id, r.workflow, r.customerId, r.appointmentId ?? null, r.state, r.step, r.messagesSent, r.startedAt, r.endedAt ?? null, r.outcome ?? null],
    )
    for (let i = old?.actions.length ?? 0; i < r.actions.length; i++) {
      const x = r.actions[i]
      await run('insert into sequence_actions (business_id, sequence_id, position, at, kind, label) values ($1,$2,$3,$4,$5,$6)', [b, r.id, i, x.at, x.kind, x.label])
    }
  }

  /* opportunités, liste d'attente */
  const po = byId(prev.opportunities)
  for (const o of next.opportunities) {
    if (same(po.get(o.id), o)) continue
    await run(
      `insert into opportunities (business_id, id, kind, amount, status, created_at, source_appointment_id, slot_start, slot_duration_min, result_appointment_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (business_id, id) do update set amount = $4, status = $5, result_appointment_id = $10`,
      [b, o.id, o.kind, o.amount, o.status, o.createdAt, o.sourceAppointmentId ?? null, o.slotStart ?? null, o.slotDurationMin ?? null, o.resultAppointmentId ?? null],
    )
  }
  const pw = byId(prev.waitlist)
  const nw = byId(next.waitlist)
  for (const w of next.waitlist) {
    if (same(pw.get(w.id), w)) continue
    await run(
      `insert into waitlist_entries (business_id, id, customer_id, service_id, created_at, preferences) values ($1,$2,$3,$4,$5,$6)
       on conflict (business_id, id) do update set service_id = $4, preferences = $6`,
      [b, w.id, w.customerId, w.serviceId, w.createdAt, { days: w.days, periods: w.periods, flexible: w.flexible }],
    )
  }
  for (const w of prev.waitlist) if (!nw.has(w.id)) await run('delete from waitlist_entries where business_id = $1 and id = $2', [b, w.id])

  /* conversations et leurs messages */
  const pcv = byId(prev.conversations)
  for (const cv of next.conversations) {
    const old = pcv.get(cv.id)
    if (old && same(old, cv)) continue
    await run(
      `insert into conversations (business_id, id, customer_id, channel, needs_human, needs_human_reason, unread) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (business_id, id) do update set needs_human = $5, needs_human_reason = $6, unread = $7`,
      [b, cv.id, cv.customerId, cv.channel, cv.needsHuman, cv.needsHumanReason ?? null, cv.unread],
    )
    const om = byId(old?.messages ?? [])
    for (const [i, m] of cv.messages.entries()) {
      const o = om.get(m.id)
      if (o && same(o, m)) continue
      await run(
        `insert into messages (business_id, id, conversation_id, customer_id, at, sender, body, faq_id, status, position)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (business_id, id) do update set body = $7, status = $9`,
        [b, m.id, cv.id, cv.customerId, m.at, m.from, m.body, m.faqId ?? null, m.delivery ?? null, i],
      )
    }
    await saveRefs(c, b, 'conversation', cv.id, old?.externalRefs, cv.externalRefs)
  }

  /* messages automatiques de NOVIA : la clé d'idempotence est unique EN BASE */
  const pm = byId(prev.messages)
  for (const m of next.messages) {
    const old = pm.get(m.id)
    if (old && same(old, m)) continue
    await run(
      `insert into messages (business_id, id, customer_id, appointment_id, at, sender, purpose, body, idempotency_key, status, position)
       values ($1,$2,$3,$4,$5,'novia',$6,$7,$8,$9,$10)
       on conflict (business_id, id) do update set body = $7, status = $9`,
      [b, m.id, m.customerId ?? null, m.appointmentId ?? null, m.at, m.purpose, m.body, m.idempotencyKey ?? null, m.status ?? null, ordOf(m.id)],
    )
  }

  /* appels Voice (simulés : vides en pilote) */
  const pcall = byId(prev.calls)
  for (const x of next.calls)
    if (!same(pcall.get(x.id), x))
      await run(
        `insert into voice_calls (business_id, id, at, customer_id, call) values ($1,$2,$3,$4,$5)
         on conflict (business_id, id) do update set customer_id = $4, call = $5`,
        [b, x.id, x.at, x.customerId ?? null, x],
      )

  /* outbox : insertion idempotente par clé ; aucun statut « envoyé » possible (contrainte) */
  const pk = new Map(prev.outbox.map((o) => [o.key, o]))
  for (const o of next.outbox) {
    const old = pk.get(o.key)
    if (old && same(old, o)) continue
    const m = o.kind === 'message' ? next.messages.find((x) => x.id === o.ref) : undefined
    const payload = clean({ purpose: m?.purpose, customerId: m?.customerId, appointmentId: m?.appointmentId, externalRef: o.externalRef })
    await run(
      `insert into outbox_messages (business_id, key, kind, ref, status, attempts, last_error, payload, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict (business_id, key) do update set status = $5, attempts = $6, last_error = $7, payload = $8, updated_at = now()`,
      [b, o.key, o.kind, o.ref, o.status, o.attempts, o.lastError ?? null, payload, o.createdAt],
    )
  }

  /* journal du moteur → audit (sans contenu) + décisions shadow */
  const known = new Set(prev.journal)
  const fresh = next.journal.filter((j) => !known.has(j)).reverse()
  for (const j of fresh) {
    await run(
      `insert into audit_log (business_id, at, actor_type, actor_id, action, entity_type, entity_id, detail) values ($1,$2,'novia',$3,$4,$5,$6,$7)`,
      [
        b, j.at, `${actor.type}:${actor.id}`, `journal.${j.kind}`, j.appointmentId ? 'appointment' : j.customerId ? 'customer' : null, j.appointmentId ?? j.customerId ?? null,
        clean({ label: j.label, input: j.input, customerId: j.customerId, appointmentId: j.appointmentId, decision: j.decision }),
      ],
    )
    if (j.decision)
      await run(
        `insert into shadow_decisions (business_id, at, customer_id, appointment_id, workflow, action, result, reason, guards, input_type)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [b, j.at, j.customerId ?? null, j.appointmentId ?? null, j.decision.workflow ?? null, j.decision.action, j.decision.result, j.decision.reason, JSON.stringify(j.decision.guards ?? []), j.input ?? null],
      )
  }
}

async function saveRefs(c: Sql, b: string, type: string, id: string, before: ExternalRef[] | undefined, after: ExternalRef[] | undefined) {
  if (same(before ?? [], after ?? [])) return
  for (const r of after ?? [])
    await c.query(
      `insert into external_refs (business_id, entity_type, entity_id, provider, external_id) values ($1,$2,$3,$4,$5)
       on conflict (business_id, entity_type, entity_id, provider) do update set external_id = $5`,
      [b, type, id, r.provider, r.id],
    )
}

/** Ligne de réglages initiale d'une nouvelle entreprise. */
export async function insertInitialSettings(c: Sql, businessId: string, settings: NoviaSettings, voice: VoiceSettings) {
  await c.query('insert into business_settings (business_id, settings, voice) values ($1,$2,$3)', [businessId, settings, voice])
}
