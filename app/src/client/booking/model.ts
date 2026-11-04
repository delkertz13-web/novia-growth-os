/**
 * Réservation — logique pure de présentation (aucun DOM, aucun provider), testée à part.
 */
import type { OpeningHours, ServiceConfig, WorkflowRules } from '../../config/schema'
import { reminderTimes } from '../../core/workflows'
import type { Appointment } from '../../core/types'

export type Step = 'service' | 'when' | 'contact' | 'recap'
export const steps: Step[] = ['service', 'when', 'contact', 'recap']

/** État d'un jour dans la bande de dates : fermé (horaires), complet, ou nombre de créneaux. */
export type DayState = { kind: 'closed' } | { kind: 'full' } | { kind: 'open'; count: number }

export function dayState(day: Date, hours: OpeningHours, slotCount: number): DayState {
  if (!hours[day.getDay()]) return { kind: 'closed' }
  if (slotCount === 0) return { kind: 'full' }
  return { kind: 'open', count: slotCount }
}

export const dayStateLabel = (s: DayState) => (s.kind === 'closed' ? 'Fermé' : s.kind === 'full' ? 'Complet' : `${s.count} dispo`)

export const slotEnd = (start: Date, durationMin: number) => new Date(start.getTime() + durationMin * 60_000)

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * Place de la pose choisie dans le parcours : grande au moment de choisir la date,
 * plus discrète ensuite, puis intégrée au récapitulatif. Jamais retirée brutalement.
 */
export type InspoSize = 'lg' | 'md' | 'sm'
export function inspoSize(step: Step): InspoSize {
  return step === 'when' ? 'lg' : step === 'contact' ? 'md' : 'sm'
}

/** Libellé d'acompte : toujours fictif, jamais prélevé. */
export function depositLabel(s: Pick<ServiceConfig, 'deposit'>, eur: (n: number) => string) {
  return s.deposit > 0 ? `${eur(s.deposit)} · fictif, non prélevé` : 'Aucun'
}

/**
 * Ce que NOVIA ferait après la réservation (W02) : confirmation immédiate puis
 * un rappel par délai configuré dans les règles de démonstration. Un rappel dont
 * l'heure est déjà passée (RDV trop proche) est marqué « non programmé ».
 */
export interface FollowUp {
  key: string
  label: string
  at: Date | null
  state: 'done' | 'scheduled' | 'skipped'
}

export function followUps(a: Appointment, rules: WorkflowRules, now: Date): FollowUp[] {
  const upcoming = reminderTimes(a, rules, now).map((d) => d.getTime())
  const start = new Date(a.start).getTime()
  const reminders = rules.w02.remindersHoursBefore.map((h): FollowUp => {
    const at = new Date(start - h * 3_600_000)
    return {
      key: `r${h}`,
      label: `Rappel ${h} h avant`,
      at,
      state: upcoming.includes(at.getTime()) ? 'scheduled' : 'skipped',
    }
  })
  return [{ key: 'confirmation', label: 'Confirmation', at: now, state: 'done' }, ...reminders]
}
