/**
 * Timeline d'une cliente : ce qui s'est passé et ce que NOVIA a prévu.
 * Réservation → rappels → présence → prestation → paiement → satisfaction → relances → nouveau RDV.
 * Les rappels sont recalculés à partir des règles (aucun message réel n'existe en démo).
 */
import type { ServiceConfig, WorkflowRules } from '../config/schema'
import { isActiveBooking } from '../core/appointmentStatus'
import type { Appointment, BookingOrigin, VoiceCall, WorkflowRun } from '../core/types'
import type { NoviaSnapshot } from '../providers/types'

export type TimelineKind = 'booked' | 'reminder' | 'attendance' | 'service' | 'payment' | 'satisfaction' | 'followup' | 'cancelled' | 'call'

export interface TimelineEvent {
  id: string
  at: string
  kind: TimelineKind
  title: string
  detail?: string
  /** action de NOVIA (et non de la cliente ou de la professionnelle) */
  byNovia?: boolean
  appointmentId?: string
  callId?: string
}

export const originLabels: Record<BookingOrigin, string> = {
  site: 'Site',
  pro: 'Saisi par vous',
  voice: 'NOVIA Voice',
  smartfill: 'Créneau rempli par NOVIA',
  recovery: 'Récupération NOVIA',
}

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')
const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

function appointmentEvents(a: Appointment, rules: WorkflowRules, services: ServiceConfig[], isLastShowed: boolean): TimelineEvent[] {
  const name = services.find((s) => s.id === a.serviceId)?.name ?? 'Prestation'
  const when = `${day(a.start)} à ${hm(a.start)}`
  const out: TimelineEvent[] = []
  const id = (k: string) => `${a.id}:${k}`
  if (a.bookedAt) {
    const novia = a.bookingOrigin === 'voice' || a.bookingOrigin === 'smartfill' || a.bookingOrigin === 'recovery'
    out.push({ id: id('booked'), at: a.bookedAt, kind: 'booked', title: `Réservation · ${name}`, detail: `Pour le ${when} · ${originLabels[a.bookingOrigin]}`, byNovia: novia, appointmentId: a.id })
  }
  // rappels W02, pour les RDV qui ont eu (ou auront) lieu
  if (isActiveBooking(a.status) || a.status === 'showed' || a.status === 'no_show') {
    const start = new Date(a.start).getTime()
    const from = a.bookedAt ? new Date(a.bookedAt).getTime() : -Infinity
    rules.w02.remindersHoursBefore
      .map((h) => ({ h, at: start - h * 3_600_000 }))
      .filter((r) => r.at > from)
      .forEach((r) =>
        out.push({ id: id(`r${r.h}`), at: new Date(r.at).toISOString(), kind: 'reminder', title: `Rappel ${r.h} h avant`, detail: `${name} · SMS simulé`, byNovia: true, appointmentId: a.id }),
      )
  }
  const end = new Date(new Date(a.start).getTime() + a.durationMin * 60_000).toISOString()
  const statusAt = (to: Appointment['status']) => a.history.find((h) => h.to === to)?.at
  if (a.status === 'showed') {
    out.push({ id: id('service'), at: end, kind: 'service', title: `Prestation · ${name}`, detail: 'Présence attestée', appointmentId: a.id })
    if (isLastShowed) out.push({ id: id('sat'), at: end, kind: 'satisfaction', title: 'Satisfaction', detail: 'Demande d’avis : bientôt, rien n’est envoyé', appointmentId: a.id })
  }
  if (a.status === 'no_show') out.push({ id: id('ns'), at: statusAt('no_show') ?? a.start, kind: 'attendance', title: `Absente · ${name}`, detail: `RDV du ${when}`, appointmentId: a.id })
  if (a.status === 'cancelled') out.push({ id: id('cx'), at: statusAt('cancelled') ?? a.start, kind: 'cancelled', title: `Annulation · ${name}`, detail: `RDV du ${when}`, appointmentId: a.id })
  if (a.status === 'rescheduled') out.push({ id: id('rs'), at: statusAt('rescheduled') ?? a.start, kind: 'cancelled', title: `Report · ${name}`, detail: `Initialement le ${when}`, appointmentId: a.id })
  if (a.paymentProof) out.push({ id: id('pay'), at: a.paymentProof.at, kind: 'payment', title: 'Paiement attesté', detail: 'Preuve fictive (démo)', appointmentId: a.id })
  return out
}

function runEvents(r: WorkflowRun): TimelineEvent[] {
  const what = r.workflow === 'W04' ? 'Récupération absence' : r.workflow === 'W03' ? 'Récupération annulation' : r.workflow
  return r.actions
    .filter((x) => x.kind === 'message_simulated' || x.kind === 'stop' || (x.kind === 'blocked' && x.label.startsWith('En pause')))
    .map((x, i) => ({
      id: `${r.id}:${i}`,
      at: x.at,
      kind: 'followup' as const,
      title: x.kind === 'message_simulated' ? `Relance NOVIA · ${what}` : x.kind === 'stop' ? `${what} terminée` : `${what} en pause`,
      detail: x.label,
      byNovia: true,
      appointmentId: r.appointmentId,
    }))
}

const callEvent = (c: VoiceCall): TimelineEvent => ({
  id: c.id,
  at: c.at,
  kind: 'call',
  title: c.handledBy === 'novia' ? 'Appel pris par NOVIA Voice' : 'Appel pris par vous',
  detail: c.summary,
  byNovia: c.handledBy === 'novia',
  callId: c.id,
})

export interface Timeline {
  /** à venir, le plus proche d'abord */
  upcoming: TimelineEvent[]
  /** passé, le plus récent d'abord */
  history: TimelineEvent[]
}

export function buildTimeline(snap: NoviaSnapshot, customerId: string, now: Date, rules: WorkflowRules, services: ServiceConfig[]): Timeline {
  const mine = snap.appointments.filter((a) => a.customerId === customerId)
  const lastShowed = mine.filter((a) => a.status === 'showed').sort((a, b) => b.start.localeCompare(a.start))[0]
  const all = [
    ...mine.flatMap((a) => appointmentEvents(a, rules, services, a === lastShowed)),
    ...snap.runs.filter((r) => r.customerId === customerId).flatMap(runEvents),
    ...snap.calls.filter((c) => c.customerId === customerId).map(callEvent),
  ]
  // RDV à venir : affiché comme un repère, pas comme un événement passé
  const t = now.getTime()
  const future = mine
    .filter((a) => isActiveBooking(a.status) && new Date(a.start).getTime() > t)
    .map((a): TimelineEvent => ({ id: `${a.id}:visit`, at: a.start, kind: 'service', title: `Rendez-vous · ${services.find((s) => s.id === a.serviceId)?.name ?? ''}`, detail: originLabels[a.bookingOrigin], appointmentId: a.id }))
  const toConfirm = mine
    .filter((a) => isActiveBooking(a.status) && new Date(a.start).getTime() <= t)
    .map((a): TimelineEvent => ({ id: `${a.id}:confirm`, at: a.start, kind: 'attendance', title: 'Présence à confirmer', detail: services.find((s) => s.id === a.serviceId)?.name, appointmentId: a.id }))
  const events = [...all, ...future, ...toConfirm]
  return {
    upcoming: events.filter((e) => new Date(e.at).getTime() > t).sort((a, b) => a.at.localeCompare(b.at)),
    history: events.filter((e) => new Date(e.at).getTime() <= t).sort((a, b) => b.at.localeCompare(a.at)),
  }
}
