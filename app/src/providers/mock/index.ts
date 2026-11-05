/**
 * Implémentations MOCK des providers NOVIA + contrôles de démonstration.
 * Rien n'est envoyé, appelé ni encaissé : tout est simulé localement.
 * L'interface utilisateur n'importe jamais ce fichier : elle passe par src/domain.
 */
import { business } from '../../config/business.demo'
import { rules } from '../../config/rules.demo'
import { serviceById, services } from '../../config/services.demo'
import { applyValidation, isActiveBooking } from '../../core/appointmentStatus'
import { availableSlots, findDuplicate, isSlotFree } from '../../core/availability'
import { computeRevenue } from '../../core/revenue'
import { smartFillFunnel } from '../../core/smartfill'
import type { Appointment, AttributionSource, Customer, Opportunity, WorkflowRun } from '../../core/types'
import {
  advanceRecovery,
  declineRecovery,
  evaluateGuards,
  markRecovered,
  reminderTimes,
  startRecovery,
  stopObsoleteRuns,
} from '../../core/workflows'
import type {
  AnalyticsProvider,
  AutomationProvider,
  BookingInput,
  BookingProvider,
  CRMProvider,
  DemoControls,
  MessagingProvider,
  PaymentProvider,
  Providers,
  SimulatedMessage,
  SyncProvider,
  VoiceProvider,
} from '../types'
import { demoClock, getState, nextId, resetDemo, setState, subscribe } from './store'

const now = () => demoClock.now()
const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]
const fullName = (c?: Customer) => (c ? `${c.firstName} ${c.lastName}` : 'Cliente')
const fmtDateTime = (d: Date) =>
  d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/* ------------------------------------------------------------------ */
/* Messaging (simulé)                                                   */
/* ------------------------------------------------------------------ */

export const MockMessagingProvider: MessagingProvider = {
  simulateSend(msg) {
    const m: SimulatedMessage = { ...msg, id: nextId('m'), at: now().toISOString() }
    setState((s) => ({ ...s, messages: [m, ...s.messages].slice(0, 50) }))
    return m
  },
  listSimulated: () => getState().messages,
}

/* ------------------------------------------------------------------ */
/* CRM                                                                  */
/* ------------------------------------------------------------------ */

export const MockCRMProvider: CRMProvider = {
  listCustomers: () => getState().customers,
  getCustomer: (id) => getState().customers.find((c) => c.id === id),
  upsertContact(contact, source) {
    const existing = findDuplicate(getState().customers, contact)
    const t = now().toISOString()
    if (existing) {
      const updated = { ...existing, lastActivityAt: t }
      setState((s) => ({ ...s, customers: upsert(s.customers, updated) }))
      return updated
    }
    const c: Customer = {
      id: nextId('c'),
      ...contact,
      source,
      createdAt: t,
      lifecycle: 'prospect',
      consent: { transactional: true, marketing: false },
      optOut: false,
      humanTakeover: false,
      lastActivityAt: t,
    }
    setState((s) => ({ ...s, customers: [...s.customers, c] }))
    return c
  },
  setHumanTakeover(customerId, value) {
    const t = now()
    setState((s) => {
      const customers = s.customers.map((c) => (c.id === customerId ? { ...c, humanTakeover: value } : c))
      if (!value) return { ...s, customers }
      // reprise humaine : les séquences en cours s'arrêtent au contrôle suivant, ici immédiatement
      const customer = customers.find((c) => c.id === customerId)!
      const runs = s.runs.map((r) =>
        r.customerId === customerId && r.state === 'active'
          ? advanceRecovery(r, { customer, appointments: s.appointments, runs: s.runs, now: t, rules, sourceAppointment: s.appointments.find((a) => a.id === r.appointmentId) })
          : r,
      )
      return { ...s, customers, runs }
    })
  },
}

/* ------------------------------------------------------------------ */
/* Booking                                                              */
/* ------------------------------------------------------------------ */

function insertAppointment(
  customer: Customer,
  serviceId: string,
  start: Date,
  origin: Appointment['bookingOrigin'],
  attribution: AttributionSource,
): Appointment {
  const s = serviceById(serviceId)!
  const id = nextId('a')
  const a: Appointment = {
    id,
    ref: id.toUpperCase(),
    customerId: customer.id,
    serviceId,
    start: start.toISOString(),
    durationMin: s.durationMin,
    price: s.price,
    deposit: s.deposit,
    status: 'booked',
    bookingOrigin: origin,
    attribution,
    history: [],
  }
  setState((st) => ({
    ...st,
    appointments: [...st.appointments, a],
    customers: st.customers.map((c) => (c.id === customer.id ? { ...c, lifecycle: 'client' } : c)),
  }))
  // W02 : confirmation immédiate + rappels configurés — SIMULÉS
  MockMessagingProvider.simulateSend({
    to: fullName(customer),
    channel: 'sms',
    purpose: 'W02 · confirmation',
    body: `${business.name.value} — votre ${s.name} est réservé ${fmtDateTime(start)}.`,
  })
  return a
}

