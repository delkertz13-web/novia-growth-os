/** Banc d'essai serveur : vraie base PostgreSQL, rôle applicatif (sécurité au niveau des lignes), horloge pilotée. */
import type { BusinessProfile } from '../../src/config/profile'
import { parseWall } from '../../src/core/time'
import { createPilotProfile } from '../../src/pilot/profile'
import { createNoviaApp } from '../application/novia'
import { createDb } from '../infra/db'
import { createBusiness, saveProfile } from '../repositories/business'
import type { Actor } from '../repositories/state'
import { createTestDatabase } from './pg'

export const TZ = 'Europe/Paris'
export const T0 = parseWall('2026-12-01T10:00:00', TZ) // mardi
export const admin: Actor = { type: 'system', id: 'test' }
export const pro: Actor = { type: 'user', id: 'u-test' }

export function testClock(start = T0) {
  let t = start.getTime()
  return { now: () => new Date(t), set: (d: Date) => void (t = d.getTime()), advance: (ms: number) => void (t += ms) }
}

/**
 * Profil d'un salon de TEST : valeurs fictives marquées « verified » pour exercer les
 * automatisations. Ce n'est PAS le profil de la démonstration, ni celui de PILOT-001.
 */
export function verifiedTestProfile(businessId: string): BusinessProfile {
  const p = createPilotProfile(businessId, TZ)
  const v = <T,>(value: T) => ({ value, status: 'verified' as const })
  const open = { open: '09:00', close: '19:00' }
  return {
    ...p,
    identity: { ...p.identity, name: v('Salon Test'), timezone: v(TZ), openingHours: v({ 0: null, 1: null, 2: open, 3: open, 4: open, 5: open, 6: open }) },
    services: {
      status: 'verified',
      items: [{ id: 'pose', name: 'Pose test', description: '', durationMin: 60, price: 50, deposit: 0, category: 'pose', returnRecommendedAfterDays: 21, active: true, coverImageId: '' }],
    },
    booking: v({ minNoticeHours: 0, maxAdvanceDays: 60, slotStepMin: 30, bufferMin: 0 }),
    rules: {
      status: 'verified',
      sendWindow: { start: '09:00', end: '20:00' },
      w01: { followUpDelayHours: 24, maxFollowUps: 1 },
      w02: { remindersHoursBefore: [24, 2], validationRequestDelayMin: 30 },
      w03: { waitBeforeRecoveryHours: 2, lastFollowUpDelayHours: 48 },
      w04: { waitBeforeRecoveryHours: 2, lastFollowUpDelayHours: 48 },
    },
    smartFill: v({ maxContacts: 3 }),
    templates: {
      'W02.confirmation': v('{business} : {service} réservé {when}.'),
      'W02.reschedule': v('{business} : {service} déplacé au {when}.'),
      'W02.reminder': v('{business} : rappel, {service} {when}.'),
      'W03.recovery': v('Bonjour {firstName}, souhaitez-vous reprendre rendez-vous ?'),
      'W04.recovery': v('Bonjour {firstName}, souhaitez-vous un nouveau créneau ?'),
    },
    approvedAnswers: v([{ id: 'prix', topic: 'Prix', keywords: ['prix', 'combien'], answer: 'La pose test coûte 50 €.' }]),
    defaultSettings: { ...p.defaultSettings, automations: { ...p.defaultSettings.automations, cancellationRecovery: true, noShowRecovery: true, smartFill: true } },
  }
}

export async function setup(opts: { businesses?: { id: string; verified?: boolean }[] } = {}) {
  const database = await createTestDatabase()
  const db = createDb(database.appUrl)
  const clock = testClock()
  const app = createNoviaApp({ db, clock })
  for (const b of opts.businesses ?? [{ id: 'salon-a', verified: true }]) {
    await createBusiness(db, { id: b.id, timezone: TZ }, admin)
    if (b.verified) {
      const p = verifiedTestProfile(b.id)
      await db.businessTx(b.id, (c) => saveProfile(c, b.id, p, admin))
      await db.businessTx(b.id, (c) => c.query('update business_settings set settings = $2 where business_id = $1', [b.id, p.defaultSettings]))
    }
  }
  return {
    database,
    db,
    clock,
    app,
    async close() {
      await db.close()
      await database.drop()
    },
  }
}

export const contact = (n = 1) => ({ firstName: `Test${n}`, lastName: 'Cliente', phone: `06 00 00 00 ${String(n).padStart(2, '0')}`, email: `test${n}@exemple.invalid` })
