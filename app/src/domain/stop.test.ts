/**
 * Règle STOP (kertz, 2026-11-06) : NOVIA n'initie plus rien de commercial vers une cliente
 * opposée, mais peut toujours répondre à ce qu'elle demande elle-même. Répondre ou la laisser
 * réserver ne retire jamais son opposition.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rules } from '../config/rules.demo'
import { services } from '../config/services.demo'
import { mayInitiateOutbound } from '../core/optout'
import { providers } from '../providers/mock'
import { createSeed } from '../providers/mock/seed'
import { setState } from '../providers/mock/store'
import { createNovia } from './intents'

const novia = createNovia(providers, { rules, services })
const now = () => novia.now()
const snap = () => novia.snapshot()
const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const customer = (id: string) => snap().customers.find((c) => c.id === id)!
/** la cliente répond STOP (dans la démo, l'opposition est posée directement dans le store) */
const stop = (id: string) => setState((s) => ({ ...s, customers: s.customers.map((c) => (c.id === id ? { ...c, optOut: true } : c)) }))
const runsOf = (id: string) => snap().runs.filter((r) => r.customerId === id)
const LOUISE = 'c16' // opposée dans le scénario de référence

const network = { fetch: vi.fn(), xhr: vi.fn(), ws: vi.fn() }
beforeEach(() => {
  providers.demo!.reset()
  vi.stubGlobal('fetch', network.fetch)
  vi.stubGlobal('XMLHttpRequest', network.xhr)
  vi.stubGlobal('WebSocket', network.ws)
})
afterEach(() => {
  for (const spy of Object.values(network)) expect(spy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

/** Louise écrit d'elle-même et réserve, comme une cliente qui revient après STOP. */
function louiseComesBack() {
  const conv = ok(novia.pro.conversationFor(LOUISE))
  const faq = ok(novia.demo!.simulateClientMessage(conv.id, 'Combien coûte une pose complète ?'))
  const own = ok(novia.demo!.simulateClientMessage(conv.id, 'À quelle heure est mon rendez-vous ?'))
  const t = now()
  let start: Date | undefined
  for (let d = 2; !start; d++) start = novia.client.availableSlots(new Date(t.getFullYear(), t.getMonth(), t.getDate() + d), 'remplissage')[0]
  const l = customer(LOUISE)
  const appt = novia.client.book({
    serviceId: 'remplissage',
    start,
    contact: { firstName: l.firstName, lastName: l.lastName, phone: l.phone, email: l.email },
    source: 'site',
    origin: 'site',
  })
  return { conv, faq, own, appt }
}

describe('STOP : NOVIA n’initie plus rien de commercial', () => {
  it('1. une absence ne déclenche aucune récupération sortante, même quand le temps passe', () => {
    const target = novia.pro.cockpit(now()).toConfirm[0]
    stop(target.customerId)
    const sent = snap().messages.length
    ok(novia.pro.declareAbsence(target.id))
    const run = runsOf(target.customerId).find((r) => r.appointmentId === target.id)!
    expect(run.state).toBe('stopped')
    expect(run.messagesSent).toBe(0)
    expect(run.actions.at(-1)!.label).toMatch(/STOP/)
    novia.demo!.advanceRecovery(run.id)
    expect(runsOf(target.customerId).find((r) => r.id === run.id)!.messagesSent).toBe(0)
    expect(snap().messages.length).toBe(sent)
  })

  it('1. une annulation ne déclenche pas de relance, et SmartFill ne la sollicite jamais', () => {
    const next = novia.pro.cockpit(now()).today.find((i) => i.state === 'next')!.appointment
    stop(next.customerId)
    ok(novia.pro.cancelAppointment(next.id))
    expect(runsOf(next.customerId).filter((r) => r.state === 'active')).toHaveLength(0)
    for (const slot of novia.pro.cockpit(now()).freedSlots) {
      const funnel = novia.pro.previewSmartFill(slot.id)!
      expect(funnel.contactable.some((c) => c.optOut)).toBe(false)
    }
    expect(mayInitiateOutbound(customer(LOUISE))).toBe(false)
  })
})

describe('STOP : la cliente peut toujours demander, NOVIA peut répondre', () => {
  it('2–3. une cliente STOP ouvre la conversation ; NOVIA répond à une question de service', () => {
    const { conv, faq, own } = louiseComesBack()
    expect(faq.kind).toBe('faq')
    const thread = novia.pro.conversation(conv.id)!.conversation.messages
    expect(thread[0].from).toBe('client')
    expect(thread.some((m) => m.from === 'novia')).toBe(true)
    // une question sans réponse approuvée est transmise à Léa, comme pour toute cliente (jamais ignorée)
    expect(own.kind).toBe('unknown')
    expect(novia.pro.conversation(conv.id)!.state).toBe('needs_human')
  })

  it('4–5. répondre ne relance rien et l’opposition reste active', () => {
    const runs = JSON.stringify(snap().runs)
    const sent = snap().messages.length
    louiseComesBack()
    expect(customer(LOUISE).optOut).toBe(true)
    expect(JSON.stringify(snap().runs.filter((r) => r.customerId === LOUISE))).toBe(JSON.stringify(JSON.parse(runs).filter((r: { customerId: string }) => r.customerId === LOUISE)))
    // seul le message de service lié à SA réservation est simulé, aucune sollicitation commerciale
    expect(snap().messages.slice(sent).every((m) => m.customerId === LOUISE && m.purpose.startsWith('W02'))).toBe(true)
    expect(mayInitiateOutbound(customer(LOUISE))).toBe(false)
  })

  it('6. réserver d’elle-même ne vaut pas réinscription : toujours opposée, jamais relancée', () => {
    const { appt } = louiseComesBack()
    expect(appt.customerId).toBe(LOUISE)
    expect(customer(LOUISE).optOut).toBe(true)
    expect(customer(LOUISE).consent.marketing).toBe(createSeed(now()).customers.find((c) => c.id === LOUISE)!.consent.marketing)
    // si elle manque ce nouveau RDV, NOVIA ne la relance pas
    setState((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === appt.id ? { ...a, start: new Date(now().getTime() - 3 * 3_600_000).toISOString() } : a)) }))
    ok(novia.pro.declareAbsence(appt.id))
    const run = runsOf(LOUISE).find((r) => r.appointmentId === appt.id)!
    expect(run.state).toBe('stopped')
    expect(run.messagesSent).toBe(0)
  })

  it('7. la réinitialisation restaure exactement le scénario de référence et ses KPI', () => {
    louiseComesBack()
    stop('c01')
    providers.demo!.reset()
    expect(JSON.stringify(snap())).toBe(JSON.stringify(createSeed(now())))
    expect(novia.pro.cockpit(now()).revenue).toEqual({ todayBooked: 295, todayConfirmed: 35, toRecover: 80, noviaWonThisMonth: 245, noviaConfirmedThisMonth: 0 })
  })
})
