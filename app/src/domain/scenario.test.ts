/**
 * Mode démo déterministe : le scénario dépend de l'heure de référence (config/demo.ts),
 * jamais de l'heure réelle. Ces tests vérifient :
 *   1. que le cockpit est identique quelle que soit l'heure réelle de présentation ;
 *   2. que la référence produit toutes les situations de la démonstration ;
 *   3. qu'aucun code ne lit l'heure réelle en dehors de l'horloge.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { business } from '../config/business.demo'
import { demoScenario } from '../config/demo'
import { rules } from '../config/rules.demo'
import { services } from '../config/services.demo'
import { appointmentEnd, isActiveBooking } from '../core/appointmentStatus'
import { refillsDue } from '../core/smartfill'
import { reminderTimes } from '../core/workflows'
import { providers } from '../providers/mock'
import { createNovia } from './intents'

const novia = createNovia(providers, { rules, services })
const REF = new Date(demoScenario.referenceDate)

const realMoments = [
  '2026-11-05T08:05:00+01:00', // jeudi matin, avant l'ouverture
  '2026-11-10T21:40:00+01:00', // mardi soir, hors plage d'envoi
  '2026-11-15T13:00:00+01:00', // dimanche, salon fermé
  '2026-11-30T23:55:00+01:00', // dernier jour du mois, avant minuit
  '2027-03-02T10:00:00+01:00', // des mois plus tard
]

afterEach(() => vi.useRealTimers())

const view = () => {
  const n = novia.now()
  const c = novia.pro.cockpit(n)
  return { now: n.toISOString(), today: c.today.map((i) => [i.appointment.id, i.state]), toConfirm: c.toConfirm.map((a) => a.id), freed: c.freedSlots.map((o) => o.id), revenue: c.revenue, runs: c.recoveries.active.map((r) => r.id) }
}

describe('heure réelle sans effet', () => {
  it('le cockpit est identique quel que soit le moment où l’on présente', () => {
    const seen = realMoments.map((m) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(m))
      providers.demo!.reset()
      const v = view()
      vi.useRealTimers()
      return v
    })
    for (const v of seen) expect(v).toEqual(seen[0])
    expect(seen[0].now).toBe(REF.toISOString())
  })

  it('la même action produit la même réaction, matin ou soir', () => {
    const run = (m: string) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(m))
      providers.demo!.reset()
      const a = novia.pro.cockpit(novia.now()).toConfirm.find((x) => x.price === 45)!
      const r = novia.pro.declareAbsence(a.id)
      vi.useRealTimers()
      return { r, after: view() }
    }
    expect(run(realMoments[0])).toEqual(run(realMoments[1]))
  })
})

describe('le scénario de référence contient toute la démonstration', () => {
  const setup = () => {
    providers.demo!.reset()
    return { s: novia.snapshot(), now: novia.now(), c: novia.pro.cockpit(novia.now()) }
  }

  it('la référence est un jour ouvert, pendant les heures d’ouverture', () => {
    const h = business.openingHours.value[REF.getDay()]
    expect(h).toBeTruthy()
    const hm = REF.toTimeString().slice(0, 5)
    expect(hm >= h!.open && hm < h!.close).toBe(true)
  })

  it('tous les RDV actifs ou attestés tombent dans les horaires d’ouverture', () => {
    const { s } = setup()
    for (const a of s.appointments.filter((x) => x.status !== 'cancelled' && x.status !== 'no_show')) {
      const d = new Date(a.start)
      const h = business.openingHours.value[d.getDay()]
      expect(h, `${a.id} un jour fermé`).toBeTruthy()
      const start = d.toTimeString().slice(0, 5)
      const end = appointmentEnd(a).toTimeString().slice(0, 5)
      expect(start >= h!.open && end <= h!.close, `${a.id} ${start}–${end}`).toBe(true)
    }
  })

  it('journée : RDV attesté, à confirmer, en cours, et au moins un à venir', () => {
    const states = setup().c.today.map((i) => i.state)
    expect(states).toContain('done')
    expect(states.filter((x) => x === 'to_confirm').length).toBeGreaterThanOrEqual(2)
    expect(states).toContain('in_progress')
    expect(states).toContain('next')
  })

  it('un créneau SmartFill réellement libre, avec des clientes contactables', () => {
    const { c } = setup()
    const o = c.freedSlots[0]
    expect(o).toBeDefined()
    expect(novia.pro.previewSmartFill(o.id)!.contactable.length).toBeGreaterThan(0)
    const res = novia.pro.launchSmartFill(o.id)
    expect(res.ok && res.value).toBeTruthy()
  })

  it('W03 et W04 en cours', () => {
    const wf = setup().c.recoveries.active.map((r) => r.workflow).sort()
    expect(wf).toEqual(['W03', 'W04'])
  })

  it('rappels 24 h et 2 h : à venir pour les RDV des jours suivants', () => {
    const { s, now } = setup()
    const later = s.appointments.filter((a) => isActiveBooking(a.status) && new Date(a.start).getTime() - now.getTime() > 24 * 3_600_000)
    expect(later.length).toBeGreaterThan(0)
    for (const a of later) expect(reminderTimes(a, rules, now)).toHaveLength(2)
  })

  it('remplissages à prévoir', () => {
    const { s, now } = setup()
    expect(refillsDue(s.customers, s.appointments, services, now).length).toBeGreaterThanOrEqual(3)
  })

  it('indicateurs de référence (valeurs attendues de la démo)', () => {
    expect(setup().c.revenue).toEqual({
      todayBooked: 295, // 70 + 45 + 35 + 45 + 15 + 85 (pose gel, remplissage, semi-permanent, remplissage, nail art, dépose + pose)
      todayConfirmed: 35,
      toRecover: 80,
      noviaWonThisMonth: 90,
      noviaConfirmedThisMonth: 0,
    })
  })
})

describe('aucune lecture de l’heure réelle', () => {
  it('seule l’horloge système lit l’heure ', () => {
    const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const offenders = Object.entries(sources)
      .filter(([f]) => !f.endsWith('providers/clock.ts'))
      .flatMap(([f, code]) =>
        code
          .split('\n')
          .filter((l) => /new Date\(\)|Date\.now\(\)/.test(l))
          .map((l) => `${f}: ${l.trim()}`),
      )
    expect(offenders).toEqual([])
  })
})
