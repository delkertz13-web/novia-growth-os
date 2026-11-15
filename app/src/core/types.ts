/** Types métier génériques (service / appointment / customer), indépendants de la verticale. */

/**
 * Chaque entité métier appartient à UNE entreprise (multi-client). Le moteur refuse tout
 * événement ou commande dont le `businessId` n'est pas celui de son contexte.
 */
export type BusinessId = string

/** Référence d'un objet chez un fournisseur technique (GHL, opérateur SMS, Voice, paiement, agenda). */
export interface ExternalRef {
  provider: string
  id: string
}

export type AppointmentStatus =
  | 'booked' // Réservé
  | 'confirmed' // RDV confirmé (≠ CA confirmé)
  | 'showed' // Présente (attestée)
  | 'no_show' // Absente (attestée)
  | 'cancelled' // Annulé
  | 'rescheduled' // Reporté : remplacé par un nouveau RDV
  | 'completed' // Terminé (non utilisé dans la démo, état à définir)

/** Réponse de validation après (ou avant, pour annulation / report) le rendez-vous */
export type ValidationOutcome = 'present' | 'absent' | 'cancelled' | 'rescheduled'

/** Sources de statut (spécification W02, A à E) */
export type StatusSource = 'integration' | 'pro' | 'cockpit' | 'sms' | 'other' | 'client' | 'system'

export type LeadSource = 'site' | 'instagram' | 'facebook' | 'chatbot' | 'manual' | 'phone' | 'voice' | 'referral'

export type BookingOrigin = 'site' | 'pro' | 'voice' | 'smartfill' | 'recovery'

/** Une seule source d'attribution par rendez-vous : pas de double compte. */
export type AttributionSource =
  | 'acquisition'
  | 'cancellation_recovery'
  | 'noshow_recovery'
  | 'reactivation'
  | 'referral'
  | 'smartfill'
  | 'voice' // RDV pris par NOVIA Voice
  | 'direct' // cliente existante, réservation sans action NOVIA attribuable

export interface StatusEvent {
  at: string
  from: AppointmentStatus
  to: AppointmentStatus
  source: StatusSource
  note?: string
}

export interface PaymentProof {
  /** demo_payment : preuve fictive de la démo ; declared : déclarée par la pro ; online : fournisseur de paiement */
  kind: 'demo_payment' | 'declared' | 'online'
  amount: number
  at: string
  externalRef?: ExternalRef
}

export interface Appointment {
  id: string
  businessId: BusinessId
  /** identifiant court, utilisé pour la validation SMS multi-RDV */
  ref: string
  customerId: string
  serviceId: string
  start: string
  durationMin: number
  price: number
  deposit: number
  status: AppointmentStatus
  bookingOrigin: BookingOrigin
  attribution: AttributionSource
  rescheduledFromId?: string
  rescheduledToId?: string
  history: StatusEvent[]
  paymentProof?: PaymentProof
  /** moment de la prise de RDV (absent sur les données antérieures) */
  bookedAt?: string
  /** incrémentée à chaque changement ; un événement externe plus ancien est ignoré (absente = 0) */
  version?: number
  externalRefs?: ExternalRef[]
}

export interface Customer {
  id: string
  businessId: BusinessId
  firstName: string
  lastName: string
  phone: string
  email: string
  source: LeadSource
  createdAt: string
  lifecycle: 'prospect' | 'client'
  /**
   * Projections du registre `consents`, maintenues UNIQUEMENT par core/consent.ts.
   * Les règles (gardes, SmartFill, STOP) lisent ces deux champs.
   */
  consent: { transactional: boolean; marketing: boolean }
  optOut: boolean
  /** registre de consentement, en ajout seul (canal, finalité, état, source, date, preuve) */
  consents: ConsentRecord[]
  humanTakeover: boolean
  lastActivityAt: string
  referrerId?: string
  noShowRecovered?: boolean
  externalRefs?: ExternalRef[]
}

/* ------------------------------------------------------------------ */
/* Consentement                                                         */
/* ------------------------------------------------------------------ */

export type ConsentChannel = 'sms' | 'email' | 'phone' | 'instagram' | 'all'
/** transactional : messages liés à un RDV ; marketing : relances, réactivation, SmartFill, parrainage */
export type ConsentPurpose = 'transactional' | 'marketing'
/** opposed = STOP : seule une réinscription explicite (`explicit_resubscribe`) la lève */
export type ConsentState = 'granted' | 'withdrawn' | 'opposed'
export type ConsentSource =
  | 'booking_form' // case cochée par la cliente lors de la réservation
  | 'inbound_stop' // la cliente a répondu STOP
  | 'pro_declared' // déclaré par la professionnelle (avec preuve)
  | 'explicit_resubscribe' // réinscription explicite, distincte de toute réservation ou conversation
  | 'import' // reprise d'un fichier existant
  | 'demo' // donnée fictive de démonstration

