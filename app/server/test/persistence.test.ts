/**
 * PostgreSQL = source de vérité : ce que le moteur décide est enregistré, et relu à
 * l'identique (aucune perte, aucune transformation), y compris un état riche.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { emptyState, type NoviaState } from '../../src/engine/model'
import { createSeed } from '../../src/demo/seed'
import { loadState, saveState } from '../repositories/state'
import { admin, contact, setup, T0 } from './fixtures'
import { hasPg } from './pg'

/** l'état de démonstration, réattribué à une autre entreprise et sans preuve « démo » */
function richState(businessId: string): NoviaState {
  const seed = createSeed(T0)
  const own = <T extends { businessId?: string }>(x: T) => ({ ...x, businessId })
  const { seededAt, ...rest } = seed
  void seededAt
  return {
    ...rest,
    businessId,
    customers: seed.customers.map(own),
    appointments: seed.appointments.map((a) => ({ ...own(a), ...(a.paymentProof ? { paymentProof: { ...a.paymentProof, kind: 'declared' as const } } : {}) })),
    runs: seed.runs.map(own),
    opportunities: seed.opportunities.map(own),
    waitlist: seed.waitlist.map(own),
    conversations: seed.conversations.map(own),
    calls: seed.calls.map(own),
    messages: seed.messages.map(own),
  }
}

const comparable = (s: NoviaState) => ({
  ...s,
  conversations: [...s.conversations].sort((a, b) => a.id.localeCompare(b.id)),
  calls: [...s.calls].sort((a, b) => a.id.localeCompare(b.id)),
  messages: [...s.messages].sort((a, b) => a.id.localeCompare(b.id)).map(({ to, ...m }) => (void to, m)),
  customers: [...s.customers].sort((a, b) => a.id.localeCompare(b.id)),
  appointments: [...s.appointments].sort((a, b) => a.id.localeCompare(b.id)),
  runs: [...s.runs].sort((a, b) => a.id.localeCompare(b.id)),
  opportunities: [...s.opportunities].sort((a, b) => a.id.localeCompare(b.id)),
  waitlist: [...s.waitlist].sort((a, b) => a.id.localeCompare(b.id)),
  journal: [],
  inbox: [],
})

describe.skipIf(!hasPg())('persistance PostgreSQL', () => {
  let t: Awaited<ReturnType<typeof setup>>
  beforeAll(async () => {
    t = await setup({ businesses: [{ id: 'salon-a', verified: true }, { id: 'roundtrip' }] })
  })
  afterAll(() => t.close())

  it('un état riche (clientes, RDV, séquences, conversations, consentements…) est relu à l’identique', async () => {
    const rich = richState('roundtrip')
    await t.db.businessTx('roundtrip', async (c) => {
      const base = await loadState(c, 'roundtrip')
      const empty = { ...emptyState('roundtrip', base.settings, base.voice), seq: base.seq }
      await saveState(c, empty, { ...rich, settings: base.settings, voice: base.voice }, admin)
    })
    const back = await t.db.businessTx('roundtrip', (c) => loadState(c, 'roundtrip'))
    expect(comparable(back)).toEqual(comparable({ ...rich, settings: back.settings, voice: back.voice }))
    expect(back.customers.length).toBeGreaterThan(10)
  })

  it('une réservation passe par le moteur et survit à un nouveau chargement', async () => {
    const r = await t.app.command('salon-a', { type: 'user', id: 'u1' }, {
      type: 'BookingCreated',
      serviceId: 'pose',
      start: new Date(T0.getTime() + 2 * 86_400_000).toISOString(),
      contact: contact(1),
      leadSource: 'manual',
      origin: 'pro',
    })
    expect(r.value.ok).toBe(true)
    const { state, revision } = await t.app.snapshot('salon-a')
    expect(revision).toBeGreaterThan(0)
    expect(state.appointments).toHaveLength(1)
    expect(state.customers[0]).toMatchObject({ firstName: 'Test1', consent: { transactional: true } })
    // confirmation W02 décidée, jamais envoyée : statut shadow
    expect(state.messages[0]).toMatchObject({ purpose: 'W02 · confirmation', status: 'shadow' })
    expect(state.outbox[0]).toMatchObject({ status: 'shadow', attempts: 0 })
  })
})
