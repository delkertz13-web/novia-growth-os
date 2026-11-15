/**
 * État métier d'UNE entreprise, tel que NOVIA le possède (source de vérité).
 *
 * Aujourd'hui : en mémoire (démo : persisté dans le navigateur). Demain : PostgreSQL
 * derrière l'API NOVIA, une ligne par entité, toutes portant `businessId`.
 */
import type {
  Appointment,
  BusinessId,
  Conversation,
  Customer,
  ExternalRef,
  NoviaSettings,
  Opportunity,
  VoiceCall,
  VoiceSettings,
  WaitlistEntry,
  WorkflowRun,
} from '../core/types'

export type { VoiceMode, VoiceSettings } from '../core/types'

/**
 * Comment NOVIA exécute ses décisions :
 * - simulated : démonstration, les providers Mock consignent sans rien transmettre ;
 * - shadow    : NOVIA décide pour de vrai mais n'envoie RIEN (« aurait envoyé ») ;
 * - live      : envoi réel par les providers (aucun provider réel n'est branché en P1).
 */
export type ExecutionMode = 'simulated' | 'shadow' | 'live'

/** Statut d'un message que NOVIA envoie d'elle-même. */
export type DeliveryStatus =
  | 'pending' // décidé, pas encore remis au provider
  | 'simulated' // démo : consigné, rien transmis
  | 'shadow' // mode shadow : NOVIA l'aurait envoyé
  | 'sent' // accepté par le provider
  | 'delivered'
  | 'retrying' // échec temporaire, sera retenté
  | 'failed' // échec définitif
  | 'blocked' // bloqué avant envoi (donnée non vérifiée, opposition…)

/** Message automatique de NOVIA (confirmation, rappel, relance). */
export interface OutboundMessage {
  id: string
  at: string
  to: string
  customerId?: string
  appointmentId?: string
  channel: 'sms'
  purpose: string
  body: string
  businessId?: BusinessId
  /** clé déterministe : un même envoi n'est jamais fait deux fois */
  idempotencyKey?: string
  status?: DeliveryStatus
  externalRef?: ExternalRef
}

/** Écriture à faire chez un fournisseur technique (file d'envoi idempotente). */
export interface OutboxEntry {
  key: string
  businessId: BusinessId
  kind: 'message' | 'conversation_reply' | 'crm.upsert' | 'crm.optout' | 'voice.configure'
  /** id de l'objet NOVIA concerné (message, message de conversation, cliente) */
  ref: string
  createdAt: string
  status: 'pending' | 'retrying' | 'done' | 'failed' | 'shadow' | 'blocked'
  attempts: number
  lastError?: { code: string; message: string; retryable: boolean }
  externalRef?: ExternalRef
}

/** Journal d'audit : décisions de NOVIA, y compris celles qu'elle n'a PAS exécutées (shadow, blocage). */
export interface JournalEntry {
  at: string
  kind: 'event' | 'decision' | 'would_send' | 'blocked' | 'delivery' | 'duplicate' | 'stale' | 'rejected'
  label: string
  /** type d'événement ou de commande à l'origine */
  input?: string
  customerId?: string
  appointmentId?: string
}

export interface NoviaState {
  /** version du schéma de l'état */
  version: number
  businessId: BusinessId
  /** pour les identifiants courts (c25, a113…) */
  seq: number
  customers: Customer[]
  appointments: Appointment[]
  runs: WorkflowRun[]
  opportunities: Opportunity[]
  waitlist: WaitlistEntry[]
  /** messages automatiques de NOVIA (les 50 derniers) */
  messages: OutboundMessage[]
  voice: VoiceSettings
  conversations: Conversation[]
  calls: VoiceCall[]
  settings: NoviaSettings
  /** file d'envoi vers les providers */
  outbox: OutboxEntry[]
  /** événements externes déjà traités (`source:eventId`) */
  inbox: string[]
  journal: JournalEntry[]
}

export const STATE_VERSION = 8

/** Limites de la version locale (en base : tables sans limite, purge planifiée). */
export const LIMITS = { messages: 50, outbox: 200, inbox: 500, journal: 200 }

/** État vide d'une nouvelle entreprise : aucune cliente, aucun RDV, réglages du profil. */
export function emptyState(businessId: BusinessId, settings: NoviaSettings, voice: VoiceSettings = { active: false, mode: 'missed' }): NoviaState {
  return {
    version: STATE_VERSION,
    businessId,
    seq: 1,
    customers: [],
    appointments: [],
    runs: [],
    opportunities: [],
    waitlist: [],
    messages: [],
    voice,
    conversations: [],
    calls: [],
    settings,
    outbox: [],
    inbox: [],
    journal: [],
  }
}
export type NoviaSnapshot = NoviaState
