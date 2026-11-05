/**
 * Domaine NOVIA Pro : les intentions métier du cockpit.
 *
 * Chaque bouton du cockpit appelle UNE intention nommée ici. Les intentions ne
 * connaissent que l'interface `Providers` : elles fonctionnent à l'identique avec
 * les providers Mock d'aujourd'hui et avec les providers GHL / Voice / Payment de
 * demain. Aucune logique propre à un backend ne vit ici ni dans les composants.
 */
import type { ServiceConfig, WorkflowRules } from '../config/schema'
import type { Appointment, ValidationOutcome } from '../core/types'
import type { BookingInput, Providers, SmartFillOutcome, VoiceSettings } from '../providers/types'
import { buildCockpit, buildCustomerFile } from './cockpit'
import { reactionFor, type Reaction } from './reactions'

export type IntentResult<T> = { ok: true; value: T } | { ok: false; error: string }

const attempt = <T>(fn: () => T): IntentResult<T> => {
  try {
    return { ok: true, value: fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Action impossible' }
  }
}

export interface NoviaOptions {
  rules: WorkflowRules
  services: ServiceConfig[]
}

const monthOf = (now: Date) => ({ from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) })

export function createNovia(p: Providers, opts: NoviaOptions) {
  const snapshot = () => p.sync.getSnapshot()

  /** Statut réel d'un rendez-vous, toujours déclaré par la professionnelle depuis le cockpit. */
  const recordOutcome = (appointmentId: string, outcome: ValidationOutcome, newStart?: Date): IntentResult<Reaction> =>
    attempt(() => {
      const before = snapshot().appointments.find((a) => a.id === appointmentId)
      if (!before) throw new Error('Rendez-vous introuvable')
      const after = p.booking.validate(appointmentId, outcome, { source: 'cockpit', newStart })
      return reactionFor(outcome, before, after, snapshot(), opts.rules)
    })

  const pro = {
    /* ---------- Rendez-vous ---------- */
    confirmPresence: (appointmentId: string) => recordOutcome(appointmentId, 'present'),
    declareAbsence: (appointmentId: string) => recordOutcome(appointmentId, 'absent'),
    cancelAppointment: (appointmentId: string) => recordOutcome(appointmentId, 'cancelled'),
    rescheduleAppointment: (appointmentId: string, newStart: Date) => recordOutcome(appointmentId, 'rescheduled', newStart),
    /** Variante générique pour les quatre boutons de statut. */
    recordOutcome,
    recordPaymentProof: (appointmentId: string) => attempt(() => p.payment.recordDemoPayment(appointmentId)),

    /* ---------- Conversations ---------- */
    /** La professionnelle reprend la main : NOVIA arrête ses séquences pour cette cliente. */
    takeOverConversation: (customerId: string) => attempt(() => p.crm.setHumanTakeover(customerId, true)),
    /** NOVIA peut de nouveau gérer les prochains messages de cette cliente. */
    letNoviaHandle: (customerId: string) => attempt(() => p.crm.setHumanTakeover(customerId, false)),

    /* ---------- SmartFill ---------- */
    previewSmartFill: (opportunityId: string) => p.automation.previewSmartFill(opportunityId),
    launchSmartFill: (opportunityId: string): IntentResult<SmartFillOutcome | null> => attempt(() => p.automation.launchSmartFill(opportunityId)),
    keepSlotFree: (opportunityId: string) => attempt(() => p.automation.closeSmartFill(opportunityId)),

    /* ---------- NOVIA Voice ---------- */
    voiceSettings: () => p.voice.getSettings(),
    configureVoice: (settings: Partial<VoiceSettings>) => attempt(() => p.voice.setSettings(settings)),

    /* ---------- Consultation ---------- */
    cockpit: (now: Date) =>
      buildCockpit(snapshot(), now, { all: p.analytics.getRevenue(), month: p.analytics.getRevenue(monthOf(now)) }),
    customerFile: (customerId: string, now: Date) => buildCustomerFile(snapshot(), customerId, now, opts.services),
    appointment: (appointmentId: string): Appointment | undefined => snapshot().appointments.find((a) => a.id === appointmentId),
    revenueAttribution: (period?: { from: Date; to: Date }) => p.analytics.getRevenue(period),
    revenueThisMonth: (now: Date) => p.analytics.getRevenue(monthOf(now)),
    availableSlots: (day: Date, serviceId: string) => p.booking.getSlots(day, serviceId),
  }

  /** Parcours cliente (site de réservation). */
  const client = {
    services: () => p.booking.listServices(),
    availableSlots: (day: Date, serviceId: string) => p.booking.getSlots(day, serviceId),
    book: (input: BookingInput) => p.booking.createBooking(input),
  }

  return {
    /** « Maintenant » pour NOVIA : heure de référence en démo, heure système en production. */
    now: () => p.clock.now(),
    clockMode: p.clock.mode,
    snapshot,
    subscribe: (l: () => void) => p.sync.subscribe(l),
    pro,
    client,
    /** Contrôles de simulation : `null` avec un backend réel (les boutons disparaissent). */
    demo: p.demo ?? null,
  }
}

export type Novia = ReturnType<typeof createNovia>
