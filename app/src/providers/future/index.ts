/**
 * Autres fournisseurs — PRÉPARÉS, NON CONNECTÉS. Aucun n'est choisi.
 * Chaque méthode répond `not_connected` : aucun SMS, aucun appel, aucun encaissement.
 */
import { notConnected } from '../notConnected'
import type { ExternalCalendarProvider, MessagingProvider, PaymentProvider, VoiceProvider } from '../types'

/** Alternative à GHL pour la messagerie : un opérateur SMS direct (même contrat). */
export const DirectSmsProvider = notConnected<MessagingProvider>('DirectSmsProvider', { send: true })
export const LiveVoiceProvider = notConnected<VoiceProvider>('LiveVoiceProvider', { configure: true })
export const LivePaymentProvider = notConnected<PaymentProvider>('LivePaymentProvider', { createPaymentLink: true })
/** Scénario Planity A : lecture des créneaux occupés (pas d'API publique connue : import ou saisie). */
export const PlanityCalendarProvider = notConnected<ExternalCalendarProvider>('PlanityCalendarProvider', { listBusy: true })
