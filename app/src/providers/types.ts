/**
 * Interfaces des services NOVIA. La V1 ne contient QUE des implémentations Mock.
 * Une intégration future (GHL ou autre) implémentera ces mêmes interfaces ;
 * aucune n'existe aujourd'hui.
 */
import type { ServiceConfig } from '../config/schema'
import type { RevenueReport } from '../core/revenue'
import type {
  Appointment,
  BookingOrigin,
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

export interface VoiceProvider {
  getSettings(): { active: boolean; mode: 'all' | 'missed' | 'after_hours' }
  setSettings(s: Partial<{ active: boolean; mode: 'all' | 'missed' | 'after_hours' }>): void
}

export interface PaymentProvider {
  /** Preuve de paiement FICTIVE, utilisée pour illustrer le CA confirmé. */
  recordDemoPayment(appointmentId: string): PaymentProof
}

export interface AnalyticsProvider {
  getRevenue(period?: { from: Date; to: Date }): RevenueReport
}

export interface Providers {
  booking: BookingProvider
  crm: CRMProvider
  messaging: MessagingProvider
  voice: VoiceProvider
  payment: PaymentProvider
  analytics: AnalyticsProvider
}
