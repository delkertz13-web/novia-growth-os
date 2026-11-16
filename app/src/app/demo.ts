/**
 * Composition NOVIA_MODE=demo : l'entreprise fictive « NOVIA Nails », son scénario de
 * référence, l'horloge arrêtée sur jeudi 19 novembre 2026 15h10, les providers Mock
 * (exécution SIMULÉE : rien n'est transmis) et les contrôles de simulation.
 *
 * C'est l'un des deux seuls fichiers (avec demo-shell.tsx) autorisés à importer src/demo.
 */
import { createDemoControls } from '../demo/controls'
import { demoProfile } from '../demo/config/profile'
import { demoClock, demoStore, resetDemo } from '../demo/store'
import { createNovia, type PaymentWording } from '../domain/intents'
import { createEngine } from '../engine'
import { createMockProviders } from '../providers/mock'

export const mode = 'demo' as const

export function createDemoNovia() {
  const engine = createEngine({ store: demoStore, profile: demoProfile, providers: createMockProviders(demoClock), execution: 'simulated' })
  return createNovia(engine, { demo: createDemoControls(resetDemo) })
}

export const novia = createDemoNovia()

export const paymentWording: PaymentWording = {
  action: 'Simuler une preuve de paiement (fictive) → CA confirmé',
  actionShort: 'Simuler une preuve de paiement (fictive)',
  done: 'Preuve fictive enregistrée : CA confirmé.',
  note: null,
  kpiFootnote: 'Données de démonstration, entièrement fictives. Aucun montant n’est encaissé par NOVIA.',
}

/** La démonstration est prête immédiatement : ni serveur, ni connexion, ni réseau. */
export async function bootstrap(): Promise<{ status: 'ready' }> {
  return { status: 'ready' }
}
