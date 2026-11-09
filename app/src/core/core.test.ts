import { describe, expect, it } from 'vitest'
import { parseWall, wall } from './time'
import { rules } from '../demo/config/rules'
import { applyValidation, attendanceState, isAwaitingValidation, noShowCounts, ValidationError } from './appointmentStatus'
import { availableSlots, findDuplicate } from './availability'
import { computeRevenue } from './revenue'
import { buildValidationSms, parseValidationReply } from './smsValidation'
import type { Appointment, Customer, Opportunity, WorkflowRun } from './types'
import {
  advanceRecovery,
  declineRecovery,
  evaluateGuards,
  evaluateW01FollowUp,
  nextSendWindowStart,
  reminderTimes,
  startRecovery,
  stopObsoleteRuns,
} from './workflows'

/** heure murale du salon (Europe/Paris), quel que soit le fuseau du processus */
const T = (s: string) => (s.endsWith('Z') ? new Date(s) : parseWall(s, 'Europe/Paris'))
const NOW = T('2026-11-03T15:00:00')
/** fuseau du salon (les dates ci-dessus sont lues dans le fuseau des tests : Europe/Paris) */
const TZ = 'Europe/Paris'
const hm = (d: Date) => { const w = wall(d, TZ); return `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}` }

const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  businessId: 'b1',
  ref: 'A1',
  customerId: 'c1',
  serviceId: 'remplissage',
  start: T('2026-11-03T10:00:00').toISOString(),
  durationMin: 90,
  price: 45,
  deposit: 10,
  status: 'confirmed',
  bookingOrigin: 'site',
  attribution: 'direct',
  history: [],
  ...over,
})

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  businessId: 'b1',
  firstName: 'Julie',
  lastName: 'Martin',
  phone: '06 00 00 00 01',
  email: 'julie@exemple.demo',
  source: 'site',
  createdAt: '2026-01-01T00:00:00.000Z',
  lifecycle: 'client',
  consent: { transactional: true, marketing: true },
  optOut: false,
  consents: [],
  humanTakeover: false,
  lastActivityAt: '2026-10-01T00:00:00.000Z',
  ...over,
})

describe('Présence : jamais déduite de l’heure', () => {
  it('heure passée sans validation = statut inconnu, le RDV reste réservé', () => {
    const a = appt()
    expect(isAwaitingValidation(a, NOW)).toBe(true)
    expect(attendanceState(a, NOW)).toBe('unknown')
    expect(a.status).toBe('confirmed')
  })

  it('refuse Présente / Absente avant le début du rendez-vous', () => {
    const a = appt({ start: T('2026-11-03T18:00:00').toISOString() })
    expect(() => applyValidation(a, { outcome: 'absent', source: 'cockpit', at: NOW })).toThrow(ValidationError)
  })

  it('chaque validation mène au workflow prévu par W02', () => {
    const a = appt()
    expect(applyValidation(a, { outcome: 'present', source: 'cockpit', at: NOW }).next).toBe('W05')
    expect(applyValidation(a, { outcome: 'absent', source: 'cockpit', at: NOW }).next).toBe('W04')
    expect(applyValidation(a, { outcome: 'cancelled', source: 'cockpit', at: NOW }).next).toBe('W03')
  })

  it('un report clôt l’ancien RDV et crée le nouveau, relié à l’initial', () => {
    const r = applyValidation(appt(), {
      outcome: 'rescheduled',
      source: 'pro',
      at: NOW,
      newStart: T('2026-11-07T11:00:00'),
      newId: 'a2',
      newRef: 'A2',
    })
    expect(r.updated.status).toBe('rescheduled')
    expect(r.updated.rescheduledToId).toBe('a2')
    expect(r.created?.status).toBe('booked')
    expect(r.created?.rescheduledFromId).toBe('a1')
    expect(r.next).toBe('W02')
  })

  it('une correction écrase l’ancien état et garde l’historique', () => {
    const absent = applyValidation(appt(), { outcome: 'absent', source: 'cockpit', at: NOW }).updated
    const fixed = applyValidation(absent, { outcome: 'present', source: 'pro', at: NOW })
    expect(fixed.isCorrection).toBe(true)
    expect(fixed.updated.status).toBe('showed')
    expect(fixed.updated.history.map((h) => h.to)).toEqual(['no_show', 'showed'])
  })
})

