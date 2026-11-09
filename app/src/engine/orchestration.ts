/**
 * Orchestration métier de NOVIA : QUE FAIRE quand un fait survient.
 *
 * Tout ce qui vivait dans les providers Mock vit ici : conséquences d'une présence, d'une
 * absence, d'une annulation ou d'un report ; démarrage de W03 / W04 ; ouverture des
 * opportunités ; attribution d'une réservation ; clôture d'une récupération ; SmartFill ;
 * pause et reprise après reprise humaine ; réponses automatiques.
 *
 *   entrée (événement / commande) → orchestration → règles pures (src/core) → décisions
 *                                                    → état NOVIA + file d'envoi (outbox)
 *
 * Les fonctions travaillent sur une transaction (`Tx`) : elles ne lisent pas l'heure, ne
 * font aucun appel réseau et n'appellent aucun provider. Les envois sont DÉCIDÉS ici et
 * EXÉCUTÉS ensuite par dispatch.ts, selon le mode (simulé, shadow, réel).
 */
import { serviceOf, renderTemplate, timeZoneOf, usable, type BusinessProfile, type TemplateId } from '../config/profile'
import type { DataStatus, ServiceConfig, WorkflowRules } from '../config/schema'
import { applyValidation, isActiveBooking } from '../core/appointmentStatus'
import { findDuplicate, isSlotFree } from '../core/availability'
import { applyConsent } from '../core/consent'
import { smartFillFunnel } from '../core/smartfill'
import { formatIn } from '../core/time'
import type {
  Appointment,
  AttributionSource,
  Conversation,
  ConversationMessage,
  Customer,
  LeadSource,
  Opportunity,
  StatusSource,
  ValidationOutcome,
  VoiceCall,
  WorkflowRun,
} from '../core/types'
import {
  advanceRecovery,
  declineRecovery,
  evaluateGuards,
  markRecovered,
  pauseRun,
  reminderTimes,
  resumeAfterRecheck,
  startRecovery,
  stopObsoleteRuns,
} from '../core/workflows'
import { triage, type Triage } from '../core/triage'
import type { ContactInput, InputOf, NoviaInput } from './events'
import { LIMITS, type ExecutionMode, type JournalEntry, type NoviaState, type OutboundMessage, type OutboxEntry } from './model'

/** Refus métier lisible (créneau pris, statut incohérent…) : jamais une panne. */
export class EngineError extends Error {}

export interface EngineContext {
  profile: BusinessProfile
  execution: ExecutionMode
  /** fournisseurs optionnels branchés (le moteur n'empile pas d'écriture pour un absent) */
  has: { crm: boolean; voice: boolean }
}

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]
const fullName = (c?: Customer) => (c ? `${c.firstName} ${c.lastName}` : 'Cliente')

/* ------------------------------------------------------------------ */
/* Transaction                                                          */
/* ------------------------------------------------------------------ */

export class Tx {
  constructor(
    public state: NoviaState,
    readonly now: Date,
    readonly ctx: EngineContext,
    readonly input: NoviaInput,
  ) {}

