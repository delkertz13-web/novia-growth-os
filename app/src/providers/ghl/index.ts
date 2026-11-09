/**
 * Providers GoHighLevel — PRÉPARÉS, NON CONNECTÉS.
 *
 * GHL peut fournir des CANAUX à NOVIA : messagerie, miroir CRM, conversations,
 * téléphonie / Voice. Il n'est jamais le cerveau : aucune règle NOVIA (statut, STOP,
 * séquences, SmartFill, attribution, revenu) ne dépend de GHL, et aucun workflow GHL
 * n'envoie de message. Le choix GHL ↔ SMS direct reste ouvert : les deux implémentent
 * le même `MessagingProvider`.
 *
 * Chaque méthode répond `not_connected` (aucun appel réseau). Toute connaissance de GHL
 * (identifiants, champs personnalisés, webhooks) reste DANS ce dossier. Voir README.md.
 */
import { notConnected } from '../notConnected'
import type { CrmMirrorProvider, MessagingProvider, VoiceProvider } from '../types'

/** Configuration future (lue côté serveur, jamais exposée dans le navigateur). */
export interface GHLConfig {
  locationId: string
  /** mapping minimal validé par l'audit */
  customFields: Record<'noviaCustomerId' | 'noviaMarketingConsent' | 'noviaSource', string>
  tag: 'novia'
}

export const GHLMessagingProvider = notConnected<MessagingProvider>('GHLMessagingProvider', { send: true })
export const GHLCrmMirrorProvider = notConnected<CrmMirrorProvider>('GHLCrmMirrorProvider', { upsertContact: true, setOptOut: true })
export const GHLVoiceProvider = notConnected<VoiceProvider>('GHLVoiceProvider', { configure: true })

/** Canaux GHL possibles. NOVIA choisit lesquels brancher ; aucun n'est obligatoire. */
export function createGHLProviders(_config: GHLConfig) {
  return { messaging: GHLMessagingProvider, crm: GHLCrmMirrorProvider, voice: GHLVoiceProvider }
}
