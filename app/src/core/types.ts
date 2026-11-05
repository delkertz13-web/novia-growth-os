/** Types métier génériques (service / appointment / customer), indépendants de la verticale. */

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
  kind: 'demo_payment'
  amount: number
  at: string
}

export interface Appointment {
  id: string
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
}

export interface Customer {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string
  source: LeadSource
  createdAt: string
  lifecycle: 'prospect' | 'client'
  consent: { transactional: boolean; marketing: boolean }
  optOut: boolean
  humanTakeover: boolean
  lastActivityAt: string
  referrerId?: string
  noShowRecovered?: boolean
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
}

/**
 * L'état affiché (NOVIA gère / réponse nécessaire / reprise humaine) n'est PAS stocké :
 * il se déduit de `needsHuman` et du drapeau `humanTakeover` de la cliente (domaine).
 */
export interface Conversation {
  id: string
  customerId: string
  channel: ConversationChannel
  needsHuman: boolean
  /** pourquoi NOVIA passe la main (question inconnue, sujet sensible) */
  needsHumanReason?: string
  unread: boolean
  messages: ConversationMessage[]
}

/* ------------------------------------------------------------------ */
/* NOVIA Voice (simulé)                                                 */
/* ------------------------------------------------------------------ */

export type VoiceCallOutcome = 'booked' | 'answered' | 'transferred' | 'voicemail'

export interface VoiceCall {
  id: string
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
