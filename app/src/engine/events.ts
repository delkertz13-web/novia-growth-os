/**
 * Ce qui entre dans le moteur NOVIA : des ÉVÉNEMENTS (un fait survenu, chez NOVIA ou chez
 * un fournisseur) et quelques COMMANDES (une demande de la professionnelle sans fait
 * externe équivalent). Modèle minimal, sans event sourcing : l'état reste la vérité,
 * les événements sont dédupliqués et journalisés.
 *
 * Écarts assumés avec la liste de départ :
 * - BookingCreated porte aussi les RDV pris par Voice et par SmartFill (via `origin`) ;
 * - BookingRescheduled / BookingCancelled / AttendanceRecorded sont distincts mais
 *   suivent le même chemin (statut du RDV, jamais déduit de l'heure) ;
 * - OpportunityClosed couvre « la cliente refuse » et « la pro garde le créneau libre » ;
 * - LaunchSmartFill, ReplyAsPro, OpenConversation, MarkConversationRead sont des commandes.
 */
import type { ConsentChange } from '../core/consent'
import type {
  BookingOrigin,
  BusinessId,
  ConversationChannel,
  ExternalRef,
  LeadSource,
  NoviaSettings,
  StatusSource,
  VoiceCall,
} from '../core/types'
import type { VoiceSettings } from './model'

/** D'où vient l'entrée. Les sources `novia-*` sont internes ; les autres sont des fournisseurs. */
export type InputSource =
  | 'novia-pro' // cockpit de la professionnelle
  | 'novia-client' // site de réservation
  | 'novia-engine' // ordonnanceur interne (séquences, rappels)
  | 'novia-demo' // contrôles de simulation
  | 'messaging'
  | 'voice'
  | 'payment'
  | 'calendar'
  | 'crm'

export const isExternalSource = (s: InputSource) => !s.startsWith('novia-')

/** Enveloppe commune : ce qui permet l'idempotence et l'isolation. */
export interface Envelope {
  /** unique PAR SOURCE : (source, eventId) n'est traité qu'une fois */
  eventId: string
  businessId: BusinessId
  source: InputSource
  occurredAt: string
  /** identifiants chez le fournisseur (message, appel, paiement, RDV Planity…) */
  externalRefs?: ExternalRef[]
  /** version de l'entité sur laquelle l'émetteur s'appuie : plus ancienne que la nôtre → ignorée */
  version?: number
}

export interface ContactInput {
  firstName: string
  lastName: string
  phone: string
  email: string
}

export type EventBody =
  | { type: 'ContactUpserted'; contact: ContactInput; leadSource: LeadSource }
  | {
      type: 'BookingCreated'
      serviceId: string
      start: string
      /** cliente connue… */
      customerId?: string
      /** …ou coordonnées (dédupliquées) */
      contact?: ContactInput
      leadSource: LeadSource
      origin: BookingOrigin
      /** créneau libéré rempli (origine smartfill) */
      opportunityId?: string
      /** case marketing cochée à la réservation (preuve = texte de la case) */
      marketingConsent?: { granted: boolean; proofRef: string }
    }
  | { type: 'BookingRescheduled'; appointmentId: string; newStart: string; statusSource: StatusSource }
  | { type: 'BookingCancelled'; appointmentId: string; statusSource: StatusSource }
  | { type: 'AttendanceRecorded'; appointmentId: string; attended: boolean; statusSource: StatusSource }
  | { type: 'InboundMessageReceived'; conversationId?: string; customerId?: string; channel: ConversationChannel; body: string }
  | { type: 'MessageDeliveryUpdated'; outboxKey: string; status: 'sent' | 'delivered' | 'failed'; error?: string }
  | { type: 'ConsentChanged'; customerId: string; change: ConsentChange }
  | { type: 'HumanTakeoverChanged'; customerId: string; value: boolean }
  | { type: 'VoiceCallCompleted'; call: Omit<VoiceCall, 'id' | 'businessId'> }
  | { type: 'PaymentRecorded'; appointmentId: string; method: 'demo' | 'declared' | 'online'; amount?: number }
  | { type: 'OpportunityClosed'; opportunityId?: string; runId?: string; reason: 'kept_free' | 'client_declined' }
  | { type: 'SettingsChanged'; settings?: { [K in keyof NoviaSettings]?: Partial<NoviaSettings[K]> }; voice?: Partial<VoiceSettings> }
  // internes (ordonnanceur)
  | { type: 'SequenceStepDue'; runId: string }
  | { type: 'ReminderDue'; appointmentId: string; hoursBefore: number }

export type CommandBody =
  | { type: 'LaunchSmartFill'; opportunityId: string }
  | { type: 'ReplyAsPro'; conversationId: string; body: string }
  | { type: 'OpenConversation'; customerId: string; channel: ConversationChannel }
  | { type: 'MarkConversationRead'; conversationId: string }

export type EventType = EventBody['type']
export type NoviaEvent = Envelope & EventBody
export type NoviaCommand = Envelope & CommandBody
export type NoviaInput = NoviaEvent | NoviaCommand
export type InputBody = EventBody | CommandBody
export type InputOf<T extends InputBody['type']> = Envelope & Extract<InputBody, { type: T }>