  get profile() {
    return this.ctx.profile
  }
  get tz() {
    return timeZoneOf(this.ctx.profile)
  }
  get simulated() {
    return this.ctx.execution === 'simulated'
  }
  get at() {
    return this.now.toISOString()
  }
  /** règles de l'entreprise, avec la plage d'envoi choisie par la professionnelle */
  rules(): WorkflowRules {
    return { ...this.profile.rules, sendWindow: this.state.settings.sendWindow }
  }
  id(prefix: string) {
    const id = `${prefix}${this.state.seq}`
    this.state = { ...this.state, seq: this.state.seq + 1 }
    return id
  }
  update(fn: (s: NoviaState) => NoviaState) {
    this.state = fn(this.state)
  }
  customer(id: string) {
    return this.state.customers.find((c) => c.id === id)
  }
  appointment(id: string) {
    return this.state.appointments.find((a) => a.id === id)
  }
  journal(kind: JournalEntry['kind'], label: string, refs: Pick<JournalEntry, 'customerId' | 'appointmentId'> = {}) {
    const e: JournalEntry = { at: this.at, kind, label, input: this.input.type, ...refs }
    this.update((s) => ({ ...s, journal: [e, ...s.journal].slice(0, LIMITS.journal) }))
  }
  /**
   * Une donnée de profil dont dépend une automatisation est-elle utilisable ? Sinon,
   * l'automatisation est BLOQUÉE et le blocage journalisé (jamais d'envoi avec une valeur
   * de démonstration ou inconnue hors simulation).
   */
  allowed(what: string, statuses: DataStatus[], refs?: Pick<JournalEntry, 'customerId' | 'appointmentId'>) {
    if (statuses.every((s) => usable(s, this.simulated))) return true
    this.journal('blocked', `${what} : bloqué, donnée du profil non vérifiée.`, refs)
    return false
  }
  enqueue(kind: OutboxEntry['kind'], ref: string, key: string) {
    if (this.state.outbox.some((o) => o.key === key)) return false
    const entry: OutboxEntry = { key, businessId: this.state.businessId, kind, ref, createdAt: this.at, status: 'pending', attempts: 0 }
    this.update((s) => ({ ...s, outbox: [entry, ...s.outbox.filter((o, i) => i < LIMITS.outbox || o.status === 'pending' || o.status === 'retrying')] }))
    return true
  }
  /**
   * Décide un message automatique. Clé d'idempotence déterministe : une même décision
   * rejouée (double clic, événement reçu deux fois) ne crée jamais un second envoi.
   */
  message(m: { key: string; template: TemplateId; vars: Record<string, string | number>; customer: Customer; appointmentId?: string; purpose: string; requires?: DataStatus[] }) {
    if (this.state.messages.some((x) => x.idempotencyKey === m.key) || this.state.outbox.some((o) => o.key === m.key)) {
      this.journal('duplicate', `Envoi déjà décidé (${m.key}) : ignoré.`, { customerId: m.customer.id, appointmentId: m.appointmentId })
      return undefined
    }
    const template = this.profile.templates[m.template]
    if (!this.allowed(`Message ${m.purpose}`, [template.status, ...(m.requires ?? [])], { customerId: m.customer.id, appointmentId: m.appointmentId })) return undefined
    const msg: OutboundMessage = {
      to: fullName(m.customer),
      customerId: m.customer.id,
      appointmentId: m.appointmentId,
      channel: 'sms',
      purpose: m.purpose,
      body: renderTemplate(template.value, m.vars),
      id: this.id('m'),
      at: this.at,
      businessId: this.state.businessId,
      idempotencyKey: m.key,
      status: 'pending',
    }
    this.update((s) => ({ ...s, messages: [msg, ...s.messages].slice(0, LIMITS.messages) }))
    this.enqueue('message', msg.id, m.key)
    return msg
  }
  when(d: Date) {
    return formatIn(d, this.tz, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  }
}

/* ------------------------------------------------------------------ */
/* Clientes                                                             */
/* ------------------------------------------------------------------ */

export function upsertContact(tx: Tx, contact: ContactInput, source: LeadSource): Customer {
  const existing = findDuplicate(tx.state.customers, contact)
  if (existing) {
    const updated = { ...existing, lastActivityAt: tx.at }
    tx.update((s) => ({ ...s, customers: upsert(s.customers, updated) }))
    return updated
  }
  const id = tx.id('c')
  const c: Customer = {
    id,
    businessId: tx.state.businessId,
    ...contact,
    source,
    createdAt: tx.at,
    lifecycle: 'prospect',
    consent: { transactional: true, marketing: false },
    optOut: false,
    // réserver = accepter les messages liés à SON rendez-vous ; le marketing exige une case cochée
    consents: [{ id: `${id}-t`, at: tx.at, channel: 'sms', purpose: 'transactional', state: 'granted', source: 'booking_form', proofRef: 'Réservation : messages liés au rendez-vous' }],
    humanTakeover: false,
    lastActivityAt: tx.at,
  }
  tx.update((s) => ({ ...s, customers: [...s.customers, c] }))
  if (tx.ctx.has.crm) tx.enqueue('crm.upsert', c.id, `crm:upsert:${c.id}`)
  return c
}

/* ------------------------------------------------------------------ */
/* Réservation                                                          */
/* ------------------------------------------------------------------ */

function insertAppointment(tx: Tx, customer: Customer, service: ServiceConfig, start: Date, origin: Appointment['bookingOrigin'], attribution: AttributionSource) {
  const id = tx.id('a')
  const a: Appointment = {
    id,
    businessId: tx.state.businessId,
    ref: id.toUpperCase(),
    customerId: customer.id,
    serviceId: service.id,
    start: start.toISOString(),
    durationMin: service.durationMin,
    price: service.price,
    deposit: service.deposit,
    status: 'booked',
    bookingOrigin: origin,
    attribution,
    history: [],
    bookedAt: tx.at,
    version: 1,
    ...(tx.input.externalRefs ? { externalRefs: tx.input.externalRefs } : {}),
  }
  tx.update((st) => ({
    ...st,
    appointments: [...st.appointments, a],
    customers: st.customers.map((c) => (c.id === customer.id ? { ...c, lifecycle: 'client' } : c)),
  }))
  // W02 : confirmation immédiate (service, pas de prospection)
  tx.message({
    key: `W02:confirmation:${a.id}`,
    template: 'W02.confirmation',
    vars: { business: tx.profile.identity.name.value, service: service.name, when: tx.when(start), firstName: customer.firstName },
    customer,
    appointmentId: a.id,
    purpose: 'W02 · confirmation',
    requires: [tx.profile.identity.name.status],
  })
  return a
}

/** Si la cliente avait une récupération en cours, la réservation la clôt (STOP → W02) et en porte l'attribution. */
function closeRecoveriesOnBooking(tx: Tx, customerId: string, appointment: Appointment): AttributionSource | null {
  const active = tx.state.runs.filter(
    (r) => r.customerId === customerId && (r.state === 'active' || r.state === 'paused') && (r.workflow === 'W03' || r.workflow === 'W04'),
  )
  if (!active.length) return null
  const run = active[0]
  const attribution: AttributionSource = run.workflow === 'W04' ? 'noshow_recovery' : 'cancellation_recovery'
  tx.update((s) => ({
    ...s,
    runs: s.runs.map((r) => (active.some((x) => x.id === r.id) ? markRecovered(r, tx.now) : r)),
    opportunities: s.opportunities.map((o) =>
      o.status === 'open' && o.sourceAppointmentId === run.appointmentId && o.kind !== 'smartfill' ? { ...o, status: 'won', resultAppointmentId: appointment.id } : o,
    ),
    appointments: s.appointments.map((a) => (a.id === appointment.id ? { ...a, attribution } : a)),
    customers: s.customers.map((c) => (c.id === customerId && run.workflow === 'W04' ? { ...c, noShowRecovered: true } : c)),
  }))
  tx.journal('decision', `Récupération réussie : attribuée à ${attribution}.`, { customerId, appointmentId: appointment.id })
  return attribution
}

/**
 * Une réservation, d'où qu'elle vienne (site, pro, NOVIA Voice, SmartFill, récupération).
 * Une seule attribution par RDV : Voice, SmartFill, récupération, parrainage, acquisition
 * ou direct, jamais deux.
 */
export function createBooking(tx: Tx, e: InputOf<'BookingCreated'>): Appointment {
  const service = serviceOf(tx.profile, e.serviceId)
  if (!service) throw new EngineError('Prestation inconnue')
  const start = new Date(e.start)
  if (Number.isNaN(start.getTime())) throw new EngineError('Créneau invalide')
  const opp = e.opportunityId ? tx.state.opportunities.find((o) => o.id === e.opportunityId) : undefined
  if (e.origin === 'smartfill' && (!opp || opp.kind !== 'smartfill' || opp.status !== 'open')) throw new EngineError('Ce créneau n’est plus proposé.')
  // jamais de double réservation (le créneau a pu être pris entre-temps)
  if (!isSlotFree(start, service.durationMin, tx.state.appointments)) throw new EngineError('Ce créneau vient d’être réservé. Choisissez-en un autre.')

  let customer: Customer
  let isNew = false
  if (e.customerId) {
    const known = tx.customer(e.customerId)
    if (!known) throw new EngineError('Cliente introuvable')
    customer = known
  } else {
    if (!e.contact) throw new EngineError('Coordonnées manquantes')
    isNew = !findDuplicate(tx.state.customers, e.contact)
    customer = upsertContact(tx, e.contact, e.leadSource)
  }
  // case marketing cochée : enregistrée avec sa preuve. Elle ne lève JAMAIS une opposition (STOP).
  if (e.marketingConsent?.granted) {
    const updated = applyConsent(customer, { id: tx.id('k'), at: tx.at, channel: 'sms', purpose: 'marketing', state: 'granted', source: 'booking_form', proofRef: e.marketingConsent.proofRef })
    tx.update((s) => ({ ...s, customers: upsert(s.customers, updated) }))
    customer = updated
  }

  const attribution: AttributionSource =
    e.origin === 'smartfill' ? 'smartfill' : e.origin === 'voice' ? 'voice' : isNew ? (e.leadSource === 'referral' ? 'referral' : 'acquisition') : 'direct'
  const a = insertAppointment(tx, customer, service, start, e.origin, attribution)

  if (e.origin === 'smartfill' && opp) {
    tx.update((s) => ({
      ...s,
      opportunities: s.opportunities.map((x) => (x.id === opp.id ? { ...x, status: 'won', resultAppointmentId: a.id } : x)),
      waitlist: s.waitlist.filter((w) => w.customerId !== customer.id),
    }))
    tx.journal('decision', 'Créneau libéré rempli par SmartFill.', { customerId: customer.id, appointmentId: a.id })
    return a
  }
  const recovered = closeRecoveriesOnBooking(tx, customer.id, a)
  return recovered ? { ...a, attribution: recovered } : a
}

/* ------------------------------------------------------------------ */
/* Statut réel du RDV : présence, absence, annulation, report            */
/* ------------------------------------------------------------------ */

const isOpenRecoveryOpp = (o: Opportunity, appointmentId?: string) => o.status === 'open' && o.kind !== 'smartfill' && o.sourceAppointmentId === appointmentId

/**
 * Statut réel d'un RDV, toujours déclaré (cockpit, validation SMS, agenda externe),
 * jamais déduit de l'heure. Conséquences : séquences devenues obsolètes arrêtées,
 * récupération W03 / W04, montant « à récupérer », créneau libéré pour SmartFill,
 * rappels recalculés après un report.
 */
export function recordOutcome(tx: Tx, appointmentId: string, outcome: ValidationOutcome, source: StatusSource, newStart?: Date): Appointment {
  const t = tx.now
  const a = tx.appointment(appointmentId)
  if (!a) throw new EngineError('Rendez-vous introuvable')
  const newId = outcome === 'rescheduled' ? tx.id('a') : undefined
  const res = applyValidation(a, { outcome, source, at: t, newStart, newId, newRef: newId?.toUpperCase() })
  const updated: Appointment = { ...res.updated, version: (a.version ?? 0) + 1 }
  const created = res.created ? { ...res.created, businessId: a.businessId, version: 1 } : undefined
  const customer = tx.customer(a.customerId)!

  tx.update((s) => {
    let appointments = s.appointments.map((x) => (x.id === a.id ? updated : x))
    if (created) appointments = [...appointments, created]
    // correction : les séquences devenues incompatibles sont arrêtées, leur montant n'est plus à récupérer
    const runs = stopObsoleteRuns(s.runs, updated, t)
    const stoppedIds = new Set(runs.filter((r, i) => r !== s.runs[i]).map((r) => r.appointmentId))
    const opportunities = s.opportunities.map((o) => (o.status === 'open' && o.kind !== 'smartfill' && stoppedIds.has(o.sourceAppointmentId) ? { ...o, status: 'lost' as const } : o))
    return { ...s, appointments, runs, opportunities }
  })

  const service = serviceOf(tx.profile, a.serviceId)
  const newOpps: Opportunity[] = []
  let newRun: WorkflowRun | undefined
  const auto = tx.state.settings.automations
  const rules = tx.rules()
  const opp = (kind: Opportunity['kind'], extra: Partial<Opportunity> = {}): Opportunity => ({
    id: tx.id('o'),
    businessId: a.businessId,
    kind,
    amount: a.price,
    status: 'open',
    createdAt: t.toISOString(),
    sourceAppointmentId: a.id,
    ...extra,
  })
  const refs = { customerId: customer.id, appointmentId: a.id }
  const mayStart = (wf: 'W03' | 'W04') => tx.allowed(`Récupération ${wf}`, [rules.status, tx.profile.templates[`${wf}.recovery`].status], refs)

  if (outcome === 'absent') {
    // le montant reste « à récupérer » ; la séquence ne démarre que si la récupération est activée
    if (auto.noShowRecovery && mayStart('W04')) newRun = startRecovery('W04', updated, rules, t, customer)
    newOpps.push(opp('noshow_recovery'))
  }
  if (outcome === 'cancelled') {
    newRun = auto.cancellationRecovery && mayStart('W03') ? startRecovery('W03', updated, rules, t, customer) : undefined
    // W03 : vérification immédiate (nouveau RDV, opposition, reprise humaine…)
    const g = evaluateGuards({ customer, appointments: tx.state.appointments, runs: tx.state.runs, now: t, rules, timeZone: tx.tz, workflow: 'W03', sourceAppointment: updated })
    if (g.kind === 'stop' && newRun)
      newRun = advanceRecovery(newRun, { customer, appointments: tx.state.appointments, runs: [], now: t, rules, timeZone: tx.tz, sourceAppointment: updated })
    else newOpps.push(opp('cancellation_recovery'))
    // le créneau libéré peut alimenter SmartFill
    if (auto.smartFill && new Date(a.start).getTime() > t.getTime()) newOpps.push(opp('smartfill', { slotStart: a.start, slotDurationMin: a.durationMin }))
  }
  if (outcome === 'rescheduled' && created && service) {
    const times = reminderTimes(created, tx.profile.rules, t)
    tx.message({
      key: `W02:reschedule:${created.id}`,
      template: 'W02.reschedule',
      vars: { service: service.name, when: tx.when(new Date(created.start)), reminders: times.length, firstName: customer.firstName, business: tx.profile.identity.name.value },
      customer,
      appointmentId: created.id,
      purpose: 'W02 · déplacement',
    })
  }
  if (newRun) tx.journal('decision', newRun.state === 'active' ? `${newRun.workflow} démarrée.` : `${newRun.workflow} non démarrée : ${newRun.actions.at(-1)?.label}`, refs)

  tx.update((st) => ({ ...st, runs: newRun ? [...st.runs, newRun] : st.runs, opportunities: [...st.opportunities, ...newOpps] }))
  return tx.appointment(created?.id ?? a.id)!
}

/* ------------------------------------------------------------------ */
/* Reprise humaine                                                      */
/* ------------------------------------------------------------------ */

/**
 * La professionnelle reprend la main : les séquences de la cliente se mettent en PAUSE.
 * Elle rend la main : chaque séquence est relue contre l'état actuel avant de reprendre
 * (ou s'arrête si elle est devenue obsolète ; son montant n'est alors plus à récupérer).
 */
export function setHumanTakeover(tx: Tx, customerId: string, value: boolean) {
  if (!tx.customer(customerId)) throw new EngineError('Cliente introuvable')
  const t = tx.now
  const rules = tx.rules()
  tx.update((s) => {
    const customers = s.customers.map((c) => (c.id === customerId ? { ...c, humanTakeover: value } : c))
    const customer = customers.find((c) => c.id === customerId)!
    const runs = s.runs.map((r) =>
      r.customerId !== customerId
        ? r
        : value
          ? pauseRun(r, t)
          : resumeAfterRecheck(r, { customer, appointments: s.appointments, runs: s.runs, now: t, rules, timeZone: tx.tz, sourceAppointment: s.appointments.find((a) => a.id === r.appointmentId) }),
    )
    const ended = runs.filter((r, i) => r !== s.runs[i] && r.state === 'stopped').map((r) => r.appointmentId)
    const opportunities = s.opportunities.map((o) => (o.status === 'open' && o.kind !== 'smartfill' && ended.includes(o.sourceAppointmentId) ? { ...o, status: 'lost' as const } : o))
    return { ...s, customers, runs, opportunities }
  })
  // rendre la main : la conversation n'attend plus la professionnelle
  if (!value)
    tx.update((s) => ({ ...s, conversations: s.conversations.map((c) => (c.customerId === customerId ? { ...c, needsHuman: false, needsHumanReason: undefined } : c)) }))
}

/* ------------------------------------------------------------------ */
/* Séquences W03 / W04                                                  */
/* ------------------------------------------------------------------ */

/** Étape suivante d'une récupération : revérification complète AVANT tout envoi. */
export function advanceSequence(tx: Tx, runId: string) {
  const run = tx.state.runs.find((r) => r.id === runId)
  if (!run) return
  const customer = tx.customer(run.customerId)!
  const source = run.appointmentId ? tx.appointment(run.appointmentId) : undefined
  const next = advanceRecovery(run, { customer, appointments: tx.state.appointments, runs: tx.state.runs, now: tx.now, rules: tx.rules(), timeZone: tx.tz, sourceAppointment: source })
  if (next.messagesSent > run.messagesSent && (run.workflow === 'W03' || run.workflow === 'W04')) {
    tx.message({
      key: `${run.workflow}:${run.id}:step${next.messagesSent}`,
      template: `${run.workflow}.recovery`,
      vars: { firstName: customer.firstName, business: tx.profile.identity.name.value },
      customer,
      appointmentId: run.appointmentId,
      purpose: `${run.workflow} · ${next.messagesSent === 1 ? 'récupération' : 'dernière relance'}`,
    })
  }
  const lost = next.state !== 'active' && next.outcome !== 'recovered'
  tx.update((s) => ({
    ...s,
    runs: upsert(s.runs, next),
    opportunities: lost ? s.opportunities.map((o) => (isOpenRecoveryOpp(o, run.appointmentId) ? { ...o, status: 'lost' } : o)) : s.opportunities,
  }))
}

/** Fermer une opportunité : la cliente refuse la récupération, ou la pro garde le créneau libre. */
export function closeOpportunity(tx: Tx, e: InputOf<'OpportunityClosed'>) {
  if (e.runId) {
    const run = tx.state.runs.find((r) => r.id === e.runId)
    if (!run) return
    tx.update((s) => ({
      ...s,
      runs: upsert(s.runs, declineRecovery(run, tx.now)),
      opportunities: s.opportunities.map((o) => (isOpenRecoveryOpp(o, run.appointmentId) ? { ...o, status: 'lost' } : o)),
    }))
    return
  }
  tx.update((s) => ({
    ...s,
    opportunities: s.opportunities.map((o) => (o.id === e.opportunityId && o.kind === 'smartfill' && o.status === 'open' ? { ...o, status: 'lost' } : o)),
  }))
}

/* ------------------------------------------------------------------ */
/* SmartFill                                                            */
/* ------------------------------------------------------------------ */

/** Qui NOVIA solliciterait pour ce créneau libéré (lecture pure). */
export function funnelFor(state: NoviaState, opportunityId: string, services: ServiceConfig[], now: Date) {
  const o = state.opportunities.find((x) => x.id === opportunityId)
  if (!o?.slotStart) return null
  return smartFillFunnel({
    slotStart: new Date(o.slotStart),
    slotDurationMin: o.slotDurationMin ?? 60,
    customers: state.customers,
    appointments: state.appointments,
    waitlist: state.waitlist,
    services,
    now,
  })
}

/**
 * Lancer SmartFill : NOVIA calcule les clientes contactables (jamais une opposée, jamais
 * sans consentement marketing, jamais en reprise humaine). W12 reste À CONCEVOIR : aucune
 * proposition réelle n'est envoyée (en démo, l'acceptation est simulée par la démo).
 */
export function launchSmartFill(tx: Tx, opportunityId: string) {
  if (!tx.state.settings.automations.smartFill) throw new EngineError('SmartFill est désactivé dans vos réglages.')
  const funnel = funnelFor(tx.state, opportunityId, tx.profile.services.items, tx.now)
  if (!funnel) return null
  if (!tx.allowed('SmartFill', [tx.profile.smartFill.status, tx.profile.services.status])) return null
  tx.journal('decision', `SmartFill : ${funnel.eligible.length} éligible(s), ${funnel.contactable.length} contactable(s).`)
  if (!tx.simulated) for (const c of funnel.contactable) tx.journal('would_send', 'SmartFill : NOVIA proposerait le créneau (W12 à concevoir, rien n’est envoyé).', { customerId: c.id })
  return funnel
}

/* ------------------------------------------------------------------ */
/* Conversations                                                        */
/* ------------------------------------------------------------------ */

export function openConversation(tx: Tx, customerId: string, channel: Conversation['channel']): Conversation {
  const existing = tx.state.conversations.find((c) => c.customerId === customerId)
  if (existing) return existing
  if (!tx.customer(customerId)) throw new EngineError('Cliente introuvable')
  const conv: Conversation = { id: `conv-${customerId}`, businessId: tx.state.businessId, customerId, channel, needsHuman: false, unread: false, messages: [] }
  tx.update((s) => ({ ...s, conversations: [conv, ...s.conversations] }))
  return conv
}

function appendMessage(tx: Tx, conversationId: string, msg: Omit<ConversationMessage, 'id' | 'at'>): ConversationMessage {
  if (!tx.state.conversations.some((c) => c.id === conversationId)) throw new EngineError('Conversation introuvable')
  const m: ConversationMessage = { ...msg, id: tx.id('cm'), at: tx.at }
  tx.update((s) => ({
    ...s,
    conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, messages: [...c.messages, m], unread: msg.from === 'client' ? true : c.unread } : c)),
  }))
  // ce que NOVIA ou la pro écrit part par la messagerie (file d'envoi)
  if (msg.from !== 'client') tx.enqueue('conversation_reply', m.id, `reply:${conversationId}:${m.id}`)
  return m
}

