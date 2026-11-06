import type { IconName } from '../ui/Icon'

/**
 * Cinq destinations du quotidien. Voice, Revenue et Réglages vivent dans l'espace NOVIA
 * (et Réglages aussi derrière l'avatar) : jamais huit icônes en bas de l'écran.
 * `also` : pages secondaires qui gardent l'onglet parent actif.
 */
export const proTabs: { to: string; label: string; icon: IconName; end?: boolean; also?: string[] }[] = [
  { to: '/pro', label: 'Accueil', icon: 'home', end: true },
  { to: '/pro/agenda', label: 'Agenda', icon: 'calendar', also: ['/pro/rdv'] },
  { to: '/pro/clientes', label: 'Clientes', icon: 'user', also: ['/pro/cliente'] },
  { to: '/pro/messages', label: 'Messages', icon: 'message' },
  { to: '/pro/novia', label: 'NOVIA', icon: 'sparkle', also: ['/pro/voice', '/pro/revenue', '/pro/reglages'] },
]
