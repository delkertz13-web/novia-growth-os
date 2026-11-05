/**
 * NOVIA Voice — SIMULATION. Aucun appel réel n'est passé ni reçu.
 * Statistiques du standard et scénarios d'appels fictifs pour la démonstration.
 */
import type { VoiceCall } from '../core/types'
import type { VoiceMode } from '../providers/types'

export type CallFilter = 'all' | 'missed' | 'after_hours'

export const voiceModeLabels: Record<VoiceMode, { title: string; help: string }> = {
  missed: { title: 'Appels manqués', help: 'NOVIA décroche quand vous ne pouvez pas répondre (en prestation).' },
  after_hours: { title: 'Hors horaires', help: 'NOVIA répond uniquement quand le salon est fermé.' },
  all: { title: 'Tous les appels', help: 'NOVIA répond à chaque appel et vous transfère si besoin.' },
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

/** Appelantes fictives utilisées par « Simuler un appel » (une par clic, dans l'ordre). */
export const scriptedCallers = [
  { firstName: 'Margaux', lastName: 'Leroy', phone: '06 00 00 81 42', email: 'margaux.leroy@exemple.demo', serviceId: 'remplissage' },
  { firstName: 'Clémence', lastName: 'Marchand', phone: '06 00 00 63 07', email: 'clemence.marchand@exemple.demo', serviceId: 'semi-permanent' },
  { firstName: 'Laura', lastName: 'Fabre', phone: '06 00 00 94 55', email: 'laura.fabre@exemple.demo', serviceId: 'pose-gel' },
]
