import type { WorkflowRules } from '../config/schema'
import { isActiveBooking } from './appointmentStatus'
import type { Appointment, Customer, WorkflowAction, WorkflowId, WorkflowRun } from './types'

/* ------------------------------------------------------------------ */
/* Plage d'envoi                                                        */
/* ------------------------------------------------------------------ */

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function isWithinSendWindow(at: Date, window: WorkflowRules['sendWindow']): boolean {
  const m = at.getHours() * 60 + at.getMinutes()
  return m >= toMinutes(window.start) && m < toMinutes(window.end)
}

/** Prochaine ouverture de la plage d'envoi (ou `at` si déjà dans la plage). */
export function nextSendWindowStart(at: Date, window: WorkflowRules['sendWindow']): Date {
  if (isWithinSendWindow(at, window)) return at
  const start = toMinutes(window.start)
  const d = new Date(at)
  const m = at.getHours() * 60 + at.getMinutes()
  if (m >= toMinutes(window.end)) d.setDate(d.getDate() + 1)
  d.setHours(Math.floor(start / 60), start % 60, 0, 0)
  return d
}

/* ------------------------------------------------------------------ */
/* Contrôles communs avant tout envoi                                   */
/* ------------------------------------------------------------------ */

export interface GuardContext {
  customer: Customer
  appointments: Appointment[]
  runs: WorkflowRun[]
  now: Date
  rules: WorkflowRules
  /** workflow qui demande l'envoi */
  workflow: WorkflowId
  /** run concerné (exclu du contrôle d'incompatibilité) */
  runId?: string
  /** RDV d'origine (annulé / absent) pour W03 / W04 */
  sourceAppointment?: Appointment
}

export type GuardDecision =
  | { kind: 'send' }
  | { kind: 'wait'; reason: string; until: Date }
  | { kind: 'stop'; reason: string; transition?: WorkflowId }

/** Workflows qui ne peuvent pas envoyer en même temps au même contact. */
const incompatible: Record<WorkflowId, WorkflowId[]> = {
  W01: ['W03', 'W04'],
  W02: [],
  W03: ['W01', 'W04'],
  W04: ['W01', 'W03'],
  W05: [],
  W12: [],
}

export function hasFutureBooking(appointments: Appointment[], customerId: string, now: Date, excludeId?: string) {
  return appointments.some(
    (a) =>
      a.customerId === customerId &&
      a.id !== excludeId &&
      isActiveBooking(a.status) &&
      new Date(a.start).getTime() > now.getTime(),
  )
}

/**
 * Relit l'état ACTUEL avant chaque action sensible (règles communes + W01 à W04).
 * L'ordre reflète la priorité : ce qui rend la séquence obsolète d'abord.
 */
export function evaluateGuards(ctx: GuardContext): GuardDecision {
  const { customer, appointments, runs, now, rules, workflow, sourceAppointment } = ctx

  // État du RDV d'origine encore valable ?
  if (workflow === 'W04' && sourceAppointment && sourceAppointment.status !== 'no_show') {
    return { kind: 'stop', reason: 'Le statut n’est plus « Absente » : la récupération est obsolète.' }
  }
  if (workflow === 'W03' && sourceAppointment && sourceAppointment.status !== 'cancelled') {
    return { kind: 'stop', reason: 'Le rendez-vous n’est plus annulé : la récupération est obsolète.' }
  }

  // Nouveau RDV déjà réservé → retour W02
  if (hasFutureBooking(appointments, customer.id, now)) {
    return { kind: 'stop', reason: 'Un nouveau rendez-vous existe déjà.', transition: 'W02' }
  }

  // W01 : déjà cliente
  if (workflow === 'W01' && customer.lifecycle === 'client') {
    return { kind: 'stop', reason: 'Contact déjà cliente : sortie de W01.' }
  }

  if (customer.optOut) return { kind: 'stop', reason: 'Opposition / STOP enregistrée.' }
  if (!customer.consent.transactional) return { kind: 'stop', reason: 'Contact non joignable (pas de consentement).' }
  if (customer.humanTakeover) return { kind: 'stop', reason: 'La professionnelle a repris la conversation.' }

  const blocking = runs.find(
    (r) =>
      r.id !== ctx.runId &&
      r.customerId === customer.id &&
      r.state === 'active' &&
      incompatible[workflow].includes(r.workflow),
  )
  if (blocking) {
    return { kind: 'wait', reason: `Workflow ${blocking.workflow} incompatible en cours.`, until: now }
  }

  if (!isWithinSendWindow(now, rules.sendWindow)) {
    return { kind: 'wait', reason: 'Hors plage d’envoi autorisée.', until: nextSendWindowStart(now, rules.sendWindow) }
  }
  return { kind: 'send' }
}

/* ------------------------------------------------------------------ */
/* W02 — rappels                                                        */
/* ------------------------------------------------------------------ */

/** Rappels encore à venir pour un RDV actif (recalculés à chaque déplacement). */
export function reminderTimes(a: Appointment, rules: WorkflowRules, now: Date): Date[] {
  if (!isActiveBooking(a.status)) return []
  const start = new Date(a.start).getTime()
  return rules.w02.remindersHoursBefore
    .map((h) => new Date(start - h * 3_600_000))
    .filter((d) => d.getTime() > now.getTime())
}

/* ------------------------------------------------------------------ */
/* W03 / W04 — séquence de récupération                                 */
/* ------------------------------------------------------------------ */

