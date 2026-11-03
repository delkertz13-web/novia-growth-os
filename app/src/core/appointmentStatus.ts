import type { Appointment, AppointmentStatus, StatusSource, ValidationOutcome, WorkflowId } from './types'

export const statusLabels: Record<AppointmentStatus, string> = {
  booked: 'Réservé',
  confirmed: 'RDV confirmé',
  showed: 'Présente',
  no_show: 'Absente',
  cancelled: 'Annulé',
  rescheduled: 'Reporté',
  completed: 'Terminé',
}

export const outcomeLabels: Record<ValidationOutcome, string> = {
  present: 'Présente',
  absent: 'Absente',
  cancelled: 'Annulée',
  rescheduled: 'Reportée',
}

const outcomeToStatus: Record<ValidationOutcome, AppointmentStatus> = {
  present: 'showed',
  absent: 'no_show',
  cancelled: 'cancelled',
  rescheduled: 'rescheduled',
}

export const appointmentEnd = (a: Pick<Appointment, 'start' | 'durationMin'>) =>
  new Date(new Date(a.start).getTime() + a.durationMin * 60_000)

/** Le RDV est encore « vivant » (occupe un créneau, compte comme réservé). */
export const isActiveBooking = (s: AppointmentStatus) => s === 'booked' || s === 'confirmed'

/**
 * Présence inconnue : l'heure est passée mais personne n'a validé.
 * L'heure passée n'est JAMAIS une preuve de présence ou d'absence.
 */
export function isAwaitingValidation(a: Appointment, now: Date): boolean {
  return isActiveBooking(a.status) && appointmentEnd(a).getTime() <= now.getTime()
}

export type AttendanceState = 'upcoming' | 'in_progress' | 'unknown' | 'validated' | 'closed'

export function attendanceState(a: Appointment, now: Date): AttendanceState {
  if (a.status === 'showed' || a.status === 'no_show' || a.status === 'completed') return 'validated'
  if (a.status === 'cancelled' || a.status === 'rescheduled') return 'closed'
  const t = now.getTime()
  if (t < new Date(a.start).getTime()) return 'upcoming'
  if (t < appointmentEnd(a).getTime()) return 'in_progress'
  return 'unknown'
}

/** Suite prévue par la spécification W02 pour chaque validation. */
export const nextWorkflowFor: Record<ValidationOutcome, WorkflowId> = {
  present: 'W05',
  absent: 'W04',
  cancelled: 'W03',
  rescheduled: 'W02',
}

export class ValidationError extends Error {}

export interface ValidationInput {
  outcome: ValidationOutcome
  source: StatusSource
  at: Date
  /** obligatoire pour un report */
  newStart?: Date
  newId?: string
  newRef?: string
}

export interface ValidationResult {
  updated: Appointment
  /** nouveau RDV créé en cas de report */
  created?: Appointment
  next: WorkflowId
  /** vrai si la validation corrige un statut déjà attesté */
  isCorrection: boolean
}

/**
 * Applique une validation Présente / Absente / Annulée / Reportée.
 * - Présente / Absente ne peuvent être déclarées qu'une fois le RDV commencé.
 * - Une correction ultérieure écrase l'état précédent (l'historique est conservé).
 * - Un report clôt l'ancien RDV et crée le nouveau, relié à l'initial.
 */
export function applyValidation(a: Appointment, input: ValidationInput): ValidationResult {
  const { outcome, source, at } = input
  if (a.status === 'rescheduled') {
    throw new ValidationError('Ce rendez-vous a été reporté : valider le nouveau rendez-vous.')
  }
  if ((outcome === 'present' || outcome === 'absent') && at.getTime() < new Date(a.start).getTime()) {
    throw new ValidationError('Présence ou absence ne peuvent être confirmées avant le début du rendez-vous.')
  }
  const to = outcomeToStatus[outcome]
  if (to === a.status) {
    throw new ValidationError('Ce statut est déjà enregistré.')
  }
  const isCorrection = a.status === 'showed' || a.status === 'no_show' || a.status === 'cancelled'
  const event = { at: at.toISOString(), from: a.status, to, source, note: isCorrection ? 'correction' : undefined }

  if (outcome === 'rescheduled') {
    if (!input.newStart || !input.newId) throw new ValidationError('Un report nécessite un nouveau créneau.')
    const created: Appointment = {
      ...a,
      id: input.newId,
      ref: input.newRef ?? input.newId,
      start: input.newStart.toISOString(),
      status: 'booked',
      rescheduledFromId: a.id,
      rescheduledToId: undefined,
      paymentProof: undefined,
      history: [{ at: at.toISOString(), from: 'booked', to: 'booked', source, note: `report de ${a.ref}` }],
    }
    return {
      updated: { ...a, status: 'rescheduled', rescheduledToId: created.id, history: [...a.history, event] },
      created,
      next: 'W02',
      isCorrection,
    }
  }

  return {
    updated: {
      ...a,
      status: to,
      // une absence ou annulation retire toute preuve de paiement de démonstration
      paymentProof: to === 'showed' ? a.paymentProof : undefined,
      history: [...a.history, event],
    },
    next: nextWorkflowFor[outcome],
    isCorrection,
  }
}

/** Compteurs no-show (W04) : NO_SHOW_COUNT_30D / 90D / TOTAL */
export function noShowCounts(appointments: Appointment[], customerId: string, now: Date) {
  const day = 86_400_000
  const ns = appointments.filter((a) => a.customerId === customerId && a.status === 'no_show')
  const within = (days: number) => ns.filter((a) => now.getTime() - new Date(a.start).getTime() <= days * day).length
  return { d30: within(30), d90: within(90), total: ns.length }
}
