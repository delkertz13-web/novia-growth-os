/**
 * Application NOVIA : ce que l'interface peut demander et lire.
 *
 *   UI  →  ici (commandes async, lectures sync)  →  moteur (src/engine)  →  core  →  providers
 *
 * - Chaque bouton du cockpit appelle UNE intention nommée ici. Une intention qui ÉCRIT
 *   passe par le moteur : elle est asynchrone et renvoie toujours un résultat explicite
 *   (`IntentResult`), jamais une exception (même si un fournisseur tombe en panne).
 * - Une LECTURE est synchrone : elle construit une vue à partir de l'état NOVIA courant.
 * - Rien ici ne connaît un fournisseur (GHL, SMS, Voice, paiement) ni la démonstration :
 *   les contrôles de démo sont injectés par la composition (src/app/demo.ts).
 */
import { serviceOf, timeZoneOf, type BusinessProfile } from '../config/profile'
import type { ConsentChange } from '../core/consent'
import { availableSlots as slotsOf } from '../core/availability'
import { computeRevenue } from '../core/revenue'
import { monthOf } from '../core/time'
import type { Appointment, ConversationMessage, NoviaSettings, PaymentProof, ValidationOutcome, VoiceCall } from '../core/types'
import type { BookingOrigin, LeadSource } from '../core/types'
import { funnelFor, type ContactInput, type Engine, type EngineResult, type ExecutionMode, type NoviaState, type VoiceSettings } from '../engine'
import type { Draft } from '../engine/engine'
import { buildCockpit, buildCustomerFile } from './cockpit'
import { buildInbox, type Triage } from './conversations'
import { buildCustomerRows } from './customers'
import { reactionFor, type Reaction } from './reactions'
import { buildTimeline } from './timeline'
import { voiceStats } from './voice'

export type IntentResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface BookingInput {
  serviceId: string
  start: Date
  contact: ContactInput
  source: LeadSource
  origin: BookingOrigin
  marketingConsent?: { granted: boolean; proofRef: string }
}

export interface SmartFillFunnel {
  eligible: import('../core/types').Customer[]
  contactable: import('../core/types').Customer[]
}

export interface SmartFillOutcome {
  appointment: Appointment
  customer: import('../core/types').Customer
  funnel: SmartFillFunnel
}

/** Plan d'un appel simulé (démo) : ce que NOVIA Voice dirait, avant que rien ne soit réservé. */
export interface CallPlan {
  caller: { firstName: string; lastName: string; phone: string; email: string; serviceId: string }
  service: { id: string; name: string; price: number }
  start: Date
  when: string
  transcript: VoiceCall['transcript']
  trigger: VoiceCall['trigger']
  at: Date
}

/** Contrôles de simulation : n'existent qu'en démonstration (null sinon, les boutons disparaissent). */
export interface DemoControls {
  reset(): void
  advanceRecovery(runId: string): Promise<void>
  clientDeclines(runId: string): Promise<void>
  clientRebooks(runId: string): Promise<Appointment | undefined>
  simulateClientMessage(conversationId: string, body: string): Promise<IntentResult<Triage | { kind: 'human' } | { kind: 'stop' }>>
  previewIncomingCall(): IntentResult<CallPlan>
  simulateIncomingCall(): Promise<IntentResult<{ call: VoiceCall; appointment: Appointment }>>
  /** SmartFill lancé : la première cliente contactable accepte (W12 à concevoir) */
  acceptSmartFill(opportunityId: string, funnel: SmartFillFunnel): Promise<SmartFillOutcome | null>
}

const toIntent = <T>(r: EngineResult<T>): IntentResult<T> => (r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error })