let seq = 0
const runId = (wf: WorkflowId) => `run-${wf}-${Date.now().toString(36)}-${(seq++).toString(36)}`

const act = (now: Date, kind: WorkflowAction['kind'], label: string): WorkflowAction => ({
  at: now.toISOString(),
  kind,
  label,
})

export function startRecovery(
  workflow: 'W03' | 'W04',
  source: Appointment,
  rules: WorkflowRules,
  now: Date,
): WorkflowRun {
  if (workflow === 'W04' && source.status !== 'no_show') {
    throw new Error('W04 ne démarre que sur une absence confirmée.')
  }
  if (workflow === 'W03' && source.status !== 'cancelled') {
    throw new Error('W03 ne démarre que sur une annulation confirmée.')
  }
  const wait = workflow === 'W03' ? rules.w03.waitBeforeRecoveryHours : rules.w04.waitBeforeRecoveryHours
  return {
    id: runId(workflow),
    workflow,
    customerId: source.customerId,
    appointmentId: source.id,
    state: 'active',
    step: 'wait',
    messagesSent: 0,
    startedAt: now.toISOString(),
    actions: [
      act(now, 'info', workflow === 'W03' ? 'Annulation confirmée : rappels W02 stoppés.' : 'Absence confirmée par la professionnelle.'),
      act(now, 'info', `Attente avant récupération : ${wait} h (paramètre démo).`),
    ],
  }
}

const stopRun = (run: WorkflowRun, now: Date, reason: string, outcome: string): WorkflowRun => ({
  ...run,
  state: outcome === 'recovered' ? 'completed' : 'stopped',
  step: 'done',
  endedAt: now.toISOString(),
  outcome,
  actions: [...run.actions, act(now, 'stop', reason)],
})

/**
 * Fait avancer une séquence W03 / W04 d'une étape, en relisant l'état actuel.
 * Aucun message n'est envoyé : les messages sont SIMULÉS.
 */
export function advanceRecovery(run: WorkflowRun, ctx: Omit<GuardContext, 'workflow' | 'runId'>): WorkflowRun {
  if (run.state !== 'active') return run
  const { now } = ctx
  const guard = evaluateGuards({ ...ctx, workflow: run.workflow, runId: run.id })

  if (guard.kind === 'stop') {
    const recovered = guard.transition === 'W02'
    return stopRun(run, now, `STOP — ${guard.reason}${recovered ? ' → W02' : ''}`, recovered ? 'recovered' : 'stopped')
  }
  if (guard.kind === 'wait') {
    return { ...run, actions: [...run.actions, act(now, 'blocked', `En attente — ${guard.reason}`)] }
  }

  const label = run.workflow === 'W04' ? 'non culpabilisant' : 'proposant une nouvelle réservation'
  switch (run.step) {
    case 'wait':
    case 'recheck':
      return {
        ...run,
        step: 'await_reply',
        messagesSent: run.messagesSent + 1,
        actions: [
          ...run.actions,
          act(now, 'check_ok', 'Revérification : statut, nouveau RDV, opposition, reprise humaine — OK.'),
          act(now, 'message_simulated', `Message de récupération ${label} (simulé, aucun envoi).`),
        ],
      }
    case 'await_reply':
      return {
        ...run,
        step: 'await_final',
        messagesSent: run.messagesSent + 1,
        actions: [
          ...run.actions,
          act(now, 'check_ok', 'Aucune réponse. Revérification — OK.'),
          act(now, 'message_simulated', 'Dernière relance (simulée).'),
        ],
      }
    case 'await_final':
      return stopRun(run, now, 'Aucune réponse après la dernière relance : STOP.', 'no_response')
    default:
      return run
  }
}

/** La cliente refuse : STOP immédiat. */
export const declineRecovery = (run: WorkflowRun, now: Date) =>
  run.state === 'active' ? stopRun(run, now, 'Refus de la cliente : STOP.', 'declined') : run

/** La cliente réserve : STOP et retour W02. */
export const markRecovered = (run: WorkflowRun, now: Date) =>
  run.state === 'active' ? stopRun(run, now, 'Nouveau rendez-vous réservé : STOP → W02.', 'recovered') : run

/**
 * Correction de statut : l'état actuel écrase l'ancien,
 * les workflows devenus incompatibles sont stoppés.
 */
export function stopObsoleteRuns(runs: WorkflowRun[], appointment: Appointment, now: Date): WorkflowRun[] {
  return runs.map((r) => {
    if (r.state !== 'active' || r.appointmentId !== appointment.id) return r
    const stillValid =
      (r.workflow === 'W04' && appointment.status === 'no_show') ||
      (r.workflow === 'W03' && appointment.status === 'cancelled')
    return stillValid ? r : stopRun(r, now, 'Statut corrigé : séquence devenue obsolète, STOP.', 'obsolete')
  })
}

/* ------------------------------------------------------------------ */
/* W01 — relance d'un prospect                                          */
/* ------------------------------------------------------------------ */

export function evaluateW01FollowUp(
  ctx: Omit<GuardContext, 'workflow'> & { followUpsSent: number },
): GuardDecision {
  if (ctx.followUpsSent >= ctx.rules.w01.maxFollowUps) {
    return { kind: 'stop', reason: 'Nombre maximal de relances atteint.' }
  }
  return evaluateGuards({ ...ctx, workflow: 'W01' })
}