describe('W02 — rappels', () => {
  it('rappels 24 h et 2 h recalculés après déplacement, aucun à l’ancien horaire', () => {
    const before = appt({ start: T('2026-11-05T14:00:00').toISOString() })
    expect(reminderTimes(before, rules, NOW).map((d) => wall(d, TZ).hour)).toEqual([14, 12])
    const moved = { ...before, start: T('2026-11-06T16:00:00').toISOString() }
    const times = reminderTimes(moved, rules, NOW)
    expect(times.map((d) => d.toISOString())).toEqual([
      T('2026-11-05T16:00:00').toISOString(),
      T('2026-11-06T14:00:00').toISOString(),
    ])
  })

  it('aucun rappel pour un RDV annulé', () => {
    expect(reminderTimes(appt({ status: 'cancelled', start: '2026-11-05T14:00:00' }), rules, NOW)).toEqual([])
  })
})

describe('Contrôles communs avant envoi', () => {
  const base = { appointments: [] as Appointment[], runs: [] as WorkflowRun[], now: NOW, rules, timeZone: TZ }

  it('opposition, reprise humaine, absence de consentement : STOP', () => {
    expect(evaluateGuards({ ...base, workflow: 'W03', customer: customer({ optOut: true }) }).kind).toBe('stop')
    expect(evaluateGuards({ ...base, workflow: 'W03', customer: customer({ humanTakeover: true }) }).kind).toBe('stop')
    expect(
      evaluateGuards({ ...base, workflow: 'W03', customer: customer({ consent: { transactional: false, marketing: false } }) })
        .kind,
    ).toBe('stop')
  })

  it('hors plage : attendre la prochaine plage autorisée', () => {
    const late = T('2026-11-03T23:10:00')
    const d = evaluateGuards({ ...base, now: late, workflow: 'W03', customer: customer() })
    expect(d.kind).toBe('wait')
    expect(nextSendWindowStart(late, rules.sendWindow, TZ).toISOString()).toBe(T('2026-11-04T07:00:00').toISOString())
  })

  it('nouveau RDV déjà réservé : STOP et retour W02', () => {
    const future = appt({ id: 'a9', start: T('2026-11-10T10:00:00').toISOString(), status: 'booked' })
    const d = evaluateGuards({ ...base, appointments: [future], workflow: 'W04', customer: customer() })
    expect(d).toMatchObject({ kind: 'stop', transition: 'W02' })
  })

  it('W01 : déjà cliente → sortie ; plafond de relances → STOP', () => {
    expect(evaluateGuards({ ...base, workflow: 'W01', customer: customer() }).kind).toBe('stop')
    const prospect = customer({ lifecycle: 'prospect' })
    expect(evaluateW01FollowUp({ ...base, customer: prospect, followUpsSent: 0 }).kind).toBe('send')
    expect(evaluateW01FollowUp({ ...base, customer: prospect, followUpsSent: rules.w01.maxFollowUps }).kind).toBe('stop')
  })
})

