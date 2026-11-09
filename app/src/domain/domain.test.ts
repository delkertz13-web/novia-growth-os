import { describe, expect, it } from 'vitest'
import { parseWall } from '../core/time'
import { createDemoNovia } from '../app/demo'
import type { Appointment } from '../core/types'
import { demoProfile } from '../demo/config/profile'
import { rules } from '../demo/config/rules'
import { createSeed } from '../demo/seed'
import { createEngine, createMemoryStore, type NoviaSnapshot } from '../engine'
import { createFixedClock } from '../providers/clock'
import { DirectSmsProvider, LivePaymentProvider, LiveVoiceProvider, PlanityCalendarProvider } from '../providers/future'
import { createGHLProviders, GHLCrmMirrorProvider, GHLMessagingProvider, GHLVoiceProvider } from '../providers/ghl'
import { createMockProviders } from '../providers/mock'
import type { MessagingProvider } from '../providers/types'
import { buildCockpit, buildToday } from './cockpit'
import { createNovia } from './intents'
import { reactionFor } from './reactions'

const NOW = parseWall('2026-11-05T15:10:00', 'Europe/Paris')
const seed = createSeed(NOW)
const snap: NoviaSnapshot = seed
const TZ = demoProfile.identity.timezone.value
const emptyReport = () => {
  const z = () => ({ potential: 0, booked: 0, confirmed: 0 })
  return {
    totals: z(),
    bySource: { acquisition: z(), cancellation_recovery: z(), noshow_recovery: z(), reactivation: z(), referral: z(), smartfill: z(), voice: z(), direct: z() },
    awaitingProof: 0,
  }
}

describe('cockpit (lectures)', () => {
  it('classe la journée : à confirmer, prochain, à venir, terminé', async () => {
    const today = buildToday(snap, NOW, TZ)
    const states = today.map((i) => i.state)
    expect(states.filter((s) => s === 'to_confirm')).toHaveLength(2)
    expect(states.filter((s) => s === 'next')).toHaveLength(1)
    expect(states.indexOf('next')).toBeLessThan(states.lastIndexOf('upcoming'))
    expect(states).toContain('done')
  })

  it('remonte les présences à confirmer et le créneau libéré', async () => {
    const v = buildCockpit(snap, NOW, { all: emptyReport(), month: emptyReport() }, TZ)
    expect(v.toConfirm).toHaveLength(2)
    expect(v.freedSlots).toHaveLength(1)
    expect(v.takenOver.map((c) => c.id)).toEqual(['c20'])
    expect(v.feed.length).toBeGreaterThan(0)
  })
})

describe('réactions NOVIA', () => {
  const a: Appointment = seed.appointments.find((x) => x.customerId === 'c01' && x.serviceId === 'remplissage')!

  it('absence : statut, NOVIA Recovery démarre, 45 € à récupérer', async () => {
    const after = { ...a, status: 'no_show' as const }
    const run = { id: 'r1', businessId: seed.businessId, workflow: 'W04' as const, customerId: a.customerId, appointmentId: a.id, state: 'active' as const, step: 'wait' as const, messagesSent: 0, startedAt: NOW.toISOString(), actions: [] }
    const r = reactionFor('absent', a, after, { ...snap, runs: [run] }, rules, TZ)
    expect(r.steps.map((s) => s.key)).toEqual(['status', 'novia', 'money'])
    expect(r.steps[1].tone).toBe('novia')
    expect(r.steps[2].amount).toBe(45)
    expect(r.runId).toBe('r1')
  })

  it('absence sans séquence active : NOVIA reste en retrait', async () => {
    const r = reactionFor('absent', a, { ...a, status: 'no_show' }, { ...snap, runs: [] }, rules, TZ)
    expect(r.steps[1].tone).toBe('calm')
    expect(r.runId).toBeUndefined()
  })

  it('annulation à venir : le créneau libéré apparaît pour SmartFill', async () => {
    const future = seed.appointments.find((x) => x.status === 'cancelled')!
    const opp = seed.opportunities.find((o) => o.kind === 'smartfill' && o.sourceAppointmentId === future.id)!
    const r = reactionFor('cancelled', { ...future, status: 'confirmed' }, future, snap, rules, TZ)
    expect(r.steps.map((s) => s.key)).toContain('slot')
    expect(r.smartfillId).toBe(opp.id)
  })
})

