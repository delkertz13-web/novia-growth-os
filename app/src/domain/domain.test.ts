import { describe, expect, it, vi } from 'vitest'
import { rules } from '../config/rules.demo'
import { services } from '../config/services.demo'
import type { Appointment } from '../core/types'
import { GHLAutomationProvider, GHLBookingProvider, GHLCRMProvider, createGHLProviders } from '../providers/ghl'
import { LivePaymentProvider, LiveVoiceProvider } from '../providers/future'
import { providers as mockProviders } from '../providers/mock'
import { createSeed } from '../providers/mock/seed'
import { NotConnectedError } from '../providers/notConnected'
import type { NoviaSnapshot, Providers } from '../providers/types'
import { buildCockpit, buildToday } from './cockpit'
import { createNovia } from './intents'
import { reactionFor } from './reactions'

const NOW = new Date('2026-11-05T15:10:00')
const seed = createSeed(NOW)
const snap: NoviaSnapshot = seed
const emptyReport = () => {
  const z = () => ({ potential: 0, booked: 0, confirmed: 0 })
  return {
    totals: z(),
    bySource: { acquisition: z(), cancellation_recovery: z(), noshow_recovery: z(), reactivation: z(), referral: z(), smartfill: z(), direct: z() },
    awaitingProof: 0,
  }
}

describe('cockpit (lectures)', () => {
  it('classe la journée : à confirmer, prochain, à venir, terminé', () => {
    const today = buildToday(snap, NOW)
    const states = today.map((i) => i.state)
    expect(states.filter((s) => s === 'to_confirm')).toHaveLength(2)
    expect(states.filter((s) => s === 'next')).toHaveLength(1)
    expect(states.indexOf('next')).toBeLessThan(states.lastIndexOf('upcoming'))
    expect(states).toContain('done')
  })

  it('remonte les présences à confirmer et le créneau libéré', () => {
    const v = buildCockpit(snap, NOW, { all: emptyReport(), month: emptyReport() })
    expect(v.toConfirm).toHaveLength(2)
    expect(v.freedSlots).toHaveLength(1)
    expect(v.takenOver.map((c) => c.id)).toEqual(['c20'])
    expect(v.feed.length).toBeGreaterThan(0)
  })
})

describe('réactions NOVIA', () => {
  const a: Appointment = seed.appointments.find((x) => x.customerId === 'c01' && x.serviceId === 'remplissage')!

  it('absence : statut, NOVIA Recovery démarre, 45 € à récupérer', () => {
    const after = { ...a, status: 'no_show' as const }
    const run = { id: 'r1', workflow: 'W04' as const, customerId: a.customerId, appointmentId: a.id, state: 'active' as const, step: 'wait' as const, messagesSent: 0, startedAt: NOW.toISOString(), actions: [] }
    const r = reactionFor('absent', a, after, { ...snap, runs: [run] }, rules)
    expect(r.steps.map((s) => s.key)).toEqual(['status', 'novia', 'money'])
    expect(r.steps[1].tone).toBe('novia')
    expect(r.steps[2].amount).toBe(45)
    expect(r.runId).toBe('r1')
  })

  it('absence sans séquence active : NOVIA reste en retrait', () => {
    const r = reactionFor('absent', a, { ...a, status: 'no_show' }, { ...snap, runs: [] }, rules)
    expect(r.steps[1].tone).toBe('calm')
    expect(r.runId).toBeUndefined()
  })

  it('annulation à venir : le créneau libéré apparaît pour SmartFill', () => {
    const future = seed.appointments.find((x) => x.status === 'cancelled')!
    const opp = seed.opportunities.find((o) => o.kind === 'smartfill' && o.sourceAppointmentId === future.id)!
    const r = reactionFor('cancelled', { ...future, status: 'confirmed' }, future, snap, rules)
    expect(r.steps.map((s) => s.key)).toContain('slot')
    expect(r.smartfillId).toBe(opp.id)
  })
})