/** Si la cliente avait une récupération en cours, la réservation la clôt (STOP → W02). */
function closeRecoveriesOnBooking(customerId: string, appointment: Appointment): AttributionSource | null {
  const t = now()
  const st = getState()
  const active = st.runs.filter((r) => r.customerId === customerId && r.state === 'active' && (r.workflow === 'W03' || r.workflow === 'W04'))
  if (!active.length) return null
  const run = active[0]
  const attribution: AttributionSource = run.workflow === 'W04' ? 'noshow_recovery' : 'cancellation_recovery'
  setState((s) => ({
    ...s,
    runs: s.runs.map((r) => (active.some((x) => x.id === r.id) ? markRecovered(r, t) : r)),
    opportunities: s.opportunities.map((o) =>
      o.status === 'open' && o.sourceAppointmentId === run.appointmentId && o.kind !== 'smartfill'
        ? { ...o, status: 'won', resultAppointmentId: appointment.id }
        : o,
    ),
    appointments: s.appointments.map((a) => (a.id === appointment.id ? { ...a, attribution } : a)),
    customers: s.customers.map((c) => (c.id === customerId && run.workflow === 'W04' ? { ...c, noShowRecovered: true } : c)),
  }))
  return attribution
}

export const MockBookingProvider: BookingProvider = {
  listServices: () => services.filter((s) => s.active),
  getSlots(day, serviceId) {
    const s = serviceById(serviceId)
    if (!s) return []
    return availableSlots(day, s.durationMin, business.openingHours.value, getState().appointments, now())
  },
  listAppointments: () => getState().appointments,
  createBooking(input: BookingInput) {
    const service = serviceById(input.serviceId)
    if (!service) throw new Error('Prestation inconnue')
    if (!isSlotFree(input.start, service.durationMin, getState().appointments)) throw new Error('Ce créneau vient d’être réservé. Choisissez-en un autre.')
    const isNew = !findDuplicate(getState().customers, input.contact)
    const customer = MockCRMProvider.upsertContact(input.contact, input.source)
    const attribution: AttributionSource = isNew ? (input.source === 'referral' ? 'referral' : 'acquisition') : 'direct'
    const a = insertAppointment(customer, input.serviceId, input.start, input.origin, attribution)
    const recovered = closeRecoveriesOnBooking(customer.id, a)
    return recovered ? { ...a, attribution: recovered } : a
  },
  validate(appointmentId, outcome, opts) {
    const t = now()
    const st = getState()
    const a = st.appointments.find((x) => x.id === appointmentId)
    if (!a) throw new Error('Rendez-vous introuvable')
    const newId = outcome === 'rescheduled' ? nextId('a') : undefined
    const res = applyValidation(a, {
      outcome,
      source: opts.source,
      at: t,
      newStart: opts.newStart,
      newId,
      newRef: newId?.toUpperCase(),
    })
    const customer = st.customers.find((c) => c.id === a.customerId)!

    setState((s) => {
      let appointments = s.appointments.map((x) => (x.id === a.id ? res.updated : x))
      if (res.created) appointments = [...appointments, res.created]
      // correction : les workflows devenus incompatibles sont stoppés
      const runs = stopObsoleteRuns(s.runs, res.updated, t)
      const stoppedIds = new Set(runs.filter((r, i) => r !== s.runs[i]).map((r) => r.appointmentId))
      const opportunities = s.opportunities.map((o) =>
        o.status === 'open' && o.kind !== 'smartfill' && stoppedIds.has(o.sourceAppointmentId)
          ? { ...o, status: 'lost' as const }
          : o,
      )
      return { ...s, appointments, runs, opportunities }
    })

    const s = serviceById(a.serviceId)!
    const newOpps: Opportunity[] = []
    let newRun: WorkflowRun | undefined

    if (outcome === 'absent') {
      newRun = startRecovery('W04', res.updated, rules, t)
      newOpps.push({ id: nextId('o'), kind: 'noshow_recovery', amount: a.price, status: 'open', createdAt: t.toISOString(), sourceAppointmentId: a.id })
    }
    if (outcome === 'cancelled') {
      newRun = startRecovery('W03', res.updated, rules, t)
      // W03 : vérification immédiate (nouveau RDV, opposition, reprise humaine…)
      const g = evaluateGuards({
        customer,
        appointments: getState().appointments,
        runs: getState().runs,
        now: t,
        rules,
        workflow: 'W03',
        sourceAppointment: res.updated,
      })
      if (g.kind === 'stop') newRun = advanceRecovery(newRun, { customer, appointments: getState().appointments, runs: [], now: t, rules, sourceAppointment: res.updated })
      else newOpps.push({ id: nextId('o'), kind: 'cancellation_recovery', amount: a.price, status: 'open', createdAt: t.toISOString(), sourceAppointmentId: a.id })
      // le créneau libéré peut alimenter SmartFill
      if (new Date(a.start).getTime() > t.getTime()) {
        newOpps.push({ id: nextId('o'), kind: 'smartfill', amount: a.price, status: 'open', createdAt: t.toISOString(), sourceAppointmentId: a.id, slotStart: a.start, slotDurationMin: a.durationMin })
      }
    }
    if (outcome === 'rescheduled' && res.created) {
      const times = reminderTimes(res.created, rules, t)
      MockMessagingProvider.simulateSend({
        to: fullName(customer),
        channel: 'sms',
        purpose: 'W02 · déplacement',
        body: `Votre ${s.name} est déplacé au ${fmtDateTime(new Date(res.created.start))}. ${times.length} rappel(s) recalculé(s), anciens rappels annulés.`,
      })
    }

    setState((st2) => ({
      ...st2,
      runs: newRun ? [...st2.runs, newRun] : st2.runs,
      opportunities: [...st2.opportunities, ...newOpps],
    }))
    return getState().appointments.find((x) => x.id === (res.created?.id ?? a.id))!
  },
}