describe('intentions métier (indépendantes du backend)', () => {
  /** une entreprise sur un store neuf, avec les providers donnés (Mock par défaut) */
  const setup = (opts: { messaging?: MessagingProvider; execution?: 'simulated' | 'shadow' | 'live' } = {}) => {
    const store = createMemoryStore(createSeed(NOW))
    const clock = createFixedClock(NOW)
    const providers = { ...createMockProviders(clock), ...(opts.messaging ? { messaging: opts.messaging } : {}) }
    const engine = createEngine({ store, profile: demoProfile, providers, execution: opts.execution ?? 'simulated' })
    return { store, novia: createNovia(engine) }
  }

  it('déclarer une absence passe par le moteur avec la source cockpit', async () => {
    const { novia } = setup()
    const a = seed.appointments.find((x) => x.customerId === 'c01' && x.serviceId === 'remplissage')!
    const res = await novia.pro.declareAbsence(a.id)
    expect(res.ok && res.value.stateLabel).toBe('Absente')
    expect(novia.snapshot().appointments.find((x) => x.id === a.id)!.history.at(-1)).toMatchObject({ to: 'no_show', source: 'cockpit' })
  })

  it('sans contrôles de démo, novia.demo est null', () => {
    expect(setup().novia.demo).toBeNull()
  })

  it('une erreur du provider devient un résultat lisible, sans exception', async () => {
    // messagerie préparée mais non branchée : la décision est enregistrée, l'envoi est marqué en échec
    const { novia, store } = setup({ messaging: GHLMessagingProvider })
    const start = novia.client.availableSlots(new Date(NOW.getTime() + 2 * 86_400_000), 'remplissage')[0]
    const res = await novia.client.book({ serviceId: 'remplissage', start, contact: { firstName: 'Test', lastName: 'Panne', phone: '06 98 76 54 32', email: 'panne@exemple.demo' }, source: 'site', origin: 'site' })
    expect(res.ok).toBe(true)
    const entry = store.read().outbox[0]
    expect(entry).toMatchObject({ status: 'failed', lastError: { code: 'not_connected', retryable: false } })
    expect(store.read().messages[0].status).toBe('failed')
    // un refus métier reste un résultat lisible
    const refused = await novia.pro.confirmPresence('inconnu')
    expect(refused).toEqual({ ok: false, error: 'Rendez-vous introuvable' })
  })
})

describe('providers préparés, non connectés', () => {
  it('chaque méthode GHL / SMS direct / Voice / Payment / Planity répond not_connected, sans exception', async () => {
    const write = { businessId: 'b1', idempotencyKey: 'k1' }
    const results = await Promise.all([
      GHLMessagingProvider.send({ ...write, to: { customerId: 'c1', phone: '', name: '' }, channel: 'sms', body: '', purpose: 'transactional' }),
      DirectSmsProvider.send({ ...write, to: { customerId: 'c1', phone: '', name: '' }, channel: 'sms', body: '', purpose: 'transactional' }),
      GHLCrmMirrorProvider.setOptOut({ ...write, customerId: 'c1', optOut: true }),
      GHLVoiceProvider.configure({ ...write, settings: { active: true, mode: 'missed' }, greeting: '' }),
      LiveVoiceProvider.configure({ ...write, settings: { active: true, mode: 'missed' }, greeting: '' }),
      LivePaymentProvider.createPaymentLink({ ...write, appointment: { id: 'a1', deposit: 10, price: 45 } }),
      PlanityCalendarProvider.listBusy({ businessId: 'b1', from: '', to: '' }),
    ])
    for (const r of results) expect(r).toMatchObject({ ok: false, error: { code: 'not_connected', retryable: false } })
    const ghl = createGHLProviders({ locationId: '', customFields: { noviaCustomerId: '', noviaMarketingConsent: '', noviaSource: '' }, tag: 'novia' })
    expect(Object.keys(ghl).sort()).toEqual(['crm', 'messaging', 'voice'])
  })
})

describe('parcours complet avec les providers Mock', () => {
  it('Absente → récupération W04 démarrée → 45 € à récupérer en plus', async () => {
    const novia = createDemoNovia()
    const now = novia.now()
    const before = novia.pro.cockpit(now)
    const target = before.toConfirm.find((a) => a.price === 45)!
    const res = await novia.pro.declareAbsence(target.id)
    expect(res.ok).toBe(true)
    const after = novia.pro.cockpit(now)
    expect(after.toConfirm.find((a) => a.id === target.id)).toBeUndefined()
    expect(after.recoveries.active.length).toBe(before.recoveries.active.length + 1)
    expect(after.revenue.toRecover - before.revenue.toRecover).toBe(45)
  })

  it('reprendre la conversation met la séquence en pause ; rendre à NOVIA la relance', async () => {
    const novia = createDemoNovia()
    const run = novia.snapshot().runs.find((r) => r.state === 'active')!
    await novia.pro.takeOverConversation(run.customerId)
    // Lot 6 : la reprise humaine suspend (pause) au lieu d'arrêter, sans aucun envoi
    expect(novia.snapshot().runs.find((r) => r.id === run.id)!.state).toBe('paused')
    expect(novia.pro.customerFile(run.customerId, novia.now())!.contactable).toBe(false)
    await novia.pro.letNoviaHandle(run.customerId)
    expect(novia.snapshot().customers.find((c) => c.id === run.customerId)!.humanTakeover).toBe(false)
    expect(novia.snapshot().runs.find((r) => r.id === run.id)!.state).toBe('active')
  })
})
