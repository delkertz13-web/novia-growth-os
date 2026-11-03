import type { WorkflowRules } from './schema'

/**
 * Paramètres W01–W04 de DÉMONSTRATION (cf. docs/02_WORKFLOWS et docs/01_CORE/MASTER_CONFIG.md).
 * Les rappels 24 h / 2 h sont les exemples donnés dans la spécification W02.
 * Toutes les autres valeurs sont des exemples à configurer avant tout usage réel.
 */
export const rules: WorkflowRules = {
  status: 'demo',
  sendWindow: { start: '07:00', end: '22:00' },
  w01: { followUpDelayHours: 24, maxFollowUps: 2 },
  w02: { remindersHoursBefore: [24, 2], validationRequestDelayMin: 30 },
  w03: { waitBeforeRecoveryHours: 2, lastFollowUpDelayHours: 48 },
  w04: { waitBeforeRecoveryHours: 3, lastFollowUpDelayHours: 72 },
}
