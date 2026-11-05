/**
 * Lectures du cockpit NOVIA Pro : fonctions pures qui transforment un instantané
 * métier (NoviaSnapshot) en vues prêtes à afficher. Aucune dépendance à React ni à
 * une implémentation de provider.
 */
import type { ServiceConfig } from '../config/schema'
import { attendanceState, isActiveBooking, isAwaitingValidation, noShowCounts } from '../core/appointmentStatus'
import type { RevenueReport } from '../core/revenue'
import { refillsDue } from '../core/smartfill'
import type { Appointment, AttributionSource, Customer, Opportunity, WorkflowAction, WorkflowId, WorkflowRun } from '../core/types'
import type { NoviaSnapshot } from '../providers/types'

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

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

export function buildToday(snap: Pick<NoviaSnapshot, 'appointments' | 'customers'>, now: Date): TodayItem[] {
  const items = snap.appointments
    .filter((a) => sameDay(new Date(a.start), now) && a.status !== 'rescheduled')
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
  kind: WorkflowAction['kind'] | 'message'
  label: string
  who?: string
  workflow?: WorkflowId
  appointmentId?: string
}

export function buildFeed(snap: Pick<NoviaSnapshot, 'runs' | 'messages' | 'customers'>, limit = 6): FeedItem[] {
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
  return [...fromRuns, ...fromMessages].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

/* ------------------------------------------------------------------ */
/* Cockpit                                                              */
/* ------------------------------------------------------------------ */

const noviaSources: AttributionSource[] = ['smartfill', 'cancellation_recovery', 'noshow_recovery']

export interface CockpitView {
  today: TodayItem[]
  /** présences à confirmer, toutes dates, les plus anciennes en dernier */
  toConfirm: Appointment[]
  freedSlots: Opportunity[]
  recoveries: { active: WorkflowRun[]; recoveredThisMonth: number }
  revenue: {
    /** CA réservé des RDV du jour (hors annulés / absents) */
    bookedToday: number
    /** opportunités ouvertes : ce que NOVIA peut encore récupérer */
    toRecover: number
    /** revenu du mois attribué à NOVIA (SmartFill + récupérations), réservé ou confirmé */
    noviaThisMonth: number
    month: RevenueReport['totals']
  }
  takenOver: Customer[]
  feed: FeedItem[]
}

export function buildCockpit(snap: NoviaSnapshot, now: Date, revenue: { all: RevenueReport; month: RevenueReport }): CockpitView {
  const today = buildToday(snap, now)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return {
    today,
    toConfirm: snap.appointments.filter((a) => isAwaitingValidation(a, now)).sort((a, b) => b.start.localeCompare(a.start)),
    freedSlots: snap.opportunities
      .filter((o) => o.kind === 'smartfill' && o.status === 'open' && o.slotStart && new Date(o.slotStart).getTime() > now.getTime())
      .sort((a, b) => a.slotStart!.localeCompare(b.slotStart!)),
    recoveries: {
      active: snap.runs.filter((r) => r.state === 'active').sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      recoveredThisMonth: snap.runs.filter((r) => r.outcome === 'recovered' && r.endedAt && new Date(r.endedAt).getTime() >= monthStart).length,
    },
    revenue: {
      bookedToday: today
        .filter((i) => isActiveBooking(i.appointment.status) || i.appointment.status === 'showed')
        .reduce((s, i) => s + i.appointment.price, 0),
      toRecover: revenue.all.totals.potential,
      noviaThisMonth: noviaSources.reduce((s, k) => s + revenue.month.bySource[k].booked + revenue.month.bySource[k].confirmed, 0),
      month: revenue.month.totals,
    },
    takenOver: snap.customers.filter((c) => c.humanTakeover),
    feed: buildFeed(snap),
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
    contactable: !customer.optOut && customer.consent.marketing && !customer.humanTakeover,
    refill: refill ? { daysSince: refill.daysSince, recommended: refill.recommended } : undefined,
  }
}
