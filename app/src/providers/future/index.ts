/**
 * Providers NOVIA Voice et Paiement — PRÉPARÉS, NON CONNECTÉS.
 * Aucun appel téléphonique, aucun encaissement : chaque méthode lève NotConnectedError.
 * Le fournisseur réel (téléphonie IA, prestataire de paiement) n'est pas choisi.
 */
import { notConnected } from '../notConnected'
import type { PaymentProvider, VoiceProvider } from '../types'

export const LiveVoiceProvider = notConnected<VoiceProvider>('LiveVoiceProvider', { getSettings: true, setSettings: true, listCalls: true, logCall: true })

export const LivePaymentProvider = notConnected<PaymentProvider>('LivePaymentProvider', { recordDemoPayment: true })
