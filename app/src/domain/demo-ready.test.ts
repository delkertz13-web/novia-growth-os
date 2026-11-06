/**
 * Lot 7 — démonstration commerciale : remise à zéro totale, répétée, sans résidu,
 * parcours critique rejoué deux fois avec le même résultat, mode présentation inoffensif.
 * Providers Mock réels, jeu de démonstration de référence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeed } from '../providers/mock/seed'
import { rules } from '../config/rules.demo'
import { services } from '../config/services.demo'
import { providers } from '../providers/mock'
import { presentation, presentationSteps } from '../ui/presentation'
import { createNovia } from './intents'

const novia = createNovia(providers, { rules, services })
const now = () => novia.now()
const snap = () => novia.snapshot()
const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const reference = { todayBooked: 295, todayConfirmed: 35, toRecover: 80, noviaWonThisMonth: 245, noviaConfirmedThisMonth: 0 }

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

/** Le parcours commercial complet, tel qu'il est montré en rendez-vous. Rend ce que l'on observe à l'écran. */
function playCommercialPath() {
  const t = now()
  // 1. Côté cliente : une réservation sur le site
  const day = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 2)
  const start = novia.client.availableSlots(day, 'pose-gel')[0]
  const booking = novia.client.book({
    serviceId: 'pose-gel',
    start,
    contact: { firstName: 'Zélie', lastName: 'Test', phone: '06 11 22 33 44', email: 'zelie@example.test' },
    source: 'site',
    origin: 'site',
  })
  // 2. Côté pro : une absence déclarée, NOVIA la récupère
  const absent = novia.pro.cockpit(t).toConfirm[0]
  ok(novia.pro.declareAbsence(absent.id))
  const recovery = snap().runs.find((r) => r.appointmentId === absent.id && r.state === 'active')!
  novia.demo!.advanceRecovery(recovery.id)
  const rebooked = novia.demo!.clientRebooks(recovery.id)
  // 3. SmartFill sur un créneau libéré
  const slot = novia.pro.cockpit(t).freedSlots[0]
  const filled = ok(novia.pro.launchSmartFill(slot.id))!
  // 4. Reprise humaine, puis rendre à NOVIA
  ok(novia.pro.takeOverConversation('c13'))
  const paused = snap().runs.filter((r) => r.customerId === 'c13' && r.state === 'paused').length
  ok(novia.pro.letNoviaHandle('c13'))
  // 5. NOVIA Voice : un appel devient un RDV
  const { appointment: voiceAppt } = ok(novia.demo!.simulateIncomingCall())
  // 6. Réglages
  ok(novia.pro.updateSettings({ sendWindow: { start: '10:00', end: '19:00' } }))

  const c = novia.pro.cockpit(t)
  const r = novia.pro.revenueAttribution()
  return {
    booking: [booking.start, booking.serviceId, booking.status],
    absent: absent.id,
    rebooked: rebooked && [rebooked.start, rebooked.attribution],
    recovery: snap().runs.find((x) => x.id === recovery.id)!.state,
    smartfill: [filled.appointment.start, filled.customer.id],
    paused,
    afterHandBack: snap().runs.filter((x) => x.customerId === 'c13').map((x) => x.state),
    voice: [voiceAppt.start, voiceAppt.price, voiceAppt.attribution],
    kpis: c.revenue,
    totals: r.totals,
    bySource: r.bySource,
    counts: [snap().appointments.length, snap().calls.length, snap().runs.length, snap().conversations.length],
  }
}

describe('Remise à zéro de la démonstration', () => {
  it('après le parcours complet, l’état est exactement celui du scénario de départ', () => {
    const fresh = JSON.stringify(createSeed(now()))
    expect(JSON.stringify(snap())).toBe(fresh)
    playCommercialPath()
    expect(JSON.stringify(snap())).not.toBe(fresh)
    novia.demo!.reset()
    expect(JSON.stringify(snap())).toBe(fresh)
  })

  it('les indicateurs de référence reviennent après chaque remise à zéro (295 / 35 / 80 / 245)', () => {
    expect(novia.pro.cockpit(now()).revenue).toEqual(reference)
    for (let i = 0; i < 3; i++) {
      playCommercialPath()
      expect(novia.pro.cockpit(now()).revenue).not.toEqual(reference)
      novia.demo!.reset()
      expect(novia.pro.cockpit(now()).revenue).toEqual(reference)
    }
  })

  it('plusieurs remises à zéro consécutives donnent le même état (idempotence)', () => {
    playCommercialPath()
    novia.demo!.reset()
    const once = JSON.stringify(snap())
    novia.demo!.reset()
    novia.demo!.reset()
    expect(JSON.stringify(snap())).toBe(once)
  })

  it('aucun résidu : RDV, appels, reprises, réglages, séquences et identifiants repartent de zéro', () => {
    const fresh = createSeed(now())
    playCommercialPath()
    novia.demo!.reset()
    const s = snap()
    expect(s.appointments.map((a) => a.id)).toEqual(fresh.appointments.map((a) => a.id))
    expect(s.calls).toEqual(fresh.calls)
    expect(s.runs).toEqual(fresh.runs)
    expect(s.opportunities).toEqual(fresh.opportunities)
    expect(s.settings).toEqual(fresh.settings)
    expect((s as unknown as { seq: number }).seq).toBe(fresh.seq)
    expect(s.customers.find((c) => c.firstName === 'Zélie')).toBeUndefined()
    // les scripts Voice repartent du premier appel
    expect(novia.pro.voiceStats()).toEqual({ received: 5, takenByNovia: 4, booked: 2, transferred: 1 })
  })
})

