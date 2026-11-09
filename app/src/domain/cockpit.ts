/**
 * Lectures du cockpit NOVIA Pro : fonctions pures qui transforment un instantané
 * métier (NoviaSnapshot) en vues prêtes à afficher. Aucune dépendance à React ni à
 * une implémentation de provider.
 */
import type { ServiceConfig } from '../config/schema'
import { attendanceState, isActiveBooking, isAwaitingValidation, noShowCounts } from '../core/appointmentStatus'
import { appointmentLevel, type RevenueReport } from '../core/revenue'
import { isSlotFree } from '../core/availability'
import { refillsDue } from '../core/smartfill'
import type { Appointment, AttributionSource, Customer, Opportunity, WorkflowAction, WorkflowId, WorkflowRun } from '../core/types'
import type { NoviaSnapshot } from '../engine/model'
import { buildInbox, type InboxItem } from './conversations'
import { mayInitiateOutbound } from '../core/optout'
import { monthOf, sameDay } from '../core/time'
import { buildCustomerRows, type Segment } from './customers'

export const customerName = (c?: Pick<Customer, 'firstName' | 'lastName'>) => (c ? `${c.firstName} ${c.lastName}` : '—')

/* ------------------------------------------------------------------ */
/* Journée                                                              */
/* ------------------------------------------------------------------ */

export type TodayState = 'done' | 'absent' | 'cancelled' | 'to_confirm' | 'in_progress' | 'next' | 'upcoming'

export interface TodayItem {
  appointment: Appointment
  customer?: Customer
  state: TodayState
}

export function todayState(a: Appointment, now: Date): Exclude<TodayState, 'next'> {
  if (a.status === 'cancelled') return 'cancelled'
  if (a.status === 'no_show') return 'absent'
  if (a.status === 'showed' || a.status === 'completed') return 'done'
  if (isAwaitingValidation(a, now)) return 'to_confirm'
  return attendanceState(a, now) === 'in_progress' ? 'in_progress' : 'upcoming'
}

/** Journée du SALON (fuseau de l'entreprise), jamais celle de l'appareil. */
export function buildToday(snap: Pick<NoviaSnapshot, 'appointments' | 'customers'>, now: Date, timeZone: string): TodayItem[] {
  const items = snap.appointments
    .filter((a) => sameDay(new Date(a.start), now, timeZone) && a.status !== 'rescheduled')
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((a): TodayItem => ({ appointment: a, customer: snap.customers.find((c) => c.id === a.customerId), state: todayState(a, now) }))
  const next = items.find((i) => i.state === 'upcoming')
  if (next) next.state = 'next'
  return items
}

/* ------------------------------------------------------------------ */
/* Activité NOVIA                                                       */
/* ------------------------------------------------------------------ */

export interface FeedItem {
  id: string
  at: string
  /** win : NOVIA a obtenu un rendez-vous (Voice, SmartFill) */
  kind: WorkflowAction['kind'] | 'message' | 'win'
  label: string
  who?: string
  workflow?: WorkflowId
  appointmentId?: string
}

