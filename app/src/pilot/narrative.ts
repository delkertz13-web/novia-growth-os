/**
 * Shadow Control Center : une décision racontée en français, pas en noms de garde-fous.
 *
 *   14h00 · Léa M. · Absence déclarée
 *   NOVIA aurait : W04 · étape 1
 *   ✓ pas d’opposition (STOP)  ✓ consentement aux messages  …
 *   → Aurait été exécuté (rien n’a été envoyé : mode shadow)
 *
 * Module PUR : l'heure et le nom de la cliente sont fournis déjà mis en forme.
 */
const TRIGGERS: Record<string, string> = {
  BookingCreated: 'Nouveau RDV saisi',
  BookingCancelled: 'RDV annulé',
  BookingRescheduled: 'RDV déplacé',
  AttendanceRecorded: 'Présence ou absence déclarée',
  AppointmentCorrected: 'RDV corrigé',
  ReminderDue: 'Heure d’un rappel',
  SequenceStepDue: 'Étape de relance due',
  InboundMessageReceived: 'Message reçu d’une cliente',
  ConsentChanged: 'Consentement modifié',
  HumanTakeoverChanged: 'Reprise de la conversation',
  ContactUpserted: 'Cliente enregistrée',
  LaunchSmartFill: 'SmartFill lancé',
  WaitlistJoined: 'Inscription en liste d’attente',
  SettingsChanged: 'Réglages modifiés',
}

const WORKFLOWS: Record<string, string> = {
  W02: 'Messages de RDV (confirmation, rappel, report)',
  W03: 'Relance après annulation',
  W04: 'Relance après absence',
  SmartFill: 'Remplir un créneau libéré',
  FAQ: 'Réponse automatique',
}

export interface NarratedDecision {
  headline: string
  workflow: string
  wouldDo: string
  checks: { label: string; ok: boolean }[]
  outcome: string
  blocked: boolean
}

export function narrate(
  d: { workflow: string | null; action: string; result: 'WOULD_EXECUTE' | 'BLOCKED'; reason: string; guards: { name: string; ok: boolean }[] | null; input_type: string | null },
  ctx: { time: string; customer?: string },
): NarratedDecision {
  const trigger = (d.input_type && TRIGGERS[d.input_type]) || 'Événement'
  const blocked = d.result === 'BLOCKED'
  return {
    headline: [ctx.time, ctx.customer, trigger].filter(Boolean).join(' · '),
    workflow: (d.workflow && WORKFLOWS[d.workflow]) || d.workflow || 'Autre',
    wouldDo: `NOVIA aurait : ${d.action}`,
    checks: (d.guards ?? []).map((g) => ({ label: g.name, ok: g.ok })),
    outcome: blocked ? `Bloqué : ${d.reason}` : `Aurait été exécuté. Rien n’a été envoyé (mode shadow). ${d.reason}`.trim(),
    blocked,
  }
}

export const verdictText = {
  AGREE: 'Oui, j’aurais fait pareil',
  DISAGREE: 'Non, je n’aurais pas fait ça',
  UNSURE: 'Je ne sais pas',
} as const