describe('Parcours commercial critique', () => {
  it('rejoué après une remise à zéro, il donne exactement le même résultat', () => {
    const first = playCommercialPath()
    novia.demo!.reset()
    const second = playCommercialPath()
    expect(second).toEqual(first)
  })

  it('chaque étape produit l’effet montré en démo', () => {
    const before = novia.pro.revenueAttribution().totals
    const r = playCommercialPath()
    expect(r.booking[2]).toBe('booked')
    expect(r.rebooked?.[1]).toBe('noshow_recovery')
    expect(r.recovery).toBe('completed')
    expect(r.paused).toBeGreaterThan(0)
    expect(r.afterHandBack).not.toContain('paused')
    expect(r.voice[2]).toBe('voice')
    // un RDV Voice ou SmartFill n'est jamais du CA confirmé
    expect(r.totals.confirmed).toBe(before.confirmed)
    // aucun créneau réservé deux fois
    const active = snap().appointments.filter((a) => a.status === 'booked' || a.status === 'confirmed')
    expect(new Set(active.map((a) => a.start)).size).toBe(active.length)
  })

  it('STOP reçu pendant la reprise humaine : NOVIA ne reprend pas au retour', () => {
    ok(novia.pro.takeOverConversation('c13'))
    snap().customers.find((c) => c.id === 'c13')!.optOut = true
    ok(novia.pro.letNoviaHandle('c13'))
    expect(snap().runs.filter((r) => r.customerId === 'c13').every((r) => r.state !== 'active' && r.state !== 'paused')).toBe(true)
    // aucun message de relance n'est plus simulé pour elle, même si la démo fait avancer le temps
    const sent = snap().runs.filter((r) => r.customerId === 'c13').map((r) => r.messagesSent)
    for (const r of snap().runs.filter((x) => x.customerId === 'c13')) novia.demo!.advanceRecovery(r.id)
    expect(snap().runs.filter((r) => r.customerId === 'c13').map((r) => r.messagesSent)).toEqual(sent)
  })
})

describe('Mode présentation', () => {
  it('ne modifie jamais le scénario NOVIA', () => {
    const before = JSON.stringify(snap())
    presentation.set({ on: true })
    for (let i = 0; i < presentationSteps.length; i++) presentation.set({ step: i })
    presentation.set({ step: 99 })
    expect(presentation.get().step).toBe(presentationSteps.length - 1)
    presentation.set({ on: false, step: 0 })
    expect(JSON.stringify(snap())).toBe(before)
  })

  it('18 étapes, chacune vers une page qui existe', () => {
    expect(presentationSteps).toHaveLength(18)
    const main = Object.values(import.meta.glob('../main.tsx', { query: '?raw', import: 'default', eager: true }))[0] as string
    const client = [...main.matchAll(/path: '(\/[a-z]*)'/g)].map((m) => m[1])
    const pro = [...main.slice(main.indexOf("path: '/pro'")).matchAll(/path: '([a-z]+)(\/:id)?'/g)].map((m) => [`/pro/${m[1]}`, !!m[2]] as const)
    const s = snap()
    for (const step of presentationSteps) {
      if (step.path === '/pro' || client.includes(step.path)) continue
      const route = pro.find(([p, param]) => (param ? step.path.startsWith(p + '/') : step.path === p))
      expect(route, step.path).toBeDefined()
      // les étapes qui pointent une fiche ou une conversation désignent des données du scénario
      const id = step.path.split('/')[3]
      if (step.path.startsWith('/pro/clientes/')) expect(s.customers.some((c) => c.id === id)).toBe(true)
      if (step.path.startsWith('/pro/messages/')) expect(s.conversations.some((c) => c.id === id)).toBe(true)
    }
  })
})