describe('W04 — no-show recovery', () => {
  const absent = appt({ status: 'no_show' })

  it('ne démarre pas sans absence confirmée', () => {
    expect(() => startRecovery('W04', appt(), rules, NOW)).toThrow()
  })

  it('séquence complète : message, dernière relance, puis STOP', () => {
    const ctx = { customer: customer(), appointments: [absent], runs: [], now: NOW, rules, timeZone: TZ, sourceAppointment: absent }
    let run = startRecovery('W04', absent, rules, NOW)
    run = advanceRecovery(run, ctx)
    expect(run.messagesSent).toBe(1)
    run = advanceRecovery(run, ctx)
    expect(run.messagesSent).toBe(2)
    run = advanceRecovery(run, ctx)
    expect(run.state).toBe('stopped')
    expect(run.outcome).toBe('no_response')
    expect(advanceRecovery(run, ctx)).toBe(run)
  })

  it('absence corrigée en présence : séquence stoppée', () => {
    const run = startRecovery('W04', absent, rules, NOW)
    const corrected = { ...absent, status: 'showed' as const }
    const [after] = stopObsoleteRuns([run], corrected, NOW)
    expect(after.state).toBe('stopped')
    expect(after.outcome).toBe('obsolete')
  })

  it('nouvelle réservation avant le message : aucun envoi, récupérée', () => {
    const future = appt({ id: 'a2', start: T('2026-11-10T10:00:00').toISOString(), status: 'booked' })
    const run = advanceRecovery(startRecovery('W04', absent, rules, NOW), {
      customer: customer(),
      appointments: [absent, future],
      runs: [],
      now: NOW,
      rules,
      timeZone: TZ,
      sourceAppointment: absent,
    })
    expect(run.messagesSent).toBe(0)
    expect(run.outcome).toBe('recovered')
  })

  it('refus : STOP immédiat', () => {
    expect(declineRecovery(startRecovery('W04', absent, rules, NOW), NOW).outcome).toBe('declined')
  })

  it('compteurs NO_SHOW 30 j / 90 j / total', () => {
    const list = [
      appt({ id: 'x1', status: 'no_show', start: '2026-10-20T10:00:00' }),
      appt({ id: 'x2', status: 'no_show', start: '2026-08-20T10:00:00' }),
      appt({ id: 'x3', status: 'no_show', start: '2025-01-20T10:00:00' }),
    ]
    expect(noShowCounts(list, 'c1', NOW)).toEqual({ d30: 1, d90: 2, total: 3 })
  })
})

describe('Validation SMS', () => {
  const a = appt({ ref: 'A7', start: T('2026-11-03T18:00:00').toISOString() })
  const b = appt({ id: 'a2', ref: 'A8', start: T('2026-11-03T19:00:00').toISOString() })

  it('un seul RDV en attente : format de la spécification', () => {
    expect(buildValidationSms([{ appointment: a, customerName: 'Julie Martin' }], TZ)).toBe(
      'NOVIA — statut à confirmer\nJulie Martin — 18h00\n1 = Présente\n2 = Absente\n3 = Annulée\n4 = Reportée',
    )
    expect(parseValidationReply('2', ['A7'])).toEqual({ ok: true, ref: 'A7', outcome: 'absent' })
  })

  it('plusieurs RDV : une réponse sans identifiant est refusée comme ambiguë', () => {
    expect(buildValidationSms([
      { appointment: a, customerName: 'Julie Martin' },
      { appointment: b, customerName: 'Inès B.' },
    ], TZ)).toContain('A8 · Inès B. — 19h00')
    expect(parseValidationReply('1', ['A7', 'A8'])).toEqual({ ok: false, reason: 'ambiguous' })
    expect(parseValidationReply('a8 1', ['A7', 'A8'])).toEqual({ ok: true, ref: 'A8', outcome: 'present' })
    expect(parseValidationReply('A9 1', ['A7', 'A8'])).toEqual({ ok: false, reason: 'unknown_ref' })
  })
})

