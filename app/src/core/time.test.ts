/**
 * Fuseau explicite du salon : NOVIA calcule en heure du SALON, jamais de l'appareil ni du serveur.
 * Les mêmes calculs sont rejoués avec trois fuseaux d'exécution (Paris, New York, Tokyo).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { business } from '../demo/config/business'
import { rules } from '../demo/config/rules'
import { demoScenario } from '../demo/config/scenario'
import { createSeed } from '../demo/seed'
import { availableSlots } from './availability'
import { computeRevenue } from './revenue'
import { addDays, atTime, dayKey, isValidTimeZone, parseWall, sameDay, startOfDay, wall, weekday } from './time'
import { isWithinSendWindow, nextSendWindowStart } from './workflows'

declare const process: { env: Record<string, string | undefined> }

const PARIS = 'Europe/Paris'
const original = process.env.TZ
afterEach(() => {
  process.env.TZ = original
})

/** exécute `fn` comme si le processus tournait dans le fuseau `tz` */
const runIn = <T>(tz: string, fn: () => T): T => {
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    process.env.TZ = original
  }
}

describe('heure murale du salon', () => {
  it('aller-retour heure murale ↔ instant, y compris aux changements d’heure', () => {
    // passage à l'heure d'été (29 mars 2026, 02:00 → 03:00) et retour (25 oct. 2026, 03:00 → 02:00)
    for (const local of ['2026-03-28T10:00:00', '2026-03-29T10:00:00', '2026-10-24T10:00:00', '2026-10-25T10:00:00', '2026-11-19T15:10:00']) {
      const d = parseWall(local, PARIS)
      const w = wall(d, PARIS)
      expect(`${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}T${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}:00`).toBe(local)
    }
    expect(parseWall('2026-03-29T10:00:00', PARIS).toISOString()).toBe('2026-03-29T08:00:00.000Z') // été : UTC+2
    expect(parseWall('2026-03-28T10:00:00', PARIS).toISOString()).toBe('2026-03-28T09:00:00.000Z') // hiver : UTC+1
  })

  it('ajouter un jour garde l’heure murale à travers le changement d’heure (23 h / 25 h réelles)', () => {
    const before = parseWall('2026-03-28T09:00:00', PARIS)
    const after = addDays(before, 1, PARIS)
    expect(wall(after, PARIS).hour).toBe(9)
    expect(after.getTime() - before.getTime()).toBe(23 * 3_600_000)
    const oct = addDays(parseWall('2026-10-24T09:00:00', PARIS), 1, PARIS)
    expect(wall(oct, PARIS).hour).toBe(9)
  })

  it('jour, début de journée et « même jour » sont ceux du salon', () => {
    // 23h30 à Paris = déjà le lendemain à Tokyo, encore la veille à New York : le salon décide
    const late = parseWall('2026-11-19T23:30:00', PARIS)
    expect(dayKey(late, PARIS)).toBe('2026-11-19')
    expect(dayKey(late, 'Asia/Tokyo')).toBe('2026-11-20')
    expect(weekday(late, PARIS)).toBe(4) // jeudi
    expect(startOfDay(late, PARIS).toISOString()).toBe('2026-11-18T23:00:00.000Z')
    expect(sameDay(late, parseWall('2026-11-19T08:00:00', PARIS), PARIS)).toBe(true)
    expect(isValidTimeZone('Europe/Paris')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })
})

describe('mêmes résultats quel que soit le fuseau de l’appareil ou du serveur', () => {
  const zones = ['Europe/Paris', 'America/New_York', 'Asia/Tokyo']

  it('le banc d’essai change vraiment le fuseau du processus', () => {
    const at = new Date('2026-11-19T14:10:00Z')
    expect(zones.map((tz) => runIn(tz, () => at.getHours()))).toEqual([15, 9, 23])
  })

  it('plage d’envoi (07:00–22:00 heure du salon)', () => {
    const results = zones.map((tz) =>
      runIn(tz, () => {
        const night = parseWall('2026-11-19T22:30:00', PARIS)
        const day = parseWall('2026-11-19T15:10:00', PARIS)
        return [isWithinSendWindow(night, rules.sendWindow, PARIS), isWithinSendWindow(day, rules.sendWindow, PARIS), nextSendWindowStart(night, rules.sendWindow, PARIS).toISOString()]
      }),
    )
    expect(results[0]).toEqual([false, true, '2026-11-20T06:00:00.000Z'])
    for (const r of results) expect(r).toEqual(results[0])
  })

  it('créneaux de réservation', () => {
    const results = zones.map((tz) =>
      runIn(tz, () => {
        const now = parseWall(demoScenario.referenceDate, PARIS)
        const day = addDays(now, 1, PARIS)
        return availableSlots(day, 60, business.openingHours.value, [], now, PARIS).map((d) => d.toISOString())
      }),
    )
    expect(results[0].length).toBeGreaterThan(0)
    expect(results[0][0]).toBe(atTime(parseWall('2026-11-20T00:00:00', PARIS), business.openingHours.value[5]!.open, PARIS).toISOString())
    for (const r of results) expect(r).toEqual(results[0])
  })

  it('données de démo et revenus identiques', () => {
    const results = zones.map((tz) =>
      runIn(tz, () => {
        const seed = createSeed(parseWall(demoScenario.referenceDate, business.timezone.value))
        return { json: JSON.stringify(seed), revenue: computeRevenue(seed.appointments, seed.opportunities).totals }
      }),
    )
    for (const r of results) expect(r).toEqual(results[0])
  })
})