export function createNovia(engine: Engine, opts: { demo?: (novia: NoviaCore) => DemoControls } = {}) {
  const { profile } = engine
  const tz = timeZoneOf(profile)
  const snapshot = () => engine.store.read()
  const run = async <T>(draft: Draft): Promise<IntentResult<T>> => toIntent(await engine.execute<T>(draft))
  const services = () => profile.services.items.filter((s) => s.active)
  const rulesNow = () => ({ ...profile.rules, sendWindow: snapshot().settings.sendWindow })
  const revenue = (period?: { from: Date; to: Date }) => computeRevenue(snapshot().appointments, snapshot().opportunities, period)
  const slots = (day: Date, serviceId: string) => {
    const s = serviceOf(profile, serviceId)
    return s ? slotsOf(day, s.durationMin, profile.identity.openingHours.value, snapshot().appointments, engine.now(), tz, profile.booking.value.slotStepMin) : []
  }

  /** Statut réel d'un rendez-vous, toujours déclaré par la professionnelle depuis le cockpit. */
  const recordOutcome = async (appointmentId: string, outcome: ValidationOutcome, newStart?: Date): Promise<IntentResult<Reaction>> => {
    const before = snapshot().appointments.find((a) => a.id === appointmentId)
    if (!before) return { ok: false, error: 'Rendez-vous introuvable' }
    const draft: Draft =
      outcome === 'present' || outcome === 'absent'
        ? { type: 'AttendanceRecorded', appointmentId, attended: outcome === 'present', statusSource: 'cockpit' }
        : outcome === 'cancelled'
          ? { type: 'BookingCancelled', appointmentId, statusSource: 'cockpit' }
          : { type: 'BookingRescheduled', appointmentId, newStart: newStart?.toISOString() ?? '', statusSource: 'cockpit' }
    if (outcome === 'rescheduled' && !newStart) return { ok: false, error: 'Un report nécessite un nouveau créneau.' }
    const r = await run<Appointment>(draft)
    return r.ok ? { ok: true, value: reactionFor(outcome, before, r.value, snapshot(), profile.rules, tz) } : r
  }

  const setTakeover = (customerId: string, value: boolean) => run<void>({ type: 'HumanTakeoverChanged', customerId, value })

  const core: NoviaCore = {
    /** « Maintenant » pour NOVIA : heure de référence en démo, heure système en production. */
    now: () => engine.now(),
    /** fuseau du salon : toute date affichée ou comparée s'y lit */
    timeZone: tz,
    profile,
    execution: engine.execution,
    snapshot,
    subscribe: (l: () => void) => engine.store.subscribe(l),
    run,
  }

  const pro = {
    /* ---------- Rendez-vous ---------- */
    confirmPresence: (appointmentId: string) => recordOutcome(appointmentId, 'present'),
    declareAbsence: (appointmentId: string) => recordOutcome(appointmentId, 'absent'),
    cancelAppointment: (appointmentId: string) => recordOutcome(appointmentId, 'cancelled'),
    rescheduleAppointment: (appointmentId: string, newStart: Date) => recordOutcome(appointmentId, 'rescheduled', newStart),
    /** Variante générique pour les quatre boutons de statut. */
    recordOutcome,
    /** Paiement : preuve fictive en démo, déclarée par la pro sinon (le CA confirmé en dépend). */
    recordPaymentProof: (appointmentId: string) =>
      run<PaymentProof>({ type: 'PaymentRecorded', appointmentId, method: engine.execution === 'simulated' ? 'demo' : 'declared' }),

    /* ---------- Conversations ---------- */
    /** Reprendre la main : NOVIA ne répond plus à cette cliente, ses séquences se mettent en pause. */
    takeOverConversation: (customerId: string) => setTakeover(customerId, true),
    /** Rendre à NOVIA : elle peut de nouveau répondre ; les séquences reprennent après revérification. */
    letNoviaHandle: (customerId: string) => setTakeover(customerId, false),
    inbox: () => buildInbox(snapshot()),
    conversation: (conversationId: string) => buildInbox(snapshot()).find((i) => i.conversation.id === conversationId),
    /** Conversation d'une cliente (ouverte au besoin, pour lui écrire depuis sa fiche). */
    conversationFor: (customerId: string) => run<import('../core/types').Conversation>({ type: 'OpenConversation', customerId, channel: 'sms' }),
    markRead: (conversationId: string) => run<void>({ type: 'MarkConversationRead', conversationId }),
    /** Répondre soi-même : c'est une reprise humaine (NOVIA se met en retrait). */
    replyAsPro: (conversationId: string, body: string) => run<ConversationMessage>({ type: 'ReplyAsPro', conversationId, body }),
    approvedAnswers: () => profile.approvedAnswers.value,

    /* ---------- Clientes ---------- */
    customers: (now: Date) => buildCustomerRows(snapshot(), now, profile.services.items),
    timeline: (customerId: string, now: Date) => buildTimeline(snapshot(), customerId, now, rulesNow(), profile.services.items, tz),
    /** Consentement : seule une réinscription explicite et prouvée lève une opposition (STOP). */
    recordConsent: (customerId: string, change: ConsentChange) => run<import('../core/types').Customer>({ type: 'ConsentChanged', customerId, change }),

    /* ---------- Réglages (appartiennent à NOVIA) ---------- */
    settings: () => snapshot().settings,
    updateSettings: (patch: { [K in keyof NoviaSettings]?: Partial<NoviaSettings[K]> }) => run<NoviaSettings>({ type: 'SettingsChanged', settings: patch }),

    /* ---------- SmartFill ---------- */
    previewSmartFill: (opportunityId: string): SmartFillFunnel | null => funnelFor(snapshot(), opportunityId, profile.services.items, engine.now()),
    launchSmartFill: async (opportunityId: string): Promise<IntentResult<SmartFillOutcome | null>> => {
      const r = await run<SmartFillFunnel | null>({ type: 'LaunchSmartFill', opportunityId })
      if (!r.ok || !r.value || !demo) return r.ok ? { ok: true, value: null } : r
      return { ok: true, value: await demo.acceptSmartFill(opportunityId, r.value) }
    },
    keepSlotFree: (opportunityId: string) => run<void>({ type: 'OpportunityClosed', opportunityId, reason: 'kept_free' }),

    /* ---------- NOVIA Voice ---------- */
    voiceSettings: (): VoiceSettings => snapshot().voice,
    configureVoice: (settings: Partial<VoiceSettings>) => run<NoviaSettings>({ type: 'SettingsChanged', voice: settings }),
    calls: () => [...snapshot().calls].sort((a, b) => b.at.localeCompare(a.at)),
    call: (callId: string) => snapshot().calls.find((c) => c.id === callId),
    voiceStats: () => voiceStats(snapshot().calls),

    /* ---------- Consultation ---------- */
    cockpit: (now: Date) => buildCockpit(snapshot(), now, { all: revenue(), month: revenue(monthOf(now, tz)) }, tz),
    customerFile: (customerId: string, now: Date) => buildCustomerFile(snapshot(), customerId, now, profile.services.items),
    appointment: (appointmentId: string): Appointment | undefined => snapshot().appointments.find((a) => a.id === appointmentId),
    /** Revenu : toujours CALCULÉ par NOVIA (une attribution par RDV), jamais lu chez un fournisseur. */
    revenueAttribution: (period?: { from: Date; to: Date }) => revenue(period),
    revenueThisMonth: (now: Date) => revenue(monthOf(now, tz)),
    availableSlots: slots,
  }

  /** Parcours cliente (site de réservation). */
  const client = {
    services,
    availableSlots: slots,
    book: (input: BookingInput) =>
      run<Appointment>({
        type: 'BookingCreated',
        source: 'novia-client',
        serviceId: input.serviceId,
        start: input.start.toISOString(),
        contact: input.contact,
        leadSource: input.source,
        origin: input.origin,
        marketingConsent: input.marketingConsent,
      }),
  }

  const demo = opts.demo?.(core)
  return {
    ...core,
    clockMode: engine.clockMode,
    pro,
    client,
    /** Contrôles de simulation : `null` hors démonstration (les boutons disparaissent). */
    demo: demo ?? null,
  }
}

/** Ce que les contrôles de démo reçoivent de l'application. */
export interface NoviaCore {
  now(): Date
  timeZone: string
  profile: BusinessProfile
  execution: ExecutionMode
  snapshot(): NoviaState
  subscribe(l: () => void): () => void
  run<T>(draft: Draft): Promise<IntentResult<T>>
}
export type Novia = ReturnType<typeof createNovia>
