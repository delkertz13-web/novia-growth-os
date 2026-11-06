/**
 * Cohérence des états après chaque action du cockpit, sur les providers Mock réels.
 * Chaque test repart du jeu de démonstration et vérifie, après l'action :
 *   - les invariants globaux (aucun double compte, aucune séquence orpheline…) ;
 *   - l'effet attendu sur les indicateurs (voir KPI.md).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rules } from '../config/rules.demo'
import { services } from '../config/services.demo'
import { appointmentEnd, isActiveBooking } from '../core/appointmentStatus'
import { appointmentLevel, computeRevenue } from '../core/revenue'
import { isWithinSendWindow } from '../core/workflows'
import { providers } from '../providers/mock'
import type { NoviaSnapshot } from '../providers/types'
import { createNovia } from './intents'

const novia = createNovia(providers, { rules, services })
const now = () => novia.now()
const kpi = () => novia.pro.cockpit(now()).revenue
const snap = () => novia.snapshot()
const appt = (id: string) => snap().appointments.find((a) => a.id === id)!
const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}

/** Invariants qui doivent tenir après N'IMPORTE QUELLE action. */
function checkInvariants(s: NoviaSnapshot) {
  const ids = s.appointments.map((a) => a.id)
  expect(new Set(ids).size, 'identifiants de RDV uniques').toBe(ids.length)

  // au plus une séquence de récupération active par RDV, et cohérente avec son statut
  const active = s.runs.filter((r) => r.state === 'active')
  expect(new Set(active.map((r) => r.appointmentId)).size, 'une séquence active par RDV').toBe(active.length)
  for (const r of active) {
    const src = s.appointments.find((a) => a.id === r.appointmentId)!
    expect(src.status, `${r.workflow} actif sur un RDV ${src.status}`).toBe(r.workflow === 'W04' ? 'no_show' : 'cancelled')
  }

  // une opportunité de récupération ouverte suppose un RDV encore absent / annulé
  for (const o of s.opportunities.filter((x) => x.status === 'open' && x.kind !== 'smartfill')) {
    const src = s.appointments.find((a) => a.id === o.sourceAppointmentId)!
    expect(['no_show', 'cancelled']).toContain(src.status)
  }
  // une opportunité gagnée pointe vers un RDV réel, attribué à NOVIA
  for (const o of s.opportunities.filter((x) => x.status === 'won')) {
    const res = s.appointments.find((a) => a.id === o.resultAppointmentId)
    expect(res, 'RDV résultant').toBeDefined()
    expect(['smartfill', 'noshow_recovery', 'cancellation_recovery']).toContain(res!.attribution)
  }

  // jamais deux RDV actifs qui se chevauchent (pas de double réservation)
  const live = s.appointments.filter((a) => isActiveBooking(a.status)).sort((a, b) => a.start.localeCompare(b.start))
  for (let i = 1; i < live.length; i++) expect(new Date(live[i].start).getTime()).toBeGreaterThanOrEqual(appointmentEnd(live[i - 1]).getTime())

  // chaque RDV compté une seule fois, à un seul niveau
  const r = computeRevenue(s.appointments, s.opportunities)
  const booked = s.appointments.filter((a) => appointmentLevel(a) === 'booked').reduce((t, a) => t + a.price, 0)
  const confirmed = s.appointments.filter((a) => appointmentLevel(a) === 'confirmed').reduce((t, a) => t + a.paymentProof!.amount, 0)
  expect(r.totals.booked).toBe(booked)
  expect(r.totals.confirmed).toBe(confirmed)
  expect(r.totals.potential).toBeGreaterThanOrEqual(0)

  // démo : uniquement des SMS simulés et des preuves de paiement fictives
  for (const m of s.messages) expect(m.channel).toBe('sms')
  for (const a of s.appointments) if (a.paymentProof) expect(a.paymentProof.kind).toBe('demo_payment')
}

/* ---------------- Aucun appel réseau pendant les actions ---------------- */

const network = { fetch: vi.fn(), xhr: vi.fn(), beacon: vi.fn(), ws: vi.fn() }

/**
 * Moments de démonstration (heure de Paris) : le jeu de données est relatif à « maintenant »,
 * on vérifie donc plusieurs jours de la semaine et heures, dont le soir (hors plage d'envoi).
 */
const moments: [string, string][] = [
  ['jeudi après-midi', '2026-11-05T15:10:00+01:00'],
  ['mercredi matin', '2026-11-04T10:20:00+01:00'],
  ['samedi fin de journée', '2026-11-07T16:40:00+01:00'],
  ['mardi soir', '2026-11-10T21:30:00+01:00'],
  ['dernier jour du mois', '2026-11-30T12:00:00+01:00'],
]

