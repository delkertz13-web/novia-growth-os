/**
 * Interfaces des services NOVIA : la frontière entre le domaine NOVIA et les backends.
 *
 *   UI (React)  →  domaine NOVIA (src/domain)  →  ces interfaces  →  implémentations
 *
 * Aujourd'hui seules les implémentations Mock existent (src/providers/mock).
 * Les implémentations GHL, Voice et Payment sont préparées dans src/providers/ghl et
 * src/providers/future : elles implémentent ces MÊMES interfaces mais ne sont PAS
 * connectées. Passer de l'une à l'autre se fait dans src/providers/index.ts, sans
 * toucher à l'interface utilisateur.
 */
import type { ServiceConfig } from '../config/schema'
import type { RevenueReport } from '../core/revenue'
import type {
  Appointment,
  BookingOrigin,
  Opportunity,
  WaitlistEntry,
  WorkflowRun,
  Customer,
  LeadSource,
  PaymentProof,
  StatusSource,
  ValidationOutcome,
} from '../core/types'

export interface BookingInput {
  serviceId: string
  start: Date
  contact: { firstName: string; lastName: string; phone: string; email: string }
  source: LeadSource
  origin: BookingOrigin
}

export interface BookingProvider {
  listServices(): ServiceConfig[]
  getSlots(day: Date, serviceId: string): Date[]
  createBooking(input: BookingInput): Appointment
  listAppointments(): Appointment[]
  validate(appointmentId: string, outcome: ValidationOutcome, opts: { source: StatusSource; newStart?: Date }): Appointment
}

export interface CRMProvider {
  listCustomers(): Customer[]
  getCustomer(id: string): Customer | undefined
  /** déduplication obligatoire (W01) */
  upsertContact(contact: BookingInput['contact'], source: LeadSource): Customer
  setHumanTakeover(customerId: string, value: boolean): void
}

export interface SimulatedMessage {
  id: string
  at: string
  to: string
  channel: 'sms'
  purpose: string
  body: string
}

export interface MessagingProvider {
  /** Ne transmet RIEN : consigne le message qui aurait été envoyé. */
  simulateSend(msg: Omit<SimulatedMessage, 'id' | 'at'>): SimulatedMessage
  listSimulated(): SimulatedMessage[]
}

export type VoiceMode = 'all' | 'missed' | 'after_hours'
export interface VoiceSettings {
  active: boolean
  mode: VoiceMode
}

export interface VoiceProvider {
  getSettings(): VoiceSettings
  setSettings(s: Partial<VoiceSettings>): void
}

export interface PaymentProvider {
  /** Preuve de paiement FICTIVE, utilisée pour illustrer le CA confirmé. */
  recordDemoPayment(appointmentId: string): PaymentProof
}

export interface AnalyticsProvider {
  getRevenue(period?: { from: Date; to: Date }): RevenueReport
}

/* ------------------------------------------------------------------ */
/* Lecture de l'état métier                                             */
/* ------------------------------------------------------------------ */

/**
 * Vue cohérente de l'état métier dont le cockpit a besoin. Côté Mock, c'est le store
 * local ; côté GHL, ce sera un cache alimenté par l'API et les webhooks.
 */
export interface NoviaSnapshot {
  customers: Customer[]
  appointments: Appointment[]
  runs: WorkflowRun[]
  opportunities: Opportunity[]
  waitlist: WaitlistEntry[]
  messages: SimulatedMessage[]
  voice: VoiceSettings
}

export interface SyncProvider {
  getSnapshot(): NoviaSnapshot
  /** Prévient à chaque changement ; renvoie la fonction de désinscription. */
  subscribe(listener: () => void): () => void
}

/* ------------------------------------------------------------------ */
/* Automatisations NOVIA (SmartFill, récupérations)                     */
/* ------------------------------------------------------------------ */

export interface SmartFillFunnel {
  eligible: Customer[]
  contactable: Customer[]
}

export interface SmartFillOutcome {
  appointment: Appointment
  customer: Customer
  funnel: SmartFillFunnel
}

export interface AutomationProvider {
  /** Qui NOVIA contacterait pour ce créneau libéré, selon les règles. */
  previewSmartFill(opportunityId: string): SmartFillFunnel | null
  /** Lance SmartFill sur un créneau libéré. */
  launchSmartFill(opportunityId: string): SmartFillOutcome | null
  /** La professionnelle garde le créneau libre : SmartFill ne le propose plus. */
  closeSmartFill(opportunityId: string): void
}

/**
 * Contrôles propres à la démonstration : ils simulent le passage du temps ou une
 * réponse de la cliente. Un backend réel ne les fournit pas (champ optionnel).
 */
export interface DemoControls {
  advanceRecovery(runId: string): void
  clientDeclines(runId: string): void
  clientRebooks(runId: string): Appointment | undefined
  reset(): void
}

export interface Providers {
  sync: SyncProvider
  automation: AutomationProvider
  demo?: DemoControls
  booking: BookingProvider
  crm: CRMProvider
  messaging: MessagingProvider
  voice: VoiceProvider
  payment: PaymentProvider
  analytics: AnalyticsProvider
}
