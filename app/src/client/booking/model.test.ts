import { describe, expect, it } from 'vitest'
import { business } from '../../demo/config/business'
import { rules } from '../../demo/config/rules'
import type { Appointment } from '../../core/types'
import { parseWall, wall } from '../../core/time'
import { fmt } from '../../ui/common'
import { dayState, dayStateLabel, depositLabel, followUps, inspoSize, slotEnd } from './model'

const hours = business.openingHours.value
const TZ = business.timezone.value
/** heure murale du salon, quel que soit le fuseau du processus */
const at = (iso: string) => parseWall(iso, TZ)

const appt = (start: Date): Appointment => ({
  id: 'a1',
  businessId: 'b1',
  ref: 'A1',
  customerId: 'c1',
  serviceId: 'pose-gel',
  start: start.toISOString(),
  durationMin: 120,
  price: 70,
  deposit: 20,
  status: 'booked',
  bookingOrigin: 'site',
  attribution: 'acquisition',
  history: [],
})

describe('réservation · modèle', () => {
  it('distingue jour fermé, complet et disponible selon les horaires', () => {
    const sunday = at('2026-11-08T12:00:00')
    const wednesday = at('2026-11-04T12:00:00')
    expect(dayState(sunday, hours, 0, TZ)).toEqual({ kind: 'closed' })
    expect(dayState(wednesday, hours, 0, TZ)).toEqual({ kind: 'full' })
    expect(dayState(wednesday, hours, 5, TZ)).toEqual({ kind: 'open', count: 5 })
    expect(dayStateLabel(dayState(sunday, hours, 0, TZ))).toBe('Fermé')
    expect(dayStateLabel({ kind: 'open', count: 3 })).toBe('3 dispo')
  })

  it('calcule la fin du rendez-vous', () => {
    expect(wall(slotEnd(at('2026-11-04T10:30:00'), 120), TZ).hour).toBe(12)
  })

  it('la pose choisie devient plus discrète au fil des étapes, sans disparaître', () => {
    expect(['when', 'contact', 'recap'].map((s) => inspoSize(s as never))).toEqual(['lg', 'md', 'sm'])
  })

  it('l’acompte est toujours présenté comme fictif', () => {
    expect(depositLabel({ deposit: 20 }, fmt.eur)).toMatch(/fictif, non prélevé/)
    expect(depositLabel({ deposit: 0 }, fmt.eur)).toBe('Aucun')
  })

  it('suite NOVIA : confirmation puis rappels 24 h et 2 h issus des règles', () => {
    const now = at('2026-11-04T09:00:00')
    const list = followUps(appt(at('2026-11-06T10:00:00')), rules, now)
    expect(list.map((f) => f.key)).toEqual(['confirmation', 'r24', 'r2'])
    expect(list.map((f) => f.state)).toEqual(['done', 'scheduled', 'scheduled'])
    expect(list[1].at?.toISOString()).toBe(at('2026-11-05T10:00:00').toISOString())
  })

  it('un rappel déjà dépassé (RDV proche) n’est pas programmé', () => {
    const now = at('2026-11-04T09:00:00')
    const list = followUps(appt(at('2026-11-04T15:00:00')), rules, now)
    expect(list.find((f) => f.key === 'r24')?.state).toBe('skipped')
    expect(list.find((f) => f.key === 'r2')?.state).toBe('scheduled')
  })
})
