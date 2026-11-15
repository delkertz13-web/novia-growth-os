/** Session du pilote (utilisatrice, entreprise courante) : lue par l'habillage, sans dépendre du domaine. */
import type { Me } from './api'

export interface PilotSession {
  user: Me['user']
  business: Me['businesses'][number]
  businesses: Me['businesses']
  /** relit l'état du serveur si un autre appareil a écrit */
  sync(): Promise<void>
}

let current: PilotSession | undefined
export const setPilotSession = (s: PilotSession) => void (current = s)
export const pilotSession = () => current
