/**
 * Échéances que le moteur attend : rappels W02 (`ReminderDue`) et étapes des séquences
 * W03 / W04 (`SequenceStepDue`). Fonction PURE de l'état : le serveur la relit après chaque
 * transaction pour tenir sa table `scheduled_jobs` à jour (création, report, annulation
 * d'une échéance devenue sans objet). Au moment de l'exécution, le moteur revérifie toutes
 * les gardes : une échéance n'est qu'un réveil, jamais une autorisation d'envoyer.
 */
import type { WorkflowRules } from '../config/schema'
import { isActiveBooking } from '../core/appointmentStatus'
import { nextSendWindowStart } from '../core/workflows'
import type { NoviaState } from './model'

export type DueJob =
  | { key: string; kind: 'ReminderDue'; dueAt: Date; appointmentId: string; hoursBefore: number }
  | { key: string; kind: 'SequenceStepDue'; dueAt: Date; runId: string }

const HOUR = 3_600_000

/** Clé d'un rappel : la même que celle du message (un report change l'heure, donc la clé). */
export const reminderKey = (appointmentId: string, hoursBefore: number, start: string) => `W02:reminder:${appointmentId}:${hoursBefore}h:${start}`

export function expectedJobs(state: NoviaState, rules: WorkflowRules, timeZone: string, now: Date): DueJob[] {
  const jobs: DueJob[] = []
  const decided = new Set(state.messages.map((m) => m.idempotencyKey))

  for (const a of state.appointments) {
    if (!isActiveBooking(a.status)) continue
    const start = new Date(a.start).getTime()
    if (start <= now.getTime()) continue
    for (const h of rules.w02.remindersHoursBefore) {
      const key = reminderKey(a.id, h, a.start)
      if (!decided.has(key)) jobs.push({ key, kind: 'ReminderDue', dueAt: new Date(start - h * HOUR), appointmentId: a.id, hoursBefore: h })
    }
  }

  for (const run of state.runs) {
    if (run.state !== 'active' || (run.workflow !== 'W03' && run.workflow !== 'W04')) continue
    const r = run.workflow === 'W03' ? rules.w03 : rules.w04
    const lastMessage = [...run.actions].reverse().find((x) => x.kind === 'message_simulated')?.at ?? run.startedAt
    const base =
      run.step === 'wait' || run.step === 'recheck'
        ? new Date(run.startedAt).getTime() + r.waitBeforeRecoveryHours * HOUR
        : new Date(lastMessage).getTime() + r.lastFollowUpDelayHours * HOUR
    if (run.step === 'done') continue
    // jamais avant l'ouverture de la plage d'envoi (heure du salon)
    const dueAt = nextSendWindowStart(new Date(base), { ...rules.sendWindow, ...state.settings.sendWindow }, timeZone)
    jobs.push({ key: `seq:${run.id}:${run.step}:${run.messagesSent}`, kind: 'SequenceStepDue', dueAt, runId: run.id })
  }
  return jobs
}
