/**
 * Front pilote (P2) : le navigateur est un client. Ses écritures partent au serveur,
 * l'état affiché est celui du serveur, rien n'est persisté localement, et un second
 * appareil voit les changements du premier. Le « serveur » est ici le vrai moteur NOVIA
 * en exécution shadow (le test HTTP réel est dans server/test/http.test.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BusinessProfile } from '../config/profile'
import { parseWall } from '../core/time'
import { createNovia } from '../domain/intents'
import { createEngine, createMemoryStore, emptyState, type NoviaState } from '../engine'
import type { Draft } from '../engine/engine'
import { createFixedClock } from '../providers/clock'
import { createMockProviders } from '../providers/mock'
import { createPilotProfile } from './profile'
import { createRemoteEngine, type PilotTransport } from './remote'

const TZ = 'Europe/Paris'
const NOW = parseWall('2026-12-01T10:00:00', TZ)
const verified = (p: BusinessProfile): BusinessProfile => JSON.parse(JSON.stringify(p), (k, v) => (k === 'status' && v === 'unknown' ? 'verified' : v))

function fakeServer() {
  const profile = verified(createPilotProfile('pilot-x', TZ))
  profile.services = { status: 'verified', items: [{ id: 'pose', name: 'Pose', description: '', durationMin: 60, price: 50, deposit: 0, category: 'pose', returnRecommendedAfterDays: 21, active: true, coverImageId: '' }] }
  const store = createMemoryStore<NoviaState>(emptyState('pilot-x', profile.defaultSettings))
  const engine = createEngine({ store, profile, providers: createMockProviders(createFixedClock(NOW)), execution: 'shadow' })
  let revision = 0
  const received: Draft[] = []
  const transport: PilotTransport = {
    state: async () => JSON.parse(JSON.stringify({ state: store.read(), profile, revision })),
    revision: async () => revision,
    async command(draft) {
      received.push(draft)
      const before = store.read()
      const result = await engine.execute({ ...draft, source: 'novia-pro' })
      if (store.read() !== before) revision++
      return JSON.parse(JSON.stringify({ result, revision }))
    },
  }
  return { transport, received, store }
}

describe('front pilote : client de l’API NOVIA', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('une écriture part au serveur sans enveloppe ; l’état affiché est relu du serveur ; rien en stockage local', async () => {
    const server = fakeServer()
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem, getItem: () => null, removeItem: vi.fn() })
    const device = createRemoteEngine(await server.transport.state(), server.transport, createFixedClock(NOW))
    const novia = createNovia(device.engine)
    expect(novia.execution).toBe('shadow')
    const r = await novia.client.book({ serviceId: 'pose', start: new Date(NOW.getTime() + 26 * 3_600_000), contact: { firstName: 'Test', lastName: 'Cliente', phone: '06 00 00 00 01', email: 't@exemple.invalid' }, source: 'site', origin: 'site' })
    expect(r.ok).toBe(true)
    // le navigateur n'a choisi ni la source, ni l'identifiant, ni la date de l'événement
    expect(server.received[0]).not.toHaveProperty('source')
    expect(server.received[0]).not.toHaveProperty('eventId')
    expect(server.received[0]).not.toHaveProperty('businessId')
    expect(novia.snapshot().appointments).toHaveLength(1)
    expect(novia.snapshot()).toEqual(server.store.read())
    expect(setItem).not.toHaveBeenCalled()
  })

  it('deux appareils : B voit ce que A a fait après synchronisation', async () => {
    const server = fakeServer()
    const a = createRemoteEngine(await server.transport.state(), server.transport, createFixedClock(NOW))
    const b = createRemoteEngine(await server.transport.state(), server.transport, createFixedClock(NOW))
    const novA = createNovia(a.engine)
    const novB = createNovia(b.engine)
    await novA.client.book({ serviceId: 'pose', start: new Date(NOW.getTime() + 26 * 3_600_000), contact: { firstName: 'Test', lastName: 'Cliente', phone: '06 00 00 00 01', email: 't@exemple.invalid' }, source: 'site', origin: 'site' })
    expect(novB.snapshot().appointments).toHaveLength(0)
    const seen = vi.fn()
    novB.subscribe(seen)
    await b.sync()
    expect(novB.snapshot().appointments).toHaveLength(1)
    expect(seen).toHaveBeenCalled()
  })

  it('serveur injoignable : résultat explicite, aucune décision prise localement', async () => {
    const server = fakeServer()
    const device = createRemoteEngine(await server.transport.state(), { ...server.transport, command: () => Promise.reject(new Error('Serveur NOVIA injoignable')) }, createFixedClock(NOW))
    const r = await createNovia(device.engine).client.book({ serviceId: 'pose', start: new Date(NOW.getTime() + 26 * 3_600_000), contact: { firstName: 'Test', lastName: 'Cliente', phone: '06 00 00 00 01', email: 't@exemple.invalid' }, source: 'site', origin: 'site' })
    expect(r).toEqual({ ok: false, error: 'Serveur NOVIA injoignable' })
    expect(device.engine.store.read().appointments).toHaveLength(0)
    expect(await device.engine.tick()).toBe(0)
  })
})