const patchConversation = (tx: Tx, id: string, patch: Partial<Pick<Conversation, 'needsHuman' | 'needsHumanReason' | 'unread'>>) =>
  tx.update((s) => ({ ...s, conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))

const isStopKeyword = (body: string) => /^\s*stop\b/i.test(body)

/**
 * Une cliente écrit. NOVIA répond si une réponse APPROUVÉE existe (même à une cliente
 * opposée : elle demande, NOVIA répond), sinon passe la main. En reprise humaine, NOVIA
 * se tait. « STOP » enregistre l'opposition dans le registre de consentement.
 */
export function receiveInbound(tx: Tx, e: InputOf<'InboundMessageReceived'>): Triage | { kind: 'human' } | { kind: 'stop' } {
  const conv = e.conversationId
    ? tx.state.conversations.find((c) => c.id === e.conversationId)
    : e.customerId
      ? openConversation(tx, e.customerId, e.channel)
      : undefined
  if (!conv) throw new EngineError('Conversation introuvable')
  appendMessage(tx, conv.id, { from: 'client', body: e.body })
  const customer = tx.customer(conv.customerId)
  if (customer && isStopKeyword(e.body)) {
    changeConsent(tx, customer.id, { channel: 'sms', purpose: 'marketing', state: 'opposed', source: 'inbound_stop', proofRef: `message ${e.source}:${e.eventId}` })
    patchConversation(tx, conv.id, { unread: true })
    return { kind: 'stop' }
  }
  // reprise humaine : NOVIA ne répond pas, la professionnelle est notifiée
  if (customer?.humanTakeover) return { kind: 'human' }
  let t = triage(e.body, tx.profile)
  if (t.kind === 'faq' && !tx.allowed('Réponse automatique', [tx.profile.approvedAnswers.status], { customerId: conv.customerId }))
    t = { kind: 'unknown', reason: 'Réponses automatiques non encore validées par la professionnelle.' }
  if (t.kind === 'faq') {
    appendMessage(tx, conv.id, { from: 'novia', body: t.answer.answer, faqId: t.answer.id })
    patchConversation(tx, conv.id, { unread: false })
  } else {
    patchConversation(tx, conv.id, { needsHuman: true, needsHumanReason: t.reason, unread: true })
  }
  return t
}

/** Répondre soi-même : c'est une reprise humaine (NOVIA se met en retrait). */
export function replyAsPro(tx: Tx, conversationId: string, body: string) {
  const conv = tx.state.conversations.find((c) => c.id === conversationId)
  if (!conv) throw new EngineError('Conversation introuvable')
  if (!body.trim()) throw new EngineError('Message vide')
  const customer = tx.customer(conv.customerId)
  if (customer && !customer.humanTakeover) setHumanTakeover(tx, conv.customerId, true)
  patchConversation(tx, conversationId, { needsHuman: false, needsHumanReason: undefined, unread: false })
  return appendMessage(tx, conversationId, { from: 'pro', body: body.trim() })
}

export const markRead = (tx: Tx, conversationId: string) => patchConversation(tx, conversationId, { unread: false })

/* ------------------------------------------------------------------ */
/* Consentement                                                         */
/* ------------------------------------------------------------------ */

export function changeConsent(tx: Tx, customerId: string, change: InputOf<'ConsentChanged'>['change']) {
  const customer = tx.customer(customerId)
  if (!customer) throw new EngineError('Cliente introuvable')
  const updated = applyConsent(customer, { id: tx.id('k'), at: tx.at, ...change })
  tx.update((s) => ({ ...s, customers: upsert(s.customers, updated) }))
  if (updated.optOut !== customer.optOut) {
    tx.journal('decision', updated.optOut ? 'Opposition (STOP) enregistrée : NOVIA n’initie plus rien de commercial.' : 'Réinscription explicite enregistrée.', { customerId })
    if (tx.ctx.has.crm) tx.enqueue('crm.optout', customerId, `crm:optout:${customerId}:${updated.consents.length}`)
  }
  return updated
}

/* ------------------------------------------------------------------ */
/* Voice, paiement, réglages, rappels                                   */
/* ------------------------------------------------------------------ */

export function logVoiceCall(tx: Tx, call: Omit<VoiceCall, 'id' | 'businessId'>): VoiceCall {
  const c: VoiceCall = { ...call, id: tx.id('call'), businessId: tx.state.businessId }
  tx.update((s) => ({ ...s, calls: [c, ...s.calls] }))
  return c
}

/** Paiement : fictif (démo), déclaré par la pro, ou reçu en ligne. Seul le CA « confirmé » en dépend. */
export function recordPayment(tx: Tx, e: InputOf<'PaymentRecorded'>) {
  const a = tx.appointment(e.appointmentId)
  if (!a || a.status !== 'showed') throw new EngineError('Une preuve ne s’applique qu’à une prestation attestée.')
  const kind = e.method === 'demo' ? ('demo_payment' as const) : e.method
  const proof = { kind, amount: e.amount ?? a.price, at: tx.at, ...(e.externalRefs?.[0] ? { externalRef: e.externalRefs[0] } : {}) }
  tx.update((s) => ({ ...s, appointments: s.appointments.map((x) => (x.id === a.id ? { ...x, paymentProof: proof } : x)) }))
  return proof
}

export function changeSettings(tx: Tx, e: InputOf<'SettingsChanged'>) {
  if (e.settings) {
    const cur = tx.state.settings
    const p = e.settings
    const next = {
      automations: { ...cur.automations, ...p.automations },
      sendWindow: { ...cur.sendWindow, ...p.sendWindow },
      channels: { ...cur.channels, ...p.channels },
    }
    if (next.sendWindow.start >= next.sendWindow.end) throw new EngineError('La fin de la plage d’envoi doit être après le début.')
    // avis et parrainage : workflows à concevoir, non activables
    if (next.automations.reviews || next.automations.referral) throw new EngineError('Cette automatisation n’est pas encore disponible.')
    tx.update((s) => ({ ...s, settings: next }))
  }
  if (e.voice) {
    tx.update((s) => ({ ...s, voice: { ...s.voice, ...e.voice } }))
    if (tx.ctx.has.voice) tx.enqueue('voice.configure', 'voice', `voice:configure:${e.source}:${e.eventId}`)
  }
  return tx.state.settings
}

/** Rappel W02 dû : message de service, jamais pour un RDV annulé, reporté ou passé. */
export function sendReminder(tx: Tx, appointmentId: string, hoursBefore: number) {
  const a = tx.appointment(appointmentId)
  if (!a || !isActiveBooking(a.status) || new Date(a.start).getTime() <= tx.now.getTime()) {
    tx.journal('decision', 'Rappel devenu sans objet : rien n’est envoyé.', { appointmentId })
    return undefined
  }
  const customer = tx.customer(a.customerId)!
  if (!customer.consent.transactional) {
    tx.journal('blocked', 'Rappel bloqué : pas de consentement aux messages de service.', { customerId: customer.id, appointmentId })
    return undefined
  }
  const service = serviceOf(tx.profile, a.serviceId)
  return tx.message({
    key: `W02:reminder:${a.id}:${hoursBefore}h:${a.start}`,
    template: 'W02.reminder',
    vars: { business: tx.profile.identity.name.value, service: service?.name ?? 'rendez-vous', when: tx.when(new Date(a.start)), firstName: customer.firstName },
    customer,
    appointmentId: a.id,
    purpose: `W02 · rappel ${hoursBefore} h`,
    requires: [tx.profile.rules.status, tx.profile.identity.name.status],
  })
}

/** Rappels W02 arrivés à échéance et pas encore décidés (l'ordonnanceur les déclenche). */
export function dueReminders(state: NoviaState, rules: WorkflowRules, now: Date) {
  const due: { appointmentId: string; hoursBefore: number }[] = []
  for (const a of state.appointments) {
    if (!isActiveBooking(a.status)) continue
    const start = new Date(a.start).getTime()
    if (start <= now.getTime()) continue
    for (const h of rules.w02.remindersHoursBefore) {
      const key = `W02:reminder:${a.id}:${h}h:${a.start}`
      if (start - h * 3_600_000 <= now.getTime() && !state.messages.some((m) => m.idempotencyKey === key)) due.push({ appointmentId: a.id, hoursBefore: h })
    }
  }
  return due
}

/** Statut de livraison rapporté par la messagerie. */
export function applyDeliveryUpdate(tx: Tx, e: InputOf<'MessageDeliveryUpdated'>) {
  const entry = tx.state.outbox.find((o) => o.key === e.outboxKey)
  if (!entry) throw new EngineError('Envoi inconnu')
  // désordre fournisseur : un statut « moins avancé » arrivant après « delivered » est ignoré
  const current = tx.state.messages.find((m) => m.id === entry.ref)
  if (current?.status === 'delivered' && e.status !== 'delivered') {
    tx.journal('stale', `Statut de livraison ${e.status} reçu après « delivered » : ignoré.`)
    return
  }
  tx.update((s) => ({
    ...s,
    outbox: s.outbox.map((o) => (o.key === entry.key ? { ...o, status: e.status === 'failed' ? 'failed' : 'done' } : o)),
    messages: s.messages.map((m) => (m.id === entry.ref ? { ...m, status: e.status } : m)),
  }))
  tx.journal('delivery', `Livraison ${e.status}${e.error ? ` : ${e.error}` : ''}.`)
}

/* ------------------------------------------------------------------ */
/* Aiguillage                                                           */
/* ------------------------------------------------------------------ */

const attendanceOutcome = (attended: boolean): ValidationOutcome => (attended ? 'present' : 'absent')

/** Applique UNE entrée à la transaction. Lève EngineError (refus métier lisible). */
export function decide(tx: Tx, input: NoviaInput): unknown {
  switch (input.type) {
    case 'ContactUpserted':
      return upsertContact(tx, input.contact, input.leadSource)
    case 'BookingCreated':
      return createBooking(tx, input)
    case 'AttendanceRecorded':
      return recordOutcome(tx, input.appointmentId, attendanceOutcome(input.attended), input.statusSource)
    case 'BookingCancelled':
      return recordOutcome(tx, input.appointmentId, 'cancelled', input.statusSource)
    case 'BookingRescheduled':
      return recordOutcome(tx, input.appointmentId, 'rescheduled', input.statusSource, new Date(input.newStart))
    case 'InboundMessageReceived':
      return receiveInbound(tx, input)
    case 'MessageDeliveryUpdated':
      return applyDeliveryUpdate(tx, input)
    case 'ConsentChanged':
      return changeConsent(tx, input.customerId, input.change)
    case 'HumanTakeoverChanged':
      return setHumanTakeover(tx, input.customerId, input.value)
    case 'VoiceCallCompleted':
      return logVoiceCall(tx, input.call)
    case 'PaymentRecorded':
      return recordPayment(tx, input)
    case 'OpportunityClosed':
      return closeOpportunity(tx, input)
    case 'SettingsChanged':
      return changeSettings(tx, input)
    case 'SequenceStepDue':
      return advanceSequence(tx, input.runId)
    case 'ReminderDue':
      return sendReminder(tx, input.appointmentId, input.hoursBefore)
    case 'LaunchSmartFill':
      return launchSmartFill(tx, input.opportunityId)
    case 'ReplyAsPro':
      return replyAsPro(tx, input.conversationId, input.body)
    case 'OpenConversation':
      return openConversation(tx, input.customerId, input.channel)
    case 'MarkConversationRead':
      return markRead(tx, input.conversationId)
  }
}
