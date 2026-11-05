/**
 * Lot 6 — exploitation quotidienne : clientes, messages, NOVIA Voice, réglages.
 * Les modules partagent le même domaine et le même store : une action dans l'un
 * se voit dans les autres. Providers Mock réels, jeu de démonstration de référence.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { rules } from '../config/rules.demo'
import { services } from '../config/services.demo'
import { providers } from '../providers/mock'
import { conversationState, triage } from './conversations'
import { filterCustomers, matchesSearch } from './customers'
import { createNovia } from './intents'

const novia = createNovia(providers, { rules, services })
const now = () => novia.now()
const snap = () => novia.snapshot()
const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const customerByName = (first: string) => snap().customers.find((c) => c.firstName === first)!

beforeEach(() => providers.demo!.reset())

describe('Clientes', () => {
  it('recherche sans accents, par nom ou téléphone', () => {
    const rows = novia.pro.customers(now())
    expect(filterCustomers(rows, { query: 'oceane' }).map((r) => r.customer.firstName)).toEqual(['Océane'])
    expect(filterCustomers(rows, { query: 'blanc oce' })).toHaveLength(1)
    const sarah = customerByName('Sarah')
    expect(matchesSearch(sarah, '7718')).toBe(true)
  })

  it('segments du quotidien', () => {
    const seg = (first: string) => novia.pro.customers(now()).find((r) => r.customer.firstName === first)!.segments
    expect(seg('Océane')).toEqual(expect.arrayContaining(['to_follow_up', 'recent_no_show']))
    expect(seg('Inaya')).toContain('new_lead')
    expect(seg('Mila')).toContain('human')
    expect(seg('Sarah')).toEqual(expect.arrayContaining(['active', 'new_lead']))
    expect(novia.pro.customers(now()).some((r) => r.segments.includes('refill'))).toBe(true)
  })

  it('la fiche sépare montant réservé et confirmé, et la timeline sépare passé et à venir', () => {
    const c = customerByName('Camille')
    const file = novia.pro.customerFile(c.id, now())!
    expect(file.amounts.confirmed).toBeGreaterThan(0)
    expect(file.amounts.booked).toBeGreaterThan(0)
    const tl = novia.pro.timeline(c.id, now())
    expect(tl.history.some((e) => e.kind === 'payment')).toBe(true)
    expect(tl.upcoming.every((e) => new Date(e.at).getTime() > now().getTime())).toBe(true)
    expect(tl.history.every((e) => new Date(e.at).getTime() <= now().getTime())).toBe(true)
  })
})

describe('Messages : NOVIA ↔ professionnelle', () => {
  it('triage : réponse approuvée, sensible avant FAQ, inconnu', () => {
    expect(triage('Quel est le prix d’un remplissage ?').kind).toBe('faq')
    expect(triage('Quel prix pour soigner une réaction allergique ?').kind).toBe('sensitive')
    expect(triage('Vous faites les mariages le dimanche ?').kind).toBe('unknown')
  })

  it('la boîte de réception met en tête ce qui attend une réponse humaine', () => {
    const inbox = novia.pro.inbox()
    expect(inbox[0].state).toBe('needs_human')
    expect(inbox.filter((i) => i.state === 'needs_human')).toHaveLength(2)
    expect(novia.pro.cockpit(now()).needsReply).toHaveLength(2)
  })

  it('question FAQ : NOVIA répond seule ; question inconnue : intervention de Léa', () => {
    const conv = novia.pro.inbox().find((i) => i.state === 'novia' && i.customer?.firstName === 'Inaya')!.conversation
    const r1 = ok(novia.demo!.simulateClientMessage(conv.id, 'Combien de temps dure une pose ?'))
    expect(r1.kind).toBe('faq')
    expect(novia.pro.conversation(conv.id)!.last!.from).toBe('novia')
    const r2 = ok(novia.demo!.simulateClientMessage(conv.id, 'Vous pouvez faire un dessin de mon chat ?'))
    expect(r2.kind).toBe('unknown')
    expect(novia.pro.conversation(conv.id)!.state).toBe('needs_human')
  })

  it('reprendre la conversation suspend les automatisations ; rendre à NOVIA les relance', () => {
    const oceane = customerByName('Océane')
    const run = () => snap().runs.find((r) => r.customerId === oceane.id && r.workflow === 'W04' && r.state !== 'completed')!
    expect(run().state).toBe('active')
    ok(novia.pro.takeOverConversation(oceane.id))
    expect(run().state).toBe('paused')
    // en pause, aucun message n'est simulé même si la démo fait avancer le temps
    const sent = run().messagesSent
    novia.demo!.advanceRecovery(run().id)
    expect(run().messagesSent).toBe(sent)
    expect(novia.pro.customerFile(oceane.id, now())!.segments).toContain('human')
    ok(novia.pro.letNoviaHandle(oceane.id))
    expect(run().state).toBe('active')
    expect(run().actions.at(-1)!.label).toMatch(/revérification/)
  })

  it('répondre soi-même vaut reprise humaine ; NOVIA ne répond plus à cette cliente', () => {
    const item = novia.pro.inbox().find((i) => i.state === 'needs_human')!
    ok(novia.pro.replyAsPro(item.conversation.id, 'Je vous rappelle ce soir.'))
    const after = novia.pro.conversation(item.conversation.id)!
    expect(after.state).toBe('human')
    expect(after.last!.from).toBe('pro')
    const r = ok(novia.demo!.simulateClientMessage(item.conversation.id, 'Quel est le prix ?'))
    expect(r.kind).toBe('human')
    expect(novia.pro.conversation(item.conversation.id)!.last!.from).toBe('client')
    ok(novia.pro.letNoviaHandle(item.customer!.id))
    expect(conversationState(novia.pro.conversation(item.conversation.id)!.conversation, customerByName(item.customer!.firstName))).toBe('novia')
  })
})

describe('NOVIA Voice (simulé)', () => {
  it('statistiques du standard', () => {
    expect(novia.pro.voiceStats()).toEqual({ received: 5, takenByNovia: 4, booked: 2, transferred: 1 })
  })

  it('un appel transformé en RDV apparaît partout : fiche, agenda, attribution, KPI', () => {
    const before = novia.pro.cockpit(now()).revenue.noviaWonThisMonth
    const voiceBefore = novia.pro.revenueAttribution().bySource.voice.booked
    const { call, appointment } = ok(novia.demo!.simulateIncomingCall())
    expect(appointment.attribution).toBe('voice')
    expect(appointment.bookingOrigin).toBe('voice')
    expect(call.appointmentId).toBe(appointment.id)
    const file = novia.pro.customerFile(appointment.customerId, now())!
    expect(file.customer.source).toBe('voice')
    expect(file.upcoming?.id).toBe(appointment.id)
    expect(file.calls[0].id).toBe(call.id)
    expect(novia.pro.timeline(appointment.customerId, now()).history.some((e) => e.callId === call.id)).toBe(true)
    expect(snap().appointments.some((a) => a.id === appointment.id)).toBe(true)
    expect(novia.pro.revenueAttribution().bySource.voice.booked - voiceBefore).toBe(appointment.price)
    const sameMonth = new Date(appointment.start).getMonth() === now().getMonth()
    expect(novia.pro.cockpit(now()).revenue.noviaWonThisMonth - before).toBe(sameMonth ? appointment.price : 0)
    expect(novia.pro.voiceStats().booked).toBe(3)
  })

  it('Voice désactivé : aucun appel simulé', () => {
    ok(novia.pro.configureVoice({ active: false }))
    expect(novia.demo!.simulateIncomingCall().ok).toBe(false)
  })
})

describe('Réglages', () => {
  it('SmartFill désactivé : le lancement est refusé et une annulation n’ouvre plus de créneau', () => {
    const slot = novia.pro.cockpit(now()).freedSlots[0]
    ok(novia.pro.updateSettings({ automations: { smartFill: false } }))
    expect(novia.pro.launchSmartFill(slot.id).ok).toBe(false)
    const next = novia.pro.cockpit(now()).today.find((i) => i.state === 'next')!
    const before = novia.pro.cockpit(now()).freedSlots.length
    ok(novia.pro.cancelAppointment(next.appointment.id))
    expect(novia.pro.cockpit(now()).freedSlots.length).toBe(before)
  })

  it('récupération des absences désactivée : pas de séquence W04, montant toujours « à récupérer »', () => {
    ok(novia.pro.updateSettings({ automations: { noShowRecovery: false } }))
    const target = novia.pro.cockpit(now()).toConfirm[0]
    const runs = snap().runs.length
    const toRecover = novia.pro.cockpit(now()).revenue.toRecover
    ok(novia.pro.declareAbsence(target.id))
    expect(snap().runs.length).toBe(runs)
    expect(novia.pro.cockpit(now()).revenue.toRecover - toRecover).toBe(target.price)
  })

  it('plage d’envoi : validée et appliquée aux règles', () => {
    expect(novia.pro.updateSettings({ sendWindow: { start: '20:00', end: '09:00' } }).ok).toBe(false)
    ok(novia.pro.updateSettings({ sendWindow: { start: '10:00', end: '19:00' } }))
    expect(novia.pro.settings().sendWindow).toEqual({ start: '10:00', end: '19:00' })
    expect(novia.pro.updateSettings({ automations: { reviews: true } }).ok).toBe(false)
  })
})

describe('SmartFill → fiche cliente', () => {
  it('la cliente qui prend le créneau voit le RDV dans sa fiche et sa timeline', () => {
    const slot = novia.pro.cockpit(now()).freedSlots[0]
    const res = ok(novia.pro.launchSmartFill(slot.id))!
    const file = novia.pro.customerFile(res.customer.id, now())!
    expect(file.upcoming?.attribution).toBe('smartfill')
    const tl = novia.pro.timeline(res.customer.id, now())
    expect(tl.history.some((e) => e.kind === 'booked' && e.byNovia && e.detail?.includes('SmartFill'))).toBe(true)
  })
})