/* ------------------------------------------------------------------ */
/* Voice, Payment, Analytics                                            */
/* ------------------------------------------------------------------ */

export const MockVoiceProvider: VoiceProvider = {
  getSettings: () => getState().voice,
  setSettings: (v) => setState((s) => ({ ...s, voice: { ...s.voice, ...v } })),
}

export const MockPaymentProvider: PaymentProvider = {
  recordDemoPayment(appointmentId) {
    const a = getState().appointments.find((x) => x.id === appointmentId)
    if (!a || a.status !== 'showed') throw new Error('Une preuve ne s’applique qu’à une prestation attestée.')
    const proof = { kind: 'demo_payment' as const, amount: a.price, at: now().toISOString() }
    setState((s) => ({ ...s, appointments: s.appointments.map((x) => (x.id === a.id ? { ...x, paymentProof: proof } : x)) }))
    return proof
  },
}

export const MockAnalyticsProvider: AnalyticsProvider = {
  getRevenue: (period) => computeRevenue(getState().appointments, getState().opportunities, period),
}

export const MockSyncProvider: SyncProvider = {
  getSnapshot: () => getState(),
  subscribe: (l) => {
    const off = subscribe(l)
    return () => void off()
  },
}

/* ------------------------------------------------------------------ */
/* Moteur de démonstration : séquences W03 / W04 et SmartFill           */
/* ------------------------------------------------------------------ */

