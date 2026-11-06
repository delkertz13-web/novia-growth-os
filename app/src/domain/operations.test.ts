/**
 * Lot 6 — exploitation quotidienne : clientes, messages, NOVIA Voice, réglages.
 * Les modules partagent le même domaine et le même store : une action dans l'un
 * se voit dans les autres. Providers Mock réels, jeu de démonstration de référence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proTabs } from '../pro/nav'
import { createSeed } from '../providers/mock/seed'
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

const network = { fetch: vi.fn(), xhr: vi.fn(), ws: vi.fn() }
beforeEach(() => {
  providers.demo!.reset()
  vi.stubGlobal('fetch', network.fetch)
  vi.stubGlobal('XMLHttpRequest', network.xhr)
  vi.stubGlobal('WebSocket', network.ws)
})
afterEach(() => {
  // aucune action de l'exploitation quotidienne ne touche le réseau
  for (const spy of Object.values(network)) expect(spy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

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
    expect(inbox.filter((i) => i.state === 'needs_human')).toHaveLength(3)
    expect(novia.pro.cockpit(now()).needsReply).toHaveLength(3)
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
    expect(run().actions.at(-1)!.label).toMatch(/vérification/i)
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
    expect(tl.history.some((e) => e.kind === 'booked' && e.byNovia && e.detail?.includes('Créneau rempli'))).toBe(true)
  })
})

describe('Rendre à NOVIA : revérification avant de reprendre', () => {
  const oceane = () => customerByName('Océane')
  let id = ''
  const run = () => snap().runs.find((r) => r.id === id)!
  beforeEach(() => {
    id = snap().runs.find((r) => r.customerId === oceane().id && r.workflow === 'W04' && r.state === 'active')!.id
  })

  it('une opposition apparue pendant la reprise humaine arrête la séquence au lieu de la reprendre', () => {
    ok(novia.pro.takeOverConversation(oceane().id))
    const toRecover = novia.pro.cockpit(now()).revenue.toRecover
    // la cliente répond STOP pendant que Léa gère (simulé directement dans le store de démo)
    snap().customers.find((c) => c.id === oceane().id)!.optOut = true
    ok(novia.pro.letNoviaHandle(oceane().id))
    expect(run().state).toBe('stopped')
    expect(run().actions.at(-1)!.label).toMatch(/Opposition/)
    expect(novia.pro.cockpit(now()).revenue.toRecover).toBeLessThan(toRecover)
  })

  it('un nouveau RDV pris pendant la reprise humaine clôt la récupération (→ W02)', () => {
    ok(novia.pro.takeOverConversation(oceane().id))
    const slot = novia.pro.availableSlots(new Date(now().getFullYear(), now().getMonth(), now().getDate() + 2), 'semi-permanent')[0]
    novia.client.book({ serviceId: 'semi-permanent', start: slot, contact: { firstName: 'Océane', lastName: 'Blanc', phone: oceane().phone, email: oceane().email }, source: 'site', origin: 'site' })
    expect(run().state).toBe('completed')
    ok(novia.pro.letNoviaHandle(oceane().id))
    expect(run().state).toBe('completed')
  })
})

describe('Revenue : niveaux et double comptage sur les nouvelles actions', () => {
  it('un RDV Voice à 70 € est « réservé », jamais « confirmé », et compté une seule fois', () => {
    const before = novia.pro.revenueAttribution()
    const { appointment } = ok(novia.demo!.simulateIncomingCall())
    const after = novia.pro.revenueAttribution()
    expect(after.totals.booked - before.totals.booked).toBe(appointment.price)
    expect(after.totals.confirmed).toBe(before.totals.confirmed)
    expect(after.totals.potential).toBe(before.totals.potential)
    const sources = Object.entries(after.bySource).filter(([k, v]) => v.booked !== before.bySource[k as keyof typeof before.bySource].booked)
    expect(sources.map(([k]) => k)).toEqual(['voice'])
  })

  it('SmartFill : potentiel → réservé, un seul compte, visible dans l’agenda, la fiche et l’activité NOVIA', () => {
    const slot = novia.pro.cockpit(now()).freedSlots[0]
    const before = novia.pro.revenueAttribution()
    const res = ok(novia.pro.launchSmartFill(slot.id))!
    const after = novia.pro.revenueAttribution()
    expect(after.bySource.smartfill.booked - before.bySource.smartfill.booked).toBe(res.appointment.price)
    expect(after.totals.potential).toBeLessThan(before.totals.potential)
    expect(after.totals.confirmed).toBe(before.totals.confirmed)
    expect(snap().appointments.filter((a) => a.start === slot.slotStart && a.status === 'booked')).toHaveLength(1)
    expect(novia.pro.cockpit(now()).feed.some((f) => f.kind === 'win' && f.appointmentId === res.appointment.id)).toBe(true)
  })

  it('l’appel Voice apparaît dans l’activité NOVIA du cockpit', () => {
    const { appointment } = ok(novia.demo!.simulateIncomingCall())
    expect(novia.pro.cockpit(now()).feed.some((f) => f.kind === 'win' && f.appointmentId === appointment.id)).toBe(true)
  })

  it('aperçu d’appel : rien n’est réservé tant que l’appel n’aboutit pas', () => {
    const n = snap().appointments.length
    const plan = ok(novia.demo!.previewIncomingCall())
    expect(snap().appointments.length).toBe(n)
    const { appointment } = ok(novia.demo!.simulateIncomingCall())
    expect(appointment.start).toBe(plan.start.toISOString())
  })
})

describe('Démonstration : horloge et remise à zéro', () => {
  it('les nouveaux modules donnent le même scénario quelle que soit l’heure réelle', () => {
    const read = () => JSON.stringify([novia.now(), novia.pro.inbox(), novia.pro.voiceStats(), novia.pro.customers(now()).map((r) => r.segments), novia.pro.timeline('c13', now())])
    const views = ['2026-11-05T08:05:00+01:00', '2026-11-15T13:00:00+01:00', '2026-11-30T23:50:00+01:00', '2027-03-02T21:40:00+01:00'].map((t) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(t))
      const v = read()
      vi.useRealTimers()
      return v
    })
    expect(new Set(views).size).toBe(1)
  })

  it('réinitialiser la démo efface conversations, appels, réglages et reprises', () => {
    const fresh = createSeed(novia.now())
    ok(novia.demo!.simulateIncomingCall())
    ok(novia.pro.takeOverConversation('c13'))
    ok(novia.pro.updateSettings({ automations: { smartFill: false } }))
    const conv = novia.pro.inbox()[0].conversation.id
    ok(novia.pro.replyAsPro(conv, 'Test'))
    novia.demo!.reset()
    const s = snap()
    expect(s.calls).toEqual(fresh.calls)
    expect(s.conversations).toEqual(fresh.conversations)
    expect(s.settings).toEqual(fresh.settings)
    expect(s.customers.filter((c) => c.humanTakeover).map((c) => c.id)).toEqual(['c20'])
    expect(s.appointments.length).toBe(fresh.appointments.length)
  })
})

describe('Navigation mobile', () => {
  it('cinq onglets au plus, et chaque page Pro rattachée à un onglet', () => {
    expect(proTabs.length).toBeLessThanOrEqual(5)
    const main = Object.values(import.meta.glob('../main.tsx', { query: '?raw', import: 'default', eager: true }))[0] as string
    const block = main.slice(main.indexOf("path: '/pro'"))
    const paths = [...block.matchAll(/path: '([a-z]+)(?:\/:id)?'/g)].map((m) => `/pro/${m[1]}`)
    expect(paths.length).toBeGreaterThanOrEqual(10)
    for (const p of paths) {
      const owner = proTabs.find((t) => p.startsWith(t.to) && t.to !== '/pro') ?? proTabs.find((t) => t.also?.some((a) => p.startsWith(a)))
      expect(owner, p).toBeDefined()
    }
  })
})
