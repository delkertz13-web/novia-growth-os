/**
 * Domaine NOVIA Pro : les intentions métier du cockpit.
 *
 * Chaque bouton du cockpit appelle UNE intention nommée ici. Les intentions ne
 * connaissent que l'interface `Providers` : elles fonctionnent à l'identique avec
 * les providers Mock d'aujourd'hui et avec les providers GHL / Voice / Payment de
 * demain. Aucune logique propre à un backend ne vit ici ni dans les composants.
 */
import { business } from '../config/business.demo'
import type { ServiceConfig, WorkflowRules } from '../config/schema'
import type { Appointment, NoviaSettings, ValidationOutcome, VoiceCall } from '../core/types'
import type { BookingInput, Providers, SmartFillOutcome, VoiceSettings } from '../providers/types'
import { buildCockpit, buildCustomerFile } from './cockpit'
import { buildInbox, triage, type Triage } from './conversations'
import { buildCustomerRows } from './customers'
import { reactionFor, type Reaction } from './reactions'
import { buildTimeline } from './timeline'
import { scriptedCallers, voiceStats } from './voice'

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
  const conversationOf = (customerId: string) => snapshot().conversations.find((c) => c.customerId === customerId)
  /** règles de la démo, avec la plage d'envoi choisie par la professionnelle */
  const rulesNow = (): WorkflowRules => ({ ...opts.rules, sendWindow: p.settings.get().sendWindow })

  /** Une cliente écrit (simulation) : NOVIA répond si une réponse approuvée existe, sinon passe la main. */
  const simulateClientMessage = (conversationId: string, body: string): IntentResult<Triage | { kind: 'human' }> =>
    attempt(() => {
      const conv = snapshot().conversations.find((c) => c.id === conversationId)
      if (!conv) throw new Error('Conversation introuvable')
      p.messaging.appendMessage(conversationId, { from: 'client', body })
      const customer = snapshot().customers.find((c) => c.id === conv.customerId)
      // reprise humaine : NOVIA ne répond pas, la professionnelle est notifiée
      if (customer?.humanTakeover) return { kind: 'human' as const }
      const t = triage(body)
      if (t.kind === 'faq') {
        p.messaging.appendMessage(conversationId, { from: 'novia', body: t.answer.answer, faqId: t.answer.id })
        p.messaging.updateConversation(conversationId, { unread: false })
      } else {
        p.messaging.updateConversation(conversationId, { needsHuman: true, needsHumanReason: t.reason, unread: true })
      }
      return t
    })

  /**
   * Ce que NOVIA Voice dirait au prochain appel simulé : appelante, prestation, créneau
   * réellement libre et transcription. Rien n'est réservé tant que l'appel n'aboutit pas.
   */
  const planIncomingCall = () => {
    const voice = p.voice.getSettings()
    if (!voice.active) throw new Error('NOVIA Voice est désactivé dans vos réglages.')
    const known = new Set(p.voice.listCalls().map((c) => c.phone))
    const caller = scriptedCallers.find((c) => !known.has(c.phone))
    if (!caller) throw new Error('Tous les appels de démonstration ont été simulés. Réinitialisez la démo pour recommencer.')
    const service = opts.services.find((s) => s.id === caller.serviceId)!
    const now = p.clock.now()
    let start: Date | undefined
    for (let i = 1; i <= 14 && !start; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
      start = p.booking.getSlots(day, service.id)[0]
    }
    if (!start) throw new Error('Aucun créneau disponible dans les 14 prochains jours.')
    const when = start.toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
    const transcript: VoiceCall['transcript'] = [
      { from: 'novia', text: `${business.name.value}, bonjour ! ${business.artistFirstName.value} est en prestation, je suis son assistante. Comment puis-je vous aider ?` },
      { from: 'caller', text: `Bonjour, je voudrais prendre rendez-vous pour un ${service.name.toLowerCase()}.` },
      { from: 'novia', text: `Avec plaisir. Le ${service.name.toLowerCase()} est à ${service.price} €. Je peux vous proposer ${when}. Cela vous convient ?` },
      { from: 'caller', text: 'Oui, parfait.' },
      { from: 'novia', text: 'C’est noté. Vous recevrez une confirmation par SMS. Puis-je avoir votre nom ?' },
      { from: 'caller', text: `${caller.firstName} ${caller.lastName}.` },
    ]
    return { caller, service, start, when, transcript, trigger: voice.mode, at: now }
  }

  /** L'appel simulé aboutit : NOVIA Voice crée (ou retrouve) la cliente et le RDV dans NOVIA. */
  const simulateIncomingCall = (): IntentResult<{ call: VoiceCall; appointment: Appointment }> =>
    attempt(() => {
      const plan = planIncomingCall()
      const { serviceId: _s, ...contact } = plan.caller
      const appointment = p.booking.createBooking({ serviceId: plan.service.id, start: plan.start, contact, source: 'voice', origin: 'voice' })
      const call = p.voice.logCall({
        at: plan.at.toISOString(),
        callerName: `${plan.caller.firstName} ${plan.caller.lastName}`,
        phone: plan.caller.phone,
        customerId: appointment.customerId,
        durationSec: 118,
        trigger: plan.trigger,
        handledBy: 'novia',
        outcome: 'booked',
        summary: `${plan.service.name} → RDV ${plan.when}`,
        appointmentId: appointment.id,
        transcript: plan.transcript,
      })
      return { call, appointment }
    })

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
    /**
     * La professionnelle reprend la main : NOVIA ne répond plus à cette cliente et ses
     * séquences automatiques (récupérations) se mettent en pause.
     */
    takeOverConversation: (customerId: string) => attempt(() => p.crm.setHumanTakeover(customerId, true)),
    /** Rendre à NOVIA : elle peut de nouveau répondre ; les séquences reprennent après revérification. */
    letNoviaHandle: (customerId: string) =>
      attempt(() => {
        p.crm.setHumanTakeover(customerId, false)
        const conv = conversationOf(customerId)
        if (conv) p.messaging.updateConversation(conv.id, { needsHuman: false, needsHumanReason: undefined })
      }),
    inbox: () => buildInbox(snapshot()),
    conversation: (conversationId: string) => buildInbox(snapshot()).find((i) => i.conversation.id === conversationId),
    /** Conversation d'une cliente (ouverte au besoin, pour lui écrire depuis sa fiche). */
    conversationFor: (customerId: string) => attempt(() => conversationOf(customerId) ?? p.messaging.openConversation(customerId, 'sms')),
    markRead: (conversationId: string) => attempt(() => p.messaging.updateConversation(conversationId, { unread: false })),
    /** Répondre soi-même : c'est une reprise humaine (NOVIA se met en retrait). Message SIMULÉ. */
    replyAsPro: (conversationId: string, body: string) =>
      attempt(() => {
        const conv = snapshot().conversations.find((c) => c.id === conversationId)
        if (!conv) throw new Error('Conversation introuvable')
        if (!body.trim()) throw new Error('Message vide')
        const customer = snapshot().customers.find((c) => c.id === conv.customerId)
        if (customer && !customer.humanTakeover) p.crm.setHumanTakeover(conv.customerId, true)
        p.messaging.updateConversation(conversationId, { needsHuman: false, needsHumanReason: undefined, unread: false })
        return p.messaging.appendMessage(conversationId, { from: 'pro', body: body.trim() })
      }),

    /* ---------- Clientes ---------- */
    customers: (now: Date) => buildCustomerRows(snapshot(), now, opts.services),
    timeline: (customerId: string, now: Date) => buildTimeline(snapshot(), customerId, now, rulesNow(), opts.services),

    /* ---------- Réglages (appartiennent à NOVIA) ---------- */
    settings: () => p.settings.get(),
    updateSettings: (patch: { [K in keyof NoviaSettings]?: Partial<NoviaSettings[K]> }) =>
      attempt(() => {
        const cur = p.settings.get()
        const next = {
          automations: { ...cur.automations, ...patch.automations },
          sendWindow: { ...cur.sendWindow, ...patch.sendWindow },
          channels: { ...cur.channels, ...patch.channels },
        }
        if (next.sendWindow.start >= next.sendWindow.end) throw new Error('La fin de la plage d’envoi doit être après le début.')
        // avis et parrainage : workflows à concevoir, non activables
        if (next.automations.reviews || next.automations.referral) throw new Error('Cette automatisation n’est pas encore disponible.')
        return p.settings.update(next)
      }),

    /* ---------- SmartFill ---------- */
    previewSmartFill: (opportunityId: string) => p.automation.previewSmartFill(opportunityId),
    launchSmartFill: (opportunityId: string): IntentResult<SmartFillOutcome | null> =>
      attempt(() => {
        if (!p.settings.get().automations.smartFill) throw new Error('SmartFill est désactivé dans vos réglages.')
        return p.automation.launchSmartFill(opportunityId)
      }),
    keepSlotFree: (opportunityId: string) => attempt(() => p.automation.closeSmartFill(opportunityId)),

    /* ---------- NOVIA Voice ---------- */
    voiceSettings: () => p.voice.getSettings(),
    configureVoice: (settings: Partial<VoiceSettings>) => attempt(() => p.voice.setSettings(settings)),
    calls: () => [...p.voice.listCalls()].sort((a, b) => b.at.localeCompare(a.at)),
    call: (callId: string) => p.voice.listCalls().find((c) => c.id === callId),
    voiceStats: () => voiceStats(p.voice.listCalls()),

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
    demo: p.demo ? { ...p.demo, simulateClientMessage, previewIncomingCall: () => attempt(planIncomingCall), simulateIncomingCall } : null,
  }
}

export type Novia = ReturnType<typeof createNovia>