export const engine = {
  advance(runId: string) {
    const t = now()
    const st = getState()
    const run = st.runs.find((r) => r.id === runId)
    if (!run) return
    const customer = st.customers.find((c) => c.id === run.customerId)!
    const source = st.appointments.find((a) => a.id === run.appointmentId)
    const next = advanceRecovery(run, { customer, appointments: st.appointments, runs: st.runs, now: t, rules, sourceAppointment: source })
    if (next.messagesSent > run.messagesSent) {
      MockMessagingProvider.simulateSend({
        to: fullName(customer),
        channel: 'sms',
        purpose: `${run.workflow} · ${next.messagesSent === 1 ? 'récupération' : 'dernière relance'}`,
        body:
          run.workflow === 'W04'
            ? `Bonjour ${customer.firstName}, nous ne vous avons pas vue aujourd’hui, j’espère que tout va bien. Souhaitez-vous un nouveau créneau ?`
            : `Bonjour ${customer.firstName}, votre rendez-vous a bien été annulé. Voulez-vous en reprendre un autre ?`,
      })
    }
    const lost = next.state !== 'active' && next.outcome !== 'recovered'
    setState((s) => ({
      ...s,
      runs: upsert(s.runs, next),
      opportunities: lost
        ? s.opportunities.map((o) => (o.status === 'open' && o.kind !== 'smartfill' && o.sourceAppointmentId === run.appointmentId ? { ...o, status: 'lost' } : o))
        : s.opportunities,
    }))
  },

  decline(runId: string) {
    const t = now()
    const run = getState().runs.find((r) => r.id === runId)
    if (!run) return
    setState((s) => ({
      ...s,
      runs: upsert(s.runs, declineRecovery(run, t)),
      opportunities: s.opportunities.map((o) =>
        o.status === 'open' && o.kind !== 'smartfill' && o.sourceAppointmentId === run.appointmentId ? { ...o, status: 'lost' } : o,
      ),
    }))
  },

  /** Simule : la cliente répond et réserve le prochain créneau disponible. */
  clientRebooks(runId: string) {
    const st = getState()
    const run = st.runs.find((r) => r.id === runId)
    if (!run || run.state !== 'active') return
    const customer = st.customers.find((c) => c.id === run.customerId)!
    const source = st.appointments.find((a) => a.id === run.appointmentId)!
    const start = firstAvailableSlot(source.serviceId)
    if (!start) return
    const a = insertAppointment(customer, source.serviceId, start, 'recovery', 'direct')
    closeRecoveriesOnBooking(customer.id, a)
    return getState().appointments.find((x) => x.id === a.id)
  },

  smartFillFunnel(opportunityId: string) {
    const st = getState()
    const o = st.opportunities.find((x) => x.id === opportunityId)
    if (!o?.slotStart) return null
    return smartFillFunnel({
      slotStart: new Date(o.slotStart),
      slotDurationMin: o.slotDurationMin ?? 60,
      customers: st.customers,
      appointments: st.appointments,
      waitlist: st.waitlist,
      services,
      now: now(),
    })
  },

  /** Simulation : la première cliente contactable qui répond récupère le créneau. */
  smartFillBook(opportunityId: string) {
    const funnel = engine.smartFillFunnel(opportunityId)
    const o = getState().opportunities.find((x) => x.id === opportunityId)
    if (!funnel || !o?.slotStart || o.status !== 'open' || !funnel.contactable.length) return null
    const winner = funnel.contactable[0]
    const wl = getState().waitlist.find((w) => w.customerId === winner.id)
    const serviceId = wl?.serviceId ?? 'remplissage'
    // le créneau a pu être repris entre-temps (réservation directe) : jamais de double réservation
    if (!isSlotFree(new Date(o.slotStart), serviceById(serviceId)?.durationMin ?? o.slotDurationMin ?? 60, getState().appointments)) return null
    const a = insertAppointment(winner, serviceId, new Date(o.slotStart), 'smartfill', 'smartfill')
    setState((s) => ({
      ...s,
      opportunities: s.opportunities.map((x) => (x.id === o.id ? { ...x, status: 'won', resultAppointmentId: a.id } : x)),
      waitlist: s.waitlist.filter((w) => w.customerId !== winner.id),
    }))
    return { appointment: a, customer: winner, funnel }
  },
}

function firstAvailableSlot(serviceId: string): Date | undefined {
  const d = now()
  for (let i = 1; i < 21; i++) {
    const day = new Date(d)
    day.setDate(d.getDate() + i)
    const slots = MockBookingProvider.getSlots(day, serviceId)
    if (slots.length) return slots[Math.min(2, slots.length - 1)]
  }
  return undefined
}

export const MockAutomationProvider: AutomationProvider = {
  previewSmartFill: (id) => engine.smartFillFunnel(id),
  launchSmartFill: (id) => engine.smartFillBook(id),
  closeSmartFill(id) {
    setState((s) => ({
      ...s,
      opportunities: s.opportunities.map((o) => (o.id === id && o.kind === 'smartfill' && o.status === 'open' ? { ...o, status: 'lost' } : o)),
    }))
  },
}

export const MockDemoControls: DemoControls = {
  advanceRecovery: (id) => engine.advance(id),
  clientDeclines: (id) => engine.decline(id),
  clientRebooks: (id) => engine.clientRebooks(id),
  reset: resetDemo,
}

export const providers: Providers = {
  clock: demoClock,
  sync: MockSyncProvider,
  automation: MockAutomationProvider,
  demo: MockDemoControls,
  booking: MockBookingProvider,
  crm: MockCRMProvider,
  messaging: MockMessagingProvider,
  voice: MockVoiceProvider,
  payment: MockPaymentProvider,
  analytics: MockAnalyticsProvider,
}

export const activeBookingsCount = () => getState().appointments.filter((a) => isActiveBooking(a.status)).length