let moment = moments[0][1]
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(moment))
  providers.demo!.reset()
  vi.stubGlobal('fetch', network.fetch)
  vi.stubGlobal('XMLHttpRequest', network.xhr)
  vi.stubGlobal('WebSocket', network.ws)
  vi.stubGlobal('navigator', { sendBeacon: network.beacon })
})
afterEach(() => {
  checkInvariants(snap())
  for (const spy of Object.values(network)) expect(spy, 'aucun appel réseau').not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const awaiting = (price: number) => novia.pro.cockpit(now()).toConfirm.find((a) => a.price === price)!
/** Prochain RDV actif d'un jour suivant (les RDV du jour du jeu de démo suivent l'heure courante, même hors horaires). */
const futureBooking = () =>
  snap()
    .appointments.filter((a) => isActiveBooking(a.status) && new Date(a.start).getTime() > new Date(now()).setHours(24 + 6, 0, 0, 0))
    .sort((a, b) => a.start.localeCompare(b.start))[0]

describe.each(moments)('%s', (_label, iso) => {
  beforeEach(() => {
    moment = iso
    vi.setSystemTime(new Date(iso))
    providers.demo!.reset()
  })

  describe('Présence', () => {
    it('Présente : statut attesté, aucune séquence, reste en CA réservé ; la preuve le passe en confirmé', () => {
      const a = awaiting(45)
      const before = kpi()
      const msgs = snap().messages.length
      ok(novia.pro.confirmPresence(a.id))
      expect(appt(a.id).status).toBe('showed')
      expect(snap().runs.some((r) => r.appointmentId === a.id)).toBe(false)
      expect(snap().messages.length).toBe(msgs)
      expect(kpi().toRecover).toBe(before.toRecover)

      const r0 = novia.pro.revenueAttribution().totals
      ok(novia.pro.recordPaymentProof(a.id))
      const r1 = novia.pro.revenueAttribution().totals
      expect(r1.confirmed - r0.confirmed).toBe(45)
      expect(r0.booked - r1.booked).toBe(45)
    })

    it('Absente : W04 démarre, une seule opportunité, +45 € à récupérer, rien gagné', () => {
      const a = awaiting(45)
      const before = kpi()
      const reaction = ok(novia.pro.declareAbsence(a.id))
      expect(appt(a.id).status).toBe('no_show')
      expect(snap().runs.filter((r) => r.appointmentId === a.id && r.state === 'active').map((r) => r.workflow)).toEqual(['W04'])
      expect(snap().opportunities.filter((o) => o.sourceAppointmentId === a.id && o.status === 'open')).toHaveLength(1)
      expect(kpi().toRecover - before.toRecover).toBe(45)
      expect(kpi().noviaWonThisMonth).toBe(before.noviaWonThisMonth)
      expect(reaction.runId).toBeDefined()
    })

    it('Absente puis correction en Présente : la séquence s’arrête, le potentiel revient', () => {
      const a = awaiting(45)
      const before = kpi().toRecover
      ok(novia.pro.declareAbsence(a.id))
      ok(novia.pro.confirmPresence(a.id))
      expect(appt(a.id).status).toBe('showed')
      expect(snap().runs.find((r) => r.appointmentId === a.id)!.state).toBe('stopped')
      expect(kpi().toRecover).toBe(before)
    })

    it('déclarer deux fois la même absence est refusé, sans seconde séquence', () => {
      const a = awaiting(45)
      ok(novia.pro.declareAbsence(a.id))
      expect(novia.pro.declareAbsence(a.id).ok).toBe(false)
      expect(snap().runs.filter((r) => r.appointmentId === a.id)).toHaveLength(1)
    })

    it('une absence ne peut pas être déclarée sur un RDV pas encore commencé', () => {
      expect(novia.pro.declareAbsence(futureBooking().id).ok).toBe(false)
    })
  })

  describe('Annulation et report', () => {
    it('Annulée (à venir) : créneau libéré pour SmartFill, compté UNE fois en potentiel', () => {
      const a = futureBooking()
      const before = novia.pro.cockpit(now())
      ok(novia.pro.cancelAppointment(a.id))
      const after = novia.pro.cockpit(now())
      expect(appt(a.id).status).toBe('cancelled')
      expect(after.freedSlots.length - before.freedSlots.length).toBe(1)
      expect(after.revenue.toRecover - before.revenue.toRecover).toBe(a.price)
      expect(novia.pro.availableSlots(new Date(a.start), a.serviceId).some((d) => d.getTime() === new Date(a.start).getTime())).toBe(true)
    })

    it('Reportée : l’ancien RDV est remplacé, le CA réservé ne double pas', () => {
      const a = futureBooking()
      const before = novia.pro.revenueAttribution().totals.booked
      const day = new Date(a.start)
      day.setDate(day.getDate() + 7)
      const slot = Array.from({ length: 10 }, (_, i) => {
        const d = new Date(day)
        d.setDate(d.getDate() + i)
        return novia.pro.availableSlots(d, a.serviceId)[0]
      }).find(Boolean)!
      const reaction = ok(novia.pro.rescheduleAppointment(a.id, slot))
      expect(appt(a.id).status).toBe('rescheduled')
      expect(appt(reaction.resultAppointmentId).start).toBe(slot.toISOString())
      expect(novia.pro.revenueAttribution().totals.booked).toBe(before)
      expect(novia.pro.confirmPresence(a.id).ok).toBe(false)
    })
  })

  describe('Récupération', () => {
    const activeW04 = () => snap().runs.find((r) => r.workflow === 'W04' && r.state === 'active')!

    it('la cliente reprend RDV : séquence close, opportunité gagnée, potentiel → gagné par NOVIA', () => {
      const run = activeW04()
      const src = appt(run.appointmentId!)
      const pot0 = kpi().toRecover
      const won0 = novia.pro.revenueAttribution().bySource.noshow_recovery.booked
      const a = providers.demo!.clientRebooks(run.id)!
      expect(snap().runs.find((r) => r.id === run.id)!.outcome).toBe('recovered')
      expect(appt(a.id).attribution).toBe('noshow_recovery')
      expect(pot0 - kpi().toRecover).toBe(src.price)
      expect(novia.pro.revenueAttribution().bySource.noshow_recovery.booked - won0).toBe(src.price)
    })

    it('sans réponse : au plus un message et une dernière relance, puis arrêt et potentiel perdu', () => {
      const run = activeW04()
      const pot0 = kpi().toRecover
      const msgs0 = run.messagesSent
      for (let i = 0; i < 5; i++) providers.demo!.advanceRecovery(run.id)
      const done = snap().runs.find((r) => r.id === run.id)!
      expect(done.messagesSent).toBeLessThanOrEqual(2)
      if (isWithinSendWindow(now(), rules.sendWindow)) {
        expect(done.state).toBe('stopped')
        expect(pot0 - kpi().toRecover).toBe(appt(run.appointmentId!).price)
      } else {
        // hors plage d'envoi : NOVIA attend, n'envoie rien et ne perd rien
        expect(done.state).toBe('active')
        expect(done.messagesSent).toBe(msgs0)
        expect(kpi().toRecover).toBe(pot0)
      }
    })

    it('reprise de la conversation : NOVIA n’envoie plus rien à cette cliente', () => {
      const run = activeW04()
      ok(novia.pro.takeOverConversation(run.customerId))
      const msgs = snap().messages.length
      providers.demo!.advanceRecovery(run.id)
      expect(snap().messages.length).toBe(msgs)
      expect(novia.pro.cockpit(now()).takenOver.some((c) => c.id === run.customerId)).toBe(true)
    })
  })

  describe('SmartFill', () => {
    const slot = () => novia.pro.cockpit(now()).freedSlots[0]

    it('lancer : une cliente contactable réserve le créneau, attribué à SmartFill, une seule fois', () => {
      const o = slot()
      const before = novia.pro.cockpit(now())
      const res = ok(novia.pro.launchSmartFill(o.id))!
      expect(res.customer.optOut || res.customer.humanTakeover || !res.customer.consent.marketing).toBe(false)
      expect(res.appointment.start).toBe(o.slotStart)
      expect(appt(res.appointment.id).attribution).toBe('smartfill')
      const after = novia.pro.cockpit(now())
      expect(after.freedSlots).toHaveLength(before.freedSlots.length - 1)
      expect(before.revenue.toRecover - after.revenue.toRecover).toBe(o.amount)
      expect(ok(novia.pro.launchSmartFill(o.id))).toBeNull()
    })

    it('garder le créneau libre : SmartFill ne le propose plus ; la relance de la cliente reste à récupérer', () => {
      const o = slot()
      const before = novia.pro.cockpit(now())
      ok(novia.pro.keepSlotFree(o.id))
      const after = novia.pro.cockpit(now())
      expect(after.freedSlots).toHaveLength(before.freedSlots.length - 1)
      expect(after.revenue.toRecover).toBe(before.revenue.toRecover)
    })
  })
})

describe('Démonstration : rien de réel ne part', () => {
  it('le code de l’application ne contient aucun appel réseau', () => {
    const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    expect(Object.keys(sources).length).toBeGreaterThan(30)
    const offenders = Object.entries(sources)
      .filter(([, code]) => /\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|EventSource/.test(code))
      .map(([f]) => f)
    expect(offenders).toEqual([])
  })

  it('les messages sont seulement consignés, les paiements seulement fictifs', () => {
    const a = awaiting(45)
    ok(novia.pro.confirmPresence(a.id))
    const proof = ok(novia.pro.recordPaymentProof(a.id))
    expect(proof.kind).toBe('demo_payment')
    const m = providers.messaging.simulateSend({ to: 'Test', channel: 'sms', purpose: 'test', body: 'x' })
    expect(snap().messages[0].id).toBe(m.id)
  })
})