describe('Revenu : trois niveaux, jamais de double compte', () => {
  it('une réservation n’est jamais comptée comme confirmée', () => {
    const r = computeRevenue([appt({ status: 'booked' }), appt({ id: 'a2', status: 'showed' })], [])
    expect(r.totals).toEqual({ potential: 0, booked: 90, confirmed: 0 })
    expect(r.awaitingProof).toBe(45)
  })

  it('confirmé seulement avec présence ET preuve', () => {
    const paid = appt({ status: 'showed', paymentProof: { kind: 'demo_payment', amount: 45, at: NOW.toISOString() } })
    expect(computeRevenue([paid], []).totals.confirmed).toBe(45)
  })

  it('un report ne crée pas deux ventes', () => {
    const r = applyValidation(appt({ status: 'booked' }), {
      outcome: 'rescheduled',
      source: 'pro',
      at: NOW,
      newStart: T('2026-11-07T11:00:00'),
      newId: 'a2',
    })
    expect(computeRevenue([r.updated, r.created!], []).totals.booked).toBe(45)
  })

  it('opportunité gagnée : comptée une seule fois, via son rendez-vous', () => {
    const won: Opportunity = { id: 'o1', businessId: 'b1', kind: 'smartfill', amount: 45, status: 'won', createdAt: NOW.toISOString(), resultAppointmentId: 'a3' }
    const open: Opportunity = { id: 'o2', businessId: 'b1', kind: 'noshow_recovery', amount: 45, status: 'open', createdAt: NOW.toISOString() }
    const booked = appt({ id: 'a3', status: 'booked', attribution: 'smartfill' })
    const r = computeRevenue([booked], [won, open])
    expect(r.totals).toEqual({ potential: 45, booked: 45, confirmed: 0 })
    expect(r.bySource.smartfill.booked).toBe(45)
    expect(r.bySource.noshow_recovery.potential).toBe(45)
  })

  it('un RDV annulé ouvrant relance + SmartFill ne compte qu’une fois en potentiel', () => {
    const cx: Opportunity = { id: 'o1', businessId: 'b1', kind: 'cancellation_recovery', amount: 45, status: 'open', createdAt: NOW.toISOString(), sourceAppointmentId: 'a9' }
    const sf: Opportunity = { id: 'o2', businessId: 'b1', kind: 'smartfill', amount: 45, status: 'open', createdAt: NOW.toISOString(), sourceAppointmentId: 'a9' }
    const r = computeRevenue([], [cx, sf])
    expect(r.totals.potential).toBe(45)
    expect(r.bySource.cancellation_recovery.potential).toBe(45)
    expect(r.bySource.smartfill.potential).toBe(0)
    // le créneau est rempli par SmartFill : le RDV perdu est regagné, il sort du potentiel
    expect(computeRevenue([], [cx, { ...sf, status: 'won' }]).totals.potential).toBe(0)
  })

  it('absence et annulation ne produisent aucun revenu', () => {
    expect(computeRevenue([appt({ status: 'no_show' }), appt({ status: 'cancelled' })], []).totals).toEqual({
      potential: 0,
      booked: 0,
      confirmed: 0,
    })
  })
})

describe('Réservation et contacts', () => {
  const hours = { 2: { open: '10:00', close: '13:00' } }

  it('créneaux libres sans chevauchement ni créneau passé', () => {
    const day = T('2026-11-10T00:00:00') // mardi
    const busy = appt({ start: T('2026-11-10T10:30:00').toISOString(), durationMin: 60, status: 'booked' })
    const slots = availableSlots(day, 60, hours, [busy], NOW, TZ).map(hm)
    expect(slots).toEqual(['11:30', '12:00'])
  })

  it('un créneau annulé redevient disponible', () => {
    const day = T('2026-11-10T00:00:00')
    const cancelled = appt({ start: T('2026-11-10T10:00:00').toISOString(), durationMin: 180, status: 'cancelled' })
    expect(availableSlots(day, 60, hours, [cancelled], NOW, TZ)).toHaveLength(5)
  })

  it('déduplication par téléphone ou email', () => {
    const list = [customer()]
    expect(findDuplicate(list, { phone: '+33 6 00 00 00 01', email: '' })?.id).toBe('c1')
    expect(findDuplicate(list, { phone: '', email: ' JULIE@exemple.demo ' })?.id).toBe('c1')
    expect(findDuplicate(list, { phone: '0700000000', email: 'x@y.z' })).toBeUndefined()
  })
})