export function buildFeed(snap: Pick<NoviaSnapshot, 'runs' | 'messages' | 'customers'> & Partial<Pick<NoviaSnapshot, 'calls' | 'appointments'>>, limit = 6): FeedItem[] {
  const byId = (id: string) => snap.customers.find((c) => c.id === id)
  const fromRuns = snap.runs.flatMap((r) =>
    r.actions.map(
      (x, i): FeedItem => ({
        id: `${r.id}:${i}`,
        at: x.at,
        kind: x.kind,
        label: x.label,
        who: byId(r.customerId)?.firstName,
        workflow: r.workflow,
        appointmentId: r.appointmentId,
      }),
    ),
  )
  // les messages W02 (confirmations, déplacements) ne figurent pas dans les séquences
  const fromMessages = snap.messages
    .filter((m) => m.purpose.startsWith('W02'))
    .map((m): FeedItem => ({ id: m.id, at: m.at, kind: 'message', label: `${m.purpose.replace('W02 · ', 'Message de ')} (simulé)`, who: m.to.split(' ')[0], workflow: 'W02' }))
  // ce que NOVIA a obtenu : appels Voice et créneaux remplis par SmartFill
  const fromCalls = (snap.calls ?? [])
    .filter((c) => c.handledBy === 'novia' && (c.outcome === 'booked' || c.outcome === 'transferred'))
    .map((c): FeedItem => ({
      id: c.id,
      at: c.at,
      kind: c.outcome === 'booked' ? 'win' : 'blocked',
      label: c.outcome === 'booked' ? 'NOVIA Voice a pris un rendez-vous par téléphone (simulé)' : 'NOVIA Voice vous transfère un appel (simulé)',
      who: c.callerName.split(' ')[0],
      appointmentId: c.appointmentId,
    }))
  const fromSmartFill = (snap.appointments ?? [])
    .filter((a) => a.bookingOrigin === 'smartfill' && a.bookedAt)
    .map((a): FeedItem => ({ id: `sf-${a.id}`, at: a.bookedAt!, kind: 'win', label: 'NOVIA a rempli un créneau libéré (simulé)', who: byId(a.customerId)?.firstName, appointmentId: a.id }))
  return [...fromRuns, ...fromMessages, ...fromCalls, ...fromSmartFill].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

/* ------------------------------------------------------------------ */
/* Cockpit                                                              */
/* ------------------------------------------------------------------ */

/** RDV obtenus par NOVIA : SmartFill, récupérations, et (Lot 6) appels pris par NOVIA Voice. */
export const noviaSources: AttributionSource[] = ['smartfill', 'cancellation_recovery', 'noshow_recovery', 'voice']

/**
 * Trois niveaux, jamais mélangés : potentiel (pas encore regagné), réservé (rendez-vous
 * pris, pas encaissé), confirmé (prestation attestée + preuve de paiement).
 */
export interface CockpitRevenue {
  /** RDV du jour au niveau « réservé » (actifs, ou présence attestée sans preuve). */
  todayBooked: number
  /** RDV du jour au niveau « confirmé » (présence attestée + preuve de paiement). */
  todayConfirmed: number
  /** Potentiel : RDV perdus (absence, annulation) pas encore regagnés, toutes dates. */
  toRecover: number
  /** Ce mois (date du RDV) : RDV obtenus par NOVIA (SmartFill, récupérations, Voice), réservé + confirmé. */
  noviaWonThisMonth: number
  /** dont la part confirmée (prestation attestée + preuve). */
  noviaConfirmedThisMonth: number
}

export interface CockpitView {
  today: TodayItem[]
  /** présences à confirmer, toutes dates, les plus anciennes en dernier */
  toConfirm: Appointment[]
  freedSlots: Opportunity[]
  recoveries: { active: WorkflowRun[]; recoveredThisMonth: number }
  /** Indicateurs du panneau du jour. Définitions détaillées : src/domain/KPI.md */
  revenue: CockpitRevenue
  takenOver: Customer[]
  /** conversations où NOVIA attend une réponse de la professionnelle */
  needsReply: InboxItem[]
  feed: FeedItem[]
}

export function buildCockpit(snap: NoviaSnapshot, now: Date, revenue: { all: RevenueReport; month: RevenueReport }, timeZone: string): CockpitView {
  const today = buildToday(snap, now, timeZone)
  const monthStart = monthOf(now, timeZone).from.getTime()
  return {
    today,
    toConfirm: snap.appointments.filter((a) => isAwaitingValidation(a, now)).sort((a, b) => b.start.localeCompare(a.start)),
    freedSlots: snap.opportunities
      .filter(
        (o) =>
          o.kind === 'smartfill' &&
          o.status === 'open' &&
          !!o.slotStart &&
          new Date(o.slotStart).getTime() > now.getTime() &&
          // un créneau repris entre-temps n'est plus « libéré »
          isSlotFree(new Date(o.slotStart), o.slotDurationMin ?? 60, snap.appointments),
      )
      .sort((a, b) => a.slotStart!.localeCompare(b.slotStart!)),
    recoveries: {
      // une séquence en pause (reprise humaine) reste visible : elle n'est pas terminée
      active: snap.runs.filter((r) => r.state === 'active' || r.state === 'paused').sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      recoveredThisMonth: snap.runs.filter((r) => r.outcome === 'recovered' && r.endedAt && new Date(r.endedAt).getTime() >= monthStart).length,
    },
    revenue: cockpitRevenue(today, revenue),
    takenOver: snap.customers.filter((c) => c.humanTakeover),
    needsReply: buildInbox(snap).filter((i) => i.state === 'needs_human'),
    feed: buildFeed(snap),
  }
}

export function cockpitRevenue(today: TodayItem[], revenue: { all: RevenueReport; month: RevenueReport }): CockpitRevenue {
  const level = (l: 'booked' | 'confirmed') =>
    today.filter((i) => appointmentLevel(i.appointment) === l).reduce((s, i) => s + (l === 'confirmed' ? i.appointment.paymentProof!.amount : i.appointment.price), 0)
  const m = revenue.month.bySource
  return {
    todayBooked: level('booked'),
    todayConfirmed: level('confirmed'),
    toRecover: revenue.all.totals.potential,
    noviaWonThisMonth: noviaSources.reduce((s, k) => s + m[k].booked + m[k].confirmed, 0),
    noviaConfirmedThisMonth: noviaSources.reduce((s, k) => s + m[k].confirmed, 0),
  }
}

/* ------------------------------------------------------------------ */
/* Fiche cliente                                                        */
/* ------------------------------------------------------------------ */

export interface CustomerFile {
  customer: Customer
  appointments: Appointment[]
  upcoming?: Appointment
  runs: WorkflowRun[]
  noShows: ReturnType<typeof noShowCounts>
  /** total des prestations attestées */
  lifetimeValue: number
  /** NOVIA peut-elle la contacter pour du marketing (SmartFill, remplissage) ? */
  contactable: boolean
  /** remplissage conseillé, si la date approche */
  refill?: { daysSince: number; recommended: number }
  /** montants des RDV de la cliente, par niveau (jamais additionnés) */
  amounts: { booked: number; confirmed: number }
  cancellations: number
  segments: Segment[]
  conversation?: InboxItem
  calls: NoviaSnapshot['calls']
  /** dernière prestation attestée */
  lastService?: Appointment
}

export function buildCustomerFile(snap: NoviaSnapshot, customerId: string, now: Date, services: ServiceConfig[]): CustomerFile | null {
  const customer = snap.customers.find((c) => c.id === customerId)
  if (!customer) return null
  const appointments = snap.appointments.filter((a) => a.customerId === customerId).sort((a, b) => b.start.localeCompare(a.start))
  const refill = refillsDue([customer], snap.appointments, services, now)[0]
  return {
    customer,
    appointments,
    upcoming: [...appointments].reverse().find((a) => isActiveBooking(a.status) && new Date(a.start).getTime() > now.getTime()),
    runs: snap.runs.filter((r) => r.customerId === customerId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    noShows: noShowCounts(snap.appointments, customerId, now),
    lifetimeValue: appointments.filter((a) => a.status === 'showed').reduce((s, a) => s + a.price, 0),
    contactable: mayInitiateOutbound(customer),
    refill: refill ? { daysSince: refill.daysSince, recommended: refill.recommended } : undefined,
    amounts: {
      booked: appointments.filter((a) => appointmentLevel(a) === 'booked').reduce((s, a) => s + a.price, 0),
      confirmed: appointments.filter((a) => appointmentLevel(a) === 'confirmed').reduce((s, a) => s + a.paymentProof!.amount, 0),
    },
    cancellations: appointments.filter((a) => a.status === 'cancelled').length,
    segments: buildCustomerRows(snap, now, services).find((r) => r.customer.id === customerId)?.segments ?? [],
    conversation: buildInbox(snap).find((i) => i.conversation.customerId === customerId),
    calls: snap.calls.filter((c) => c.customerId === customerId).sort((a, b) => b.at.localeCompare(a.at)),
    lastService: appointments.find((a) => a.status === 'showed'),
  }
}
