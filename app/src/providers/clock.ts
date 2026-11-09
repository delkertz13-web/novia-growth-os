/**
 * Horloges NOVIA. Toute lecture de « maintenant » dans le moteur, le domaine et
 * l'interface passe par un ClockProvider, jamais par `new Date()`.
 */
import type { ClockProvider } from './types'

/**
 * Horloge arrêtée sur un instant donné (démonstration, tests). Le temps n'avance que
 * par les contrôles de démonstration (« Le temps passe »), jamais avec l'heure réelle.
 */
export function createFixedClock(instant: Date): ClockProvider {
  if (Number.isNaN(instant.getTime())) throw new Error('Instant de référence invalide')
  const t = instant.getTime()
  return { mode: 'demo', now: () => new Date(t) }
}

/** Horloge réelle (pilote). Interprétée dans le fuseau du salon, jamais celui du serveur. */
export const SystemClock: ClockProvider = { mode: 'system', now: () => new Date() }
