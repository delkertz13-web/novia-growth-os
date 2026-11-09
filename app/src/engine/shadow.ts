/**
 * Mode shadow (préparé, non déployé) : Planity et la pro continuent comme aujourd'hui ;
 * NOVIA reçoit les faits, DÉCIDE pour de vrai et n'envoie RIEN. Ce rapport dit ce
 * qu'elle aurait fait : « aurait envoyé ce rappel », « aurait démarré la récupération »,
 * « éligible SmartFill », « bloqué à cause du STOP ».
 */
import type { NoviaState } from './model'

export interface ShadowReport {
  wouldSend: { purpose: string; to: string; body: string; at: string }[]
  recoveriesStarted: { workflow: string; customerId: string; appointmentId?: string }[]
  blocked: { label: string; customerId?: string; at: string }[]
  smartFill: { label: string; at: string }[]
}

export function shadowReport(s: NoviaState): ShadowReport {
  return {
    wouldSend: s.messages.filter((m) => m.status === 'shadow').map((m) => ({ purpose: m.purpose, to: m.to, body: m.body, at: m.at })),
    recoveriesStarted: s.runs.filter((r) => r.state === 'active' || r.state === 'paused').map((r) => ({ workflow: r.workflow, customerId: r.customerId, appointmentId: r.appointmentId })),
    blocked: [
      ...s.journal.filter((j) => j.kind === 'blocked').map((j) => ({ label: j.label, customerId: j.customerId, at: j.at })),
      // séquences arrêtées net par l'opposition ou la reprise humaine
      ...s.runs.flatMap((r) => r.actions.filter((a) => a.kind === 'stop' && /STOP|repris/.test(a.label)).map((a) => ({ label: a.label, customerId: r.customerId, at: a.at }))),
    ],
    smartFill: s.journal.filter((j) => j.input === 'LaunchSmartFill').map((j) => ({ label: j.label, at: j.at })),
  }
}
