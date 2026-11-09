/**
 * NOVIA Voice — SIMULATION. Aucun appel réel n'est passé ni reçu.
 * Statistiques du standard et scénarios d'appels fictifs pour la démonstration.
 */
import type { VoiceCall } from '../core/types'
import type { VoiceMode } from '../engine/model'

export type CallFilter = 'all' | 'missed' | 'after_hours'

export const voiceModeLabels: Record<VoiceMode, { title: string; short: string; help: string }> = {
  missed: { title: 'Appels manqués', short: 'Manqués', help: 'NOVIA décroche quand vous ne pouvez pas répondre (en prestation).' },
  after_hours: { title: 'Hors horaires', short: 'Hors horaires', help: 'NOVIA répond uniquement quand le salon est fermé.' },
  all: { title: 'Tous les appels', short: 'Tous', help: 'NOVIA répond à chaque appel et vous transfère si besoin.' },
}

export const callOutcomeLabels: Record<VoiceCall['outcome'], string> = {
  booked: 'RDV créé',
  answered: 'Renseignée',
  transferred: 'Transfert à vous',
  voicemail: 'Message laissé',
}

export interface VoiceStats {
  received: number
  takenByNovia: number
  booked: number
  transferred: number
}

export function voiceStats(calls: VoiceCall[]): VoiceStats {
  return {
    received: calls.length,
    takenByNovia: calls.filter((c) => c.handledBy === 'novia').length,
    booked: calls.filter((c) => c.outcome === 'booked').length,
    transferred: calls.filter((c) => c.outcome === 'transferred').length,
  }
}

export function filterCalls(calls: VoiceCall[], filter: CallFilter) {
  const list = filter === 'all' ? calls : calls.filter((c) => c.trigger === filter)
  return [...list].sort((a, b) => b.at.localeCompare(a.at))
}