describe('intentions métier (indépendantes du backend)', () => {
  const fake = (overrides: Partial<Providers> = {}) => {
    const validate = vi.fn((id: string, outcome: string) => ({ ...seed.appointments.find((x) => x.id === id)!, status: outcome === 'present' ? 'showed' : 'no_show' }) as Appointment)
    const p = {
      ...mockProviders,
      demo: undefined,
      sync: { getSnapshot: () => snap, subscribe: () => () => {} },
      booking: { ...mockProviders.booking, validate },
      ...overrides,
    } satisfies Providers
    return { p, validate }
  }

  it('déclarer une absence passe par booking.validate avec la source cockpit', () => {
    const { p, validate } = fake()
    const novia = createNovia(p, { rules, services })
    const a = seed.appointments.find((x) => x.customerId === 'c01' && x.serviceId === 'remplissage')!
    const res = novia.pro.declareAbsence(a.id)
    expect(validate).toHaveBeenCalledWith(a.id, 'absent', { source: 'cockpit', newStart: undefined })
    expect(res.ok && res.value.stateLabel).toBe('Absente')
  })

  it('sans contrôles de démo, novia.demo est null', () => {
    const novia = createNovia(fake().p, { rules, services })
    expect(novia.demo).toBeNull()
  })

  it('une erreur du provider devient un résultat lisible, sans exception', () => {
    const novia = createNovia(fake({ booking: GHLBookingProvider }).p, { rules, services })
    const res = novia.pro.confirmPresence(seed.appointments[0].id)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/non connectée/)
  })
})

describe('providers préparés, non connectés', () => {
  it('chaque méthode GHL / Voice / Payment lève NotConnectedError', () => {
    expect(() => GHLCRMProvider.listCustomers()).toThrow(NotConnectedError)
    expect(() => GHLAutomationProvider.launchSmartFill('o1')).toThrow(NotConnectedError)
    expect(() => LiveVoiceProvider.getSettings()).toThrow(NotConnectedError)
    expect(() => LivePaymentProvider.recordDemoPayment('a1')).toThrow(NotConnectedError)
    const ghl = createGHLProviders({ locationId: '', calendarId: '', pipelineId: '', customFields: { attendance: '', attributionSource: '', noShowRecovered: '', humanTakeover: '' } })
    expect(Object.keys(ghl).sort()).toEqual(['analytics', 'automation', 'booking', 'crm', 'messaging', 'sync'])
  })
})

describe('parcours complet avec les providers Mock', () => {
  it('Absente → récupération W04 démarrée → 45 € à récupérer en plus', () => {
    const novia = createNovia(mockProviders, { rules, services })
    const now = novia.now()
    const before = novia.pro.cockpit(now)
    const target = before.toConfirm.find((a) => a.price === 45)!
    const res = novia.pro.declareAbsence(target.id)
    expect(res.ok).toBe(true)
    const after = novia.pro.cockpit(now)
    expect(after.toConfirm.find((a) => a.id === target.id)).toBeUndefined()
    expect(after.recoveries.active.length).toBe(before.recoveries.active.length + 1)
    expect(after.revenue.toRecover - before.revenue.toRecover).toBe(45)
  })

  it('reprendre la conversation arrête la séquence ; NOVIA peut ensuite regérer', () => {
    const novia = createNovia(mockProviders, { rules, services })
    const run = novia.snapshot().runs.find((r) => r.state === 'active')!
    novia.pro.takeOverConversation(run.customerId)
    expect(novia.snapshot().runs.find((r) => r.id === run.id)!.state).toBe('stopped')
    expect(novia.pro.customerFile(run.customerId, novia.now())!.contactable).toBe(false)
    novia.pro.letNoviaHandle(run.customerId)
    expect(novia.snapshot().customers.find((c) => c.id === run.customerId)!.humanTakeover).toBe(false)
  })
})
