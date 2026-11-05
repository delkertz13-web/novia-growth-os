/**
 * Providers GoHighLevel — PRÉPARÉS, NON CONNECTÉS.
 *
 * Ces implémentations respectent les interfaces de src/providers/types.ts mais ne font
 * aucun appel réseau : chaque méthode lève NotConnectedError. Elles ne sont importées
 * nulle part dans l'application ; seul src/providers/index.ts pourra les brancher.
 *
 * Règle d'architecture : toute connaissance de GHL (identifiants de calendrier, champs
 * personnalisés, pipelines, workflows, webhooks) reste DANS ce dossier. Le domaine NOVIA
 * et les composants React n'en voient rien. Correspondances prévues : voir README.md.
 */
import { notConnected } from '../notConnected'
import type { AnalyticsProvider, AutomationProvider, BookingProvider, CRMProvider, MessagingProvider, SyncProvider } from '../types'

/** Configuration future (lue côté serveur, jamais exposée dans le navigateur). */
export interface GHLConfig {
  locationId: string
  calendarId: string
  /** Champs personnalisés GHL utilisés par NOVIA (statut réel, source, NO_SHOW_RECOVERED…) */
  customFields: Record<'attendance' | 'attributionSource' | 'noShowRecovered' | 'humanTakeover', string>
  /** Pipeline des opportunités NOVIA (SmartFill, récupérations) */
  pipelineId: string
}

export const GHLBookingProvider = notConnected<BookingProvider>('GHLBookingProvider', {
  listServices: true,
  getSlots: true,
  createBooking: true,
  listAppointments: true,
  validate: true,
})

export const GHLCRMProvider = notConnected<CRMProvider>('GHLCRMProvider', {
  listCustomers: true,
  getCustomer: true,
  upsertContact: true,
  setHumanTakeover: true,
})

export const GHLMessagingProvider = notConnected<MessagingProvider>('GHLMessagingProvider', { simulateSend: true, listSimulated: true })

export const GHLAnalyticsProvider = notConnected<AnalyticsProvider>('GHLAnalyticsProvider', { getRevenue: true })

export const GHLAutomationProvider = notConnected<AutomationProvider>('GHLAutomationProvider', {
  previewSmartFill: true,
  launchSmartFill: true,
  closeSmartFill: true,
})

export const GHLSyncProvider = notConnected<SyncProvider>('GHLSyncProvider', {
  getSnapshot: true,
  subscribe: true,
})

/** Ensemble GHL, à combiner avec les providers Voice et Payment (src/providers/future). */
export function createGHLProviders(_config: GHLConfig) {
  return {
    sync: GHLSyncProvider,
    automation: GHLAutomationProvider,
    booking: GHLBookingProvider,
    crm: GHLCRMProvider,
    messaging: GHLMessagingProvider,
    analytics: GHLAnalyticsProvider,
  }
}