export interface ConsentRecord {
  id: string
  at: string
  channel: ConsentChannel
  purpose: ConsentPurpose
  state: ConsentState
  source: ConsentSource
  /** preuve : texte de la case cochée, id du message STOP, référence du fichier importé… */
  proofRef?: string
}

export type WorkflowId = 'W01' | 'W02' | 'W03' | 'W04' | 'W05' | 'W12'

export interface WorkflowAction {
  at: string
  kind: 'info' | 'check_ok' | 'blocked' | 'message_simulated' | 'stop' | 'transition'
  label: string
}

export type RunStep =
  | 'wait'
  | 'recheck'
  | 'await_reply'
  | 'await_final'
  | 'done'

export interface WorkflowRun {
  id: string
  businessId: BusinessId
  workflow: WorkflowId
  customerId: string
  appointmentId?: string
  /** paused : la professionnelle a repris la conversation ; reprend quand elle rend la main à NOVIA */
  state: 'active' | 'paused' | 'stopped' | 'completed'
  step: RunStep
  messagesSent: number
  startedAt: string
  endedAt?: string
  outcome?: string
  actions: WorkflowAction[]
}

export type OpportunityKind = 'smartfill' | 'cancellation_recovery' | 'noshow_recovery'

export interface Opportunity {
  id: string
  businessId: BusinessId
  kind: OpportunityKind
  amount: number
  status: 'open' | 'won' | 'lost'
  createdAt: string
  /** RDV d'origine (annulé / absent) */
  sourceAppointmentId?: string
  /** créneau libéré, pour SmartFill */
  slotStart?: string
  slotDurationMin?: number
  resultAppointmentId?: string
}

export interface WaitlistEntry {
  id: string
  businessId: BusinessId
  customerId: string
  serviceId: string
  days: number[]
  periods: ('matin' | 'apres-midi' | 'soir')[]
  flexible: boolean
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Conversations (collaboration NOVIA ↔ professionnelle)                */
/* ------------------------------------------------------------------ */

export type ConversationChannel = 'sms' | 'instagram' | 'site'

export interface ConversationMessage {
  id: string
  at: string
  from: 'client' | 'novia' | 'pro'
  body: string
  /** réponse NOVIA tirée d'une FAQ approuvée */
  faqId?: string
  /** remise au fournisseur (messages de NOVIA ou de la pro) : voir engine/model.ts */
  delivery?: 'pending' | 'simulated' | 'shadow' | 'sent' | 'delivered' | 'retrying' | 'failed' | 'blocked'
}

/**
 * L'état affiché (NOVIA gère / réponse nécessaire / reprise humaine) n'est PAS stocké :
 * il se déduit de `needsHuman` et du drapeau `humanTakeover` de la cliente (domaine).
 */
export interface Conversation {
  id: string
  businessId: BusinessId
  customerId: string
  channel: ConversationChannel
  needsHuman: boolean
  /** pourquoi NOVIA passe la main (question inconnue, sujet sensible) */
  needsHumanReason?: string
  unread: boolean
  messages: ConversationMessage[]
  externalRefs?: ExternalRef[]
}

/* ------------------------------------------------------------------ */
/* NOVIA Voice (simulé)                                                 */
/* ------------------------------------------------------------------ */

export type VoiceCallOutcome = 'booked' | 'answered' | 'transferred' | 'voicemail'

export interface VoiceCall {
  id: string
  businessId: BusinessId
  at: string
  callerName: string
  phone: string
  customerId?: string
  durationSec: number
  /** pourquoi NOVIA a décroché */
  trigger: 'missed' | 'after_hours' | 'all'
  /** qui a décroché : NOVIA, ou Léa elle-même (journal du standard) */
  handledBy: 'novia' | 'pro'
  outcome: VoiceCallOutcome
  summary: string
  transcript: { from: 'caller' | 'novia'; text: string }[]
  appointmentId?: string
}

/* ------------------------------------------------------------------ */
/* Réglages NOVIA (appartiennent au domaine NOVIA, pas au backend)      */
/* ------------------------------------------------------------------ */

export interface NoviaSettings {
  automations: {
    cancellationRecovery: boolean
    noShowRecovery: boolean
    smartFill: boolean
    rebooking: boolean
    /** W05 / W06 : à concevoir, non activables */
    reviews: boolean
    referral: boolean
  }
  /** plage d'envoi des messages automatiques */
  sendWindow: { start: string; end: string }
  channels: { sms: boolean; email: boolean; instagram: boolean }
}

/** Quand NOVIA Voice décroche (réglage de l'entreprise, sans aucun appel réel en P1). */
export type VoiceMode = 'all' | 'missed' | 'after_hours'
export interface VoiceSettings {
  active: boolean
  mode: VoiceMode
}
