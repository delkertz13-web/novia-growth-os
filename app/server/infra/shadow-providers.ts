/**
 * Fournisseurs techniques du pilote P2 : AUCUN transport.
 *
 * Le moteur tourne en exécution `shadow` : le dispatcher n'appelle aucun fournisseur. La
 * messagerie déclarée ici est un garde-fou : si quelqu'un l'appelait quand même, elle
 * refuserait (erreur définitive), sans réseau. Aucun CRM, Voice, paiement ni agenda n'est
 * enregistré. Un test d'architecture interdit tout autre fournisseur côté serveur.
 */
import type { ClockProvider, MessagingProvider, TechnicalProviders } from '../../src/providers/types'

export interface ServerClock {
  now(): Date
}

export const NO_TRANSPORT = 'no-transport'

const refusingMessaging: MessagingProvider = {
  name: NO_TRANSPORT,
  async send() {
    return { ok: false, error: { provider: NO_TRANSPORT, code: 'rejected', retryable: false, message: 'P2 : aucun transport de message n’existe (mode shadow).' } }
  },
}

export function createShadowProviders(clock: ServerClock): TechnicalProviders {
  const c: ClockProvider = { mode: 'system', now: () => clock.now() }
  return { clock: c, messaging: refusingMessaging }
}

export const systemClock: ServerClock = { now: () => new Date() }
