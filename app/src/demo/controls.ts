/**
 * Contrôles de SIMULATION de la démonstration. Ils jouent le rôle du monde extérieur :
 * le temps qui passe, une cliente qui écrit, rappelle, accepte ou refuse, un appel reçu.
 * Ils ne décident RIEN : chacun fabrique un événement et le remet au moteur NOVIA, comme
 * le fera demain un webhook de messagerie, de téléphonie ou d'agenda.
 */
import { serviceOf } from '../config/profile'
import { addDays, formatIn } from '../core/time'
import type { Appointment, VoiceCall } from '../core/types'
import type { DemoControls, IntentResult, NoviaCore, SmartFillFunnel } from '../domain/intents'
import { availableSlots } from '../core/availability'
import { scriptedCallers } from './voice'

export function createDemoControls(reset: () => void) {
  return (novia: NoviaCore): DemoControls => {
    const { profile } = novia
    const tz = novia.timeZone
    const snap = () => novia.snapshot()
    const slots = (day: Date, serviceId: string) => {
      const s = serviceOf(profile, serviceId)
      return s ? availableSlots(day, s.durationMin, profile.identity.openingHours.value, snap().appointments, novia.now(), tz) : []
    }
    const attempt = <T>(fn: () => T): IntentResult<T> => {
      try {
        return { ok: true, value: fn() }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Action impossible' }
      }
    }

    /** Premier jour ouvré avec des créneaux (3e créneau, comme une cliente qui choisit). */
    const firstAvailableSlot = (serviceId: string) => {
      for (let i = 1; i < 21; i++) {
        const list = slots(addDays(novia.now(), i, tz), serviceId)
        if (list.length) return list[Math.min(2, list.length - 1)]
      }
      return undefined
    }

    /**
     * Ce que NOVIA Voice dirait au prochain appel simulé : appelante, prestation, créneau
     * réellement libre et transcription. Rien n'est réservé tant que l'appel n'aboutit pas.
     */
    const planIncomingCall = () => {
      const voice = snap().voice
      if (!voice.active) throw new Error('NOVIA Voice est désactivé dans vos réglages.')
      const known = new Set(snap().calls.map((c) => c.phone))
      const caller = scriptedCallers.find((c) => !known.has(c.phone))
      if (!caller) throw new Error('Tous les appels de démonstration ont été simulés. Réinitialisez la démo pour recommencer.')
      const service = serviceOf(profile, caller.serviceId)!
      const now = novia.now()
      let start: Date | undefined
      for (let i = 1; i <= 14 && !start; i++) start = slots(addDays(now, i, tz), service.id)[0]
      if (!start) throw new Error('Aucun créneau disponible dans les 14 prochains jours.')
      const when = formatIn(start, tz, { weekday: 'long', hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
      const { name, artistFirstName } = profile.identity
      const transcript: VoiceCall['transcript'] = [
        { from: 'novia', text: `${name.value}, bonjour ! ${artistFirstName.value} est en prestation, je suis son assistante. Comment puis-je vous aider ?` },
        { from: 'caller', text: `Bonjour, je voudrais prendre rendez-vous pour un ${service.name.toLowerCase()}.` },
        { from: 'novia', text: `Avec plaisir. Le ${service.name.toLowerCase()} est à ${service.price} €. Je peux vous proposer ${when}. Cela vous convient ?` },
        { from: 'caller', text: 'Oui, parfait.' },
        { from: 'novia', text: 'C’est noté. Vous recevrez une confirmation par SMS. Puis-je avoir votre nom ?' },
        { from: 'caller', text: `${caller.firstName} ${caller.lastName}.` },
      ]
      return { caller, service, start, when, transcript, trigger: voice.mode, at: now }
    }

    return {
      reset,

      /** « Le temps passe » : l'étape suivante de la séquence arrive à échéance. */
      advanceRecovery: async (runId) => void (await novia.run({ type: 'SequenceStepDue', source: 'novia-demo', runId })),

      /** La cliente répond qu'elle ne souhaite pas reprendre rendez-vous. */
      clientDeclines: async (runId) => void (await novia.run({ type: 'OpportunityClosed', source: 'novia-demo', runId, reason: 'client_declined' })),

      /** La cliente répond et réserve le prochain créneau disponible. */
      async clientRebooks(runId) {
        const run = snap().runs.find((r) => r.id === runId)
        if (!run || run.state !== 'active') return undefined
        const source = snap().appointments.find((a) => a.id === run.appointmentId)!
        const start = firstAvailableSlot(source.serviceId)
        if (!start) return undefined
        const customer = snap().customers.find((c) => c.id === run.customerId)!
        const r = await novia.run<Appointment>({ type: 'BookingCreated', source: 'novia-demo', customerId: customer.id, serviceId: source.serviceId, start: start.toISOString(), leadSource: customer.source, origin: 'recovery' })
        return r.ok ? snap().appointments.find((a) => a.id === r.value.id) : undefined
      },

      /** Une cliente écrit (simulation d'un message entrant). */
      simulateClientMessage: (conversationId, body) => novia.run({ type: 'InboundMessageReceived', source: 'novia-demo', conversationId, channel: 'sms', body }),

      previewIncomingCall: () => attempt(planIncomingCall),

      /** L'appel simulé aboutit : NOVIA Voice crée (ou retrouve) la cliente et le RDV dans NOVIA. */
      async simulateIncomingCall() {
        let plan: ReturnType<typeof planIncomingCall>
        try {
          plan = planIncomingCall()
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Action impossible' }
        }
        const { serviceId: _s, ...contact } = plan.caller
        const booked = await novia.run<Appointment>({ type: 'BookingCreated', source: 'novia-demo', serviceId: plan.service.id, start: plan.start.toISOString(), contact, leadSource: 'voice', origin: 'voice' })
        if (!booked.ok) return booked
        const appointment = booked.value
        const call = await novia.run<VoiceCall>({
          type: 'VoiceCallCompleted',
          source: 'novia-demo',
          call: {
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
          },
        })
        return call.ok ? { ok: true, value: { call: call.value, appointment } } : call
      },

      /** Simulation : la première cliente contactable accepte le créneau proposé par SmartFill. */
      async acceptSmartFill(opportunityId: string, funnel: SmartFillFunnel) {
        const o = snap().opportunities.find((x) => x.id === opportunityId)
        if (!o?.slotStart || o.status !== 'open' || !funnel.contactable.length) return null
        const winner = funnel.contactable[0]
        const serviceId = snap().waitlist.find((w) => w.customerId === winner.id)?.serviceId ?? 'remplissage'
        const r = await novia.run<Appointment>({ type: 'BookingCreated', source: 'novia-demo', customerId: winner.id, serviceId, start: o.slotStart, leadSource: winner.source, origin: 'smartfill', opportunityId })
        return r.ok ? { appointment: r.value, customer: winner, funnel } : null
      },
    }
  }
}
