/**
 * Horloges NOVIA. Toute lecture de « maintenant » dans le domaine, les providers et
 * l'interface passe par un ClockProvider, jamais par `new Date()`.
 */
import type { ClockProvider } from './types'

/**
 * Horloge de démonstration : arrêtée sur l'heure de référence du scénario.
 * Le temps n'avance que par les contrôles de démonstration (« Le temps passe »),
 * jamais avec l'heure réelle.
 */
export function createDemoClock(referenceDate: string): ClockProvider {
  const ref = new Date(referenceDate)
  if (Number.isNaN(ref.getTime())) throw new Error(`Date de référence de démo invalide : ${referenceDate}`)
  return { mode: 'demo', now: () => new Date(ref) }
}

/** Horloge réelle, pour une future intégration (non utilisée en démonstration). */
export const SystemClock: ClockProvider = { mode: 'system', now: () => new Date() }
