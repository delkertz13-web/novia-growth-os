/**
 * Comportement métier du pilote sur une VRAIE base PostgreSQL, avec le rôle applicatif
 * (sécurité au niveau des lignes active) : isolation, inbox, outbox, ordonnanceur,
 * gardes relues à l'exécution, STOP et registre de consentement, reprise humaine,
 * inconnu → BLOCKED, paiement déclaré, export et anonymisation.
 */
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computeRevenue } from '../../src/core/revenue'
import { createNoviaApp } from '../application/novia'
import { createDb } from '../infra/db'
import { admin, contact, pro, setup, T0 } from './fixtures'
import { hasPg } from './pg'

const H = 3_600_000
type T = Awaited<ReturnType<typeof setup>>

async function book(t: T, b: string, n: number, startOffsetMs: number) {
  const r = await t.app.command(b, pro, { type: 'BookingCreated', serviceId: 'pose', start: new Date(T0.getTime() + startOffsetMs).toISOString(), contact: contact(n), leadSource: 'manual', origin: 'pro' })
  expect(r.value).toMatchObject({ ok: true })
  const { state } = await t.app.snapshot(b)
  const customer = state.customers.find((c) => c.firstName === `Test${n}`)!
  const appointment = state.appointments.find((a) => a.customerId === customer.id && a.status === 'booked')!
  return { customer, appointment }
}

const jobs = (t: T, b: string) =>
  t.db.businessTx(b, async (c) => (await c.query(`select key, kind, status, attempts, due_at, last_error from scheduled_jobs where business_id = $1 order by due_at`, [b])).rows)

async function asOwner<R>(t: T, work: (c: pg.Client) => Promise<R>) {
  const c = new pg.Client({ connectionString: t.database.ownerUrl })
  await c.connect()
  try {
    return await work(c)
  } finally {
    await c.end()
  }
}

describe.skipIf(!hasPg())('pilote — isolation entre entreprises (base de données)', () => {
  let t: T
  beforeEach(async () => {
    t = await setup({ businesses: [{ id: 'salon-a', verified: true }, { id: 'salon-b', verified: true }] })
    await book(t, 'salon-a', 1, 26 * H)
    await book(t, 'salon-b', 2, 26 * H)
  })
  afterEach(() => t.close())

  it('avec le contexte de A, le rôle applicatif ne lit, ne modifie ni n’insère rien chez B', async () => {
    await t.db.businessTx('salon-a', async (c) => {
      const all = await c.query('select business_id from customers')
      expect(all.rows.map((r) => r.business_id)).toEqual(['salon-a'])
      expect((await c.query(`select * from appointments where business_id = 'salon-b'`)).rowCount).toBe(0)
      expect((await c.query(`select * from messages where business_id = 'salon-b'`)).rowCount).toBe(0)
      expect((await c.query(`update customers set first_name = 'X' where business_id = 'salon-b'`)).rowCount).toBe(0)
    })
    await expect(
      t.db.businessTx('salon-a', (c) =>
        c.query(`insert into audit_log (business_id, at, actor_type, actor_id, action) values ('salon-b', now(), 'system', 'x', 'intrusion')`),
      ),
    ).rejects.toThrow(/row-level security/)
    const b = await t.app.snapshot('salon-b')
    expect(b.state.customers[0].firstName).toBe('Test2')
  })

  it('sans contexte d’entreprise : aucune ligne visible', async () => {
    const r = await t.db.pool.query('select count(*)::int as n from customers')
    expect(r.rows[0].n).toBe(0)
    const m = await t.db.pool.query('select count(*)::int as n from messages')
    expect(m.rows[0].n).toBe(0)
  })

  it('le rôle applicatif ne peut ni supprimer l’historique ni changer le mode d’exécution', async () => {
    await expect(t.db.businessTx('salon-a', (c) => c.query(`delete from audit_log`))).rejects.toThrow(/permission denied|append/i)
    await expect(t.db.businessTx('salon-a', (c) => c.query(`update businesses set execution_mode = 'live' where id = 'salon-a'`))).rejects.toThrow()
  })
})

describe.skipIf(!hasPg())('pilote — inbox, outbox, ordonnanceur', () => {
  let t: T
  beforeEach(async () => {
    t = await setup()
  })
  afterEach(() => t.close())

  it('inbox : le même événement reçu trois fois n’est traité qu’une fois', async () => {
    const { customer } = await book(t, 'salon-a', 1, 26 * H)
    const event = { type: 'InboundMessageReceived' as const, customerId: customer.id, channel: 'sms' as const, body: 'Bonjour, combien coûte la pose ?', source: 'pilot-test' as const, eventId: 'evt-1', occurredAt: T0.toISOString() }
    const results = []
    for (let i = 0; i < 3; i++) results.push(await t.app.ingest('salon-a', admin, event))
    expect(results.filter((r) => r.value.duplicate)).toHaveLength(2)
    const rows = await t.db.businessTx('salon-a', (c) => c.query(`select status, payload from inbox_events where business_id = 'salon-a'`))
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].status).toBe('processed')
    // minimisation : le corps du message n'est pas recopié dans l'inbox
    expect(rows.rows[0].payload.body).toBe('[non conservé]')
    const { state } = await t.app.snapshot('salon-a')
    expect(state.conversations.flatMap((c) => c.messages).filter((m) => m.from === 'client')).toHaveLength(1)
  })

  it('outbox : une même échéance rejouée ne produit qu’un message potentiel, jamais « envoyé »', async () => {
    const { appointment } = await book(t, 'salon-a', 1, 26 * H)
    const reminder = { type: 'ReminderDue' as const, appointmentId: appointment.id, hoursBefore: 24, source: 'novia-engine' as const, eventId: 'r1' }
    t.clock.set(new Date(T0.getTime() + 2 * H))
    for (let i = 0; i < 3; i++) await t.app.withBusiness('salon-a', admin, (u) => u.engine.execute(reminder))
    await t.app.flushOutbox('salon-a')
    const out = await t.db.businessTx('salon-a', (c) => c.query(`select key, status, attempts, payload from outbox_messages where business_id = 'salon-a' and key like 'W02:reminder:%'`))
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]).toMatchObject({ status: 'shadow', attempts: 0 })
    expect(Object.keys(out.rows[0].payload).sort()).not.toContain('body')
    // la base refuse elle-même un statut « envoyé »
    await expect(t.db.businessTx('salon-a', (c) => c.query(`update outbox_messages set status = 'sent' where business_id = 'salon-a'`))).rejects.toThrow(/check constraint/)
    await expect(t.db.businessTx('salon-a', (c) => c.query(`update messages set status = 'delivered' where business_id = 'salon-a'`))).rejects.toThrow(/check constraint/)
  })

  it('ordonnanceur : les échéances survivent à un redémarrage et ne s’exécutent qu’une fois', async () => {
    const { appointment } = await book(t, 'salon-a', 1, 26 * H)
    const planned = await jobs(t, 'salon-a')
    expect(planned.map((j) => j.kind)).toEqual(['ReminderDue', 'ReminderDue'])
    expect(planned.every((j) => j.status === 'pending')).toBe(true)

    // « redémarrage » : nouvelle connexion, nouvelle application, même base
    await t.db.close()
    const db2 = createDb(t.database.appUrl)
    t.db = db2
    const app2 = createNoviaApp({ db: db2, clock: t.clock })
    t.app = app2

    expect(await app2.runDueJobs()).toBe(0) // rien n'est dû
    t.clock.set(new Date(T0.getTime() + 2 * H + 60_000))
    expect(await app2.runDueJobs()).toBe(1)
    expect(await app2.runDueJobs()).toBe(0)
    const after = await jobs(t, 'salon-a')
    expect(after.map((j) => j.status)).toEqual(['done', 'pending'])
    const { state } = await app2.snapshot('salon-a')
    const reminders = state.messages.filter((m) => m.purpose?.includes('rappel') && m.appointmentId === appointment.id)
    expect(reminders).toHaveLength(1)
    expect(reminders[0].status).toBe('shadow')
  })

  it('ordonnanceur : une panne est retentée avec délai croissant, puis réussit', async () => {
    await book(t, 'salon-a', 1, 26 * H)
    // panne simulée UNE fois à l'enregistrement d'un message (la séquence n'est pas annulée par le rollback)
    await asOwner(t, async (c) => {
      await c.query(`create sequence test_fail_once`)
      await c.query(`create function test_fail() returns trigger language plpgsql security definer as $$
        begin if nextval('test_fail_once') = 1 then raise exception 'panne simulée'; end if; return new; end $$`)
      await c.query(`create trigger test_fail before insert on messages for each row execute function test_fail()`)
    })
    t.clock.set(new Date(T0.getTime() + 2 * H + 60_000))
    expect(await t.app.runDueJobs()).toBe(0)
    let j = (await jobs(t, 'salon-a'))[0]
    expect(j).toMatchObject({ status: 'pending', attempts: 1, last_error: 'panne simulée' })
    expect(new Date(j.due_at).getTime()).toBeGreaterThan(t.clock.now().getTime())
    // rien n'a été enregistré à moitié
    expect((await t.app.snapshot('salon-a')).state.messages.filter((m) => m.purpose?.includes('rappel'))).toHaveLength(0)
    t.clock.advance(3 * 60_000)
    expect(await t.app.runDueJobs()).toBe(1)
    j = (await jobs(t, 'salon-a'))[0]
    expect(j.status).toBe('done')
    const audit = await t.app.auditLog('salon-a')
    expect(audit.some((a) => a.action === 'job.failed')).toBe(true)
  })

  it('après trop d’échecs, l’échéance passe en « failed » (pas de boucle infinie)', async () => {
    await book(t, 'salon-a', 1, 26 * H)
    await asOwner(t, async (c) => {
      await c.query(`create function test_fail() returns trigger language plpgsql security definer as $$ begin raise exception 'panne durable'; end $$`)
      await c.query(`create trigger test_fail before insert on messages for each row execute function test_fail()`)
    })
    for (let i = 0; i < 8; i++) {
      t.clock.advance(H)
      await t.app.runDueJobs()
    }
    const failed = (await jobs(t, 'salon-a')).filter((j) => j.status === 'failed')
    expect(failed.length).toBeGreaterThanOrEqual(1)
    expect(failed[0].attempts).toBe(5)
  })

  it('événement périmé ignoré ; rappel d’un RDV annulé : échéance annulée, rien décidé', async () => {
    const { appointment } = await book(t, 'salon-a', 1, 26 * H)
    // un système externe s'appuie sur une version plus ancienne que la nôtre
    await t.app.command('salon-a', pro, { type: 'BookingRescheduled', appointmentId: appointment.id, newStart: new Date(T0.getTime() + 28 * H).toISOString(), statusSource: 'cockpit' })
    const stale = await t.app.ingest('salon-a', admin, { type: 'BookingCancelled', appointmentId: appointment.id, statusSource: 'integration', version: 0, source: 'pilot-test' as const, eventId: 'old-1', occurredAt: T0.toISOString() } as never)
    expect(stale.value).toMatchObject({ ok: true, stale: true })

    const { state } = await t.app.snapshot('salon-a')
    const current = state.appointments.find((a) => a.status === 'booked')!
    let pending = (await jobs(t, 'salon-a')).filter((j) => j.status === 'pending')
    expect(pending.every((j) => j.key.includes(current.id))).toBe(true)
    expect((await jobs(t, 'salon-a')).filter((j) => j.key.includes(`:${appointment.id}:`)).every((j) => j.status === 'cancelled')).toBe(true)

    await t.app.command('salon-a', pro, { type: 'BookingCancelled', appointmentId: current.id, statusSource: 'cockpit' })
    pending = (await jobs(t, 'salon-a')).filter((j) => j.status === 'pending' && j.kind === 'ReminderDue')
    expect(pending).toHaveLength(0)
    // même si un réveil arrivait quand même, le moteur relit l'état : rappel bloqué
    t.clock.set(new Date(T0.getTime() + 4 * H))
    await t.app.withBusiness('salon-a', admin, (u) => u.engine.execute({ type: 'ReminderDue', appointmentId: current.id, hoursBefore: 24, source: 'novia-engine' as const, eventId: 'late' }))
    const after = await t.app.snapshot('salon-a')
    expect(after.state.messages.filter((m) => m.purpose?.includes('rappel'))).toHaveLength(0)
    const decisions = await t.app.shadowDecisions('salon-a')
    expect(decisions.some((d) => d.result === 'BLOCKED' && d.appointment_id === current.id)).toBe(true)
  })
})

describe.skipIf(!hasPg())('pilote — gardes, STOP, reprise humaine, shadow', () => {
  let t: T
  beforeEach(async () => {
    t = await setup()
  })
  afterEach(() => t.close())

  async function noShow() {
    const { customer, appointment } = await book(t, 'salon-a', 1, 1 * H)
    t.clock.set(new Date(T0.getTime() + 2 * H + 30 * 60_000))
    const r = await t.app.command('salon-a', pro, { type: 'AttendanceRecorded', appointmentId: appointment.id, attended: false, statusSource: 'cockpit' })
    expect(r.value).toMatchObject({ ok: true })
    const seq = (await jobs(t, 'salon-a')).filter((j) => j.kind === 'SequenceStepDue')
    expect(seq).toHaveLength(1)
    return { customer, appointment, job: seq[0] }
  }

  it('absence → relance W04 décidée « WOULD_EXECUTE », jamais envoyée', async () => {
    const { job } = await noShow()
    t.clock.set(new Date(new Date(job.due_at).getTime() + 60_000))
    await t.app.runDueJobs()
    const { state } = await t.app.snapshot('salon-a')
    const recovery = state.messages.filter((m) => m.purpose?.startsWith('W04'))
    expect(recovery).toHaveLength(1)
    expect(recovery[0].status).toBe('shadow')
    const d = (await t.app.shadowDecisions('salon-a')).find((x) => x.workflow === 'W04' && x.result === 'WOULD_EXECUTE')
    expect(d).toBeDefined()
    expect(d!.reason).toMatch(/aurait envoyé/)
    expect(d!.guards.length).toBeGreaterThan(0)
  })

  it('STOP reçu avant l’échéance : la relance est BLOQUÉE au moment de l’exécution, gardes enregistrées', async () => {
    const { customer, job } = await noShow()
    await t.app.ingest('salon-a', admin, { type: 'InboundMessageReceived', customerId: customer.id, channel: 'sms', body: 'STOP', source: 'pilot-test' as const, eventId: 'stop-1', occurredAt: t.clock.now().toISOString() })
    t.clock.set(new Date(new Date(job.due_at).getTime() + 60_000))
    await t.app.runDueJobs()
    // force aussi l'exécution directe de l'étape (un réveil qui arriverait malgré tout)
    const { state: s0 } = await t.app.snapshot('salon-a')
    const run = s0.runs.find((r) => r.workflow === 'W04')!
    await t.app.withBusiness('salon-a', admin, (u) => u.engine.execute({ type: 'SequenceStepDue', runId: run.id, source: 'novia-engine' as const, eventId: 'force' }))
    const { state } = await t.app.snapshot('salon-a')
    expect(state.messages.filter((m) => m.purpose?.startsWith('W04'))).toHaveLength(0)
    const blocked = (await t.app.shadowDecisions('salon-a')).filter((d) => d.result === 'BLOCKED' && d.customer_id === customer.id)
    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked.some((d) => /opposition/i.test(d.reason))).toBe(true)
    const withGuards = blocked.find((d) => d.guards.length)!
    expect(withGuards.guards).toContainEqual({ name: 'pas d’opposition (STOP)', ok: false })
  })

  it('reprise humaine : met la relance en pause (échéance annulée), le retour la réarme ; historique conservé', async () => {
    const { customer, job } = await noShow()
    await t.app.command('salon-a', pro, { type: 'HumanTakeoverChanged', customerId: customer.id, value: true })
    expect((await jobs(t, 'salon-a')).find((j) => j.key === job.key)!.status).toBe('cancelled')
    expect((await t.app.shadowDecisions('salon-a')).some((d) => d.result === 'BLOCKED' && /reprise humaine/.test(d.reason))).toBe(true)
    await t.app.command('salon-a', pro, { type: 'HumanTakeoverChanged', customerId: customer.id, value: false })
    expect((await jobs(t, 'salon-a')).some((j) => j.kind === 'SequenceStepDue' && j.status === 'pending')).toBe(true)
    const history = await t.db.businessTx('salon-a', (c) => c.query(`select value, actor from human_takeovers where business_id = 'salon-a' order by id`))
    expect(history.rows).toEqual([
      { value: true, actor: 'user:u-test' },
      { value: false, actor: 'user:u-test' },
    ])
    await expect(t.db.businessTx('salon-a', (c) => c.query(`update human_takeovers set value = true`))).rejects.toThrow()
  })

  it('valeur de profil inconnue → BLOCKED en shadow (aucune valeur inventée)', async () => {
    const u = await setup({ businesses: [{ id: 'pilot-unknown' }] })
    try {
      // seul le catalogue est vérifié ; modèles de messages et règles restent « à vérifier »
      await u.db.businessTx('pilot-unknown', async (c) => {
        const p = (await c.query(`select profile from business_profiles where business_id = 'pilot-unknown'`)).rows[0].profile
        p.services = { status: 'verified', items: [{ id: 'pose', name: 'Pose', description: '', durationMin: 60, price: 40, deposit: 0, category: 'pose', returnRecommendedAfterDays: 21, active: true, coverImageId: '' }]}
        p.booking = { status: 'verified', value: { minNoticeHours: 0, maxAdvanceDays: 60, slotStepMin: 30, bufferMin: 0 } }
        await c.query(`update business_profiles set profile = $2 where business_id = $1`, ['pilot-unknown', p])
      })
      const r = await u.app.command('pilot-unknown', pro, { type: 'BookingCreated', serviceId: 'pose', start: new Date(T0.getTime() + 26 * H).toISOString(), contact: contact(1), leadSource: 'manual', origin: 'pro' })
      expect(r.value).toMatchObject({ ok: true })
      const { state } = await u.app.snapshot('pilot-unknown')
      expect(state.messages).toHaveLength(0)
      const d = await u.app.shadowDecisions('pilot-unknown')
      expect(d.some((x) => x.result === 'BLOCKED' && /Texte de confirmation de RDV : inconnu/.test(x.reason))).toBe(true)
    } finally {
      await u.close()
    }
  })
})

describe.skipIf(!hasPg())('pilote — consentement, paiement déclaré, données personnelles', () => {
  let t: T
  beforeEach(async () => {
    t = await setup()
  })
  afterEach(() => t.close())

  it('registre de consentement : opt-in → STOP → demande de service → réservation volontaire → STOP maintenu → réinscription explicite', async () => {
    const { customer } = await book(t, 'salon-a', 1, 26 * H)
    await t.app.command('salon-a', pro, { type: 'ConsentChanged', customerId: customer.id, change: { channel: 'all', purpose: 'marketing', state: 'granted', source: 'pro_declared', proofRef: 'formulaire papier' } })
    let c = (await t.app.snapshot('salon-a')).state.customers[0]
    expect(c.consent).toEqual({ transactional: true, marketing: true })

    await t.app.ingest('salon-a', admin, { type: 'InboundMessageReceived', customerId: customer.id, channel: 'sms', body: 'STOP', source: 'pilot-test' as const, eventId: 'e-stop', occurredAt: t.clock.now().toISOString() })
    c = (await t.app.snapshot('salon-a')).state.customers[0]
    // l'opposition prime sur tout consentement marketing antérieur (règle STOP figée)
    expect(c.optOut).toBe(true)

    // la cliente demande elle-même un renseignement : NOVIA répond (service), le STOP reste
    await t.app.ingest('salon-a', admin, { type: 'InboundMessageReceived', customerId: customer.id, channel: 'sms', body: 'Quel est le prix de la pose ?', source: 'pilot-test' as const, eventId: 'e-prix', occurredAt: t.clock.now().toISOString() })
    // réservation volontaire : ne lève pas l'opposition
    await t.app.command('salon-a', pro, { type: 'BookingCreated', serviceId: 'pose', start: new Date(T0.getTime() + 50 * H).toISOString(), customerId: customer.id, leadSource: 'manual', origin: 'pro' })
    c = (await t.app.snapshot('salon-a')).state.customers[0]
    expect(c.optOut).toBe(true)

    // réinscription : seulement explicite et prouvée
    const noProof = await t.app.command('salon-a', pro, { type: 'ConsentChanged', customerId: customer.id, change: { channel: 'all', purpose: 'marketing', state: 'granted', source: 'explicit_resubscribe' } })
    expect(noProof.value.ok).toBe(false)
    await t.app.command('salon-a', pro, { type: 'ConsentChanged', customerId: customer.id, change: { channel: 'sms', purpose: 'marketing', state: 'granted', source: 'explicit_resubscribe', proofRef: 'SMS « je veux de nouveau vos offres »' } })
    c = (await t.app.snapshot('salon-a')).state.customers[0]
    expect(c.optOut).toBe(false)
    expect(c.consent).toEqual({ transactional: true, marketing: true })

    const ledger = await t.db.businessTx('salon-a', (q) => q.query(`select channel, purpose, state, source from consent_records where business_id = 'salon-a' order by position`))
    expect(ledger.rows.map((r) => `${r.purpose}:${r.state}:${r.source}`)).toEqual([
      'transactional:granted:booking_form',
      'marketing:granted:pro_declared',
      'marketing:opposed:inbound_stop',
      'marketing:granted:explicit_resubscribe',
    ])
    // registre en ajout seul : ni modification ni suppression
    await expect(t.db.businessTx('salon-a', (q) => q.query(`update consent_records set state = 'granted' where business_id = 'salon-a'`))).rejects.toThrow(/ajout seul|append/i)
    const audit = await t.app.auditLog('salon-a')
    expect(audit.filter((a) => a.action === 'command.ConsentChanged').length).toBeGreaterThanOrEqual(2)
  })

  it('paiement déclaré : « CA confirmé » une seule fois, jamais avant la présence, jamais « en ligne »', async () => {
    const { appointment } = await book(t, 'salon-a', 1, 1 * H)
    const early = await t.app.command('salon-a', pro, { type: 'PaymentRecorded', appointmentId: appointment.id, method: 'declared' })
    expect(early.value.ok).toBe(false)
    t.clock.set(new Date(T0.getTime() + 2 * H + 10 * 60_000))
    await t.app.command('salon-a', pro, { type: 'AttendanceRecorded', appointmentId: appointment.id, attended: true, statusSource: 'cockpit' })
    for (let i = 0; i < 2; i++) expect((await t.app.command('salon-a', pro, { type: 'PaymentRecorded', appointmentId: appointment.id, method: 'declared' })).value.ok).toBe(true)
    const { state } = await t.app.snapshot('salon-a')
    const a = state.appointments.find((x) => x.id === appointment.id)!
    expect(a.paymentProof).toMatchObject({ kind: 'declared', amount: 50 })
    const rev = computeRevenue(state.appointments, state.opportunities)
    expect(rev.totals).toEqual({ potential: 0, booked: 0, confirmed: 50 })
    const pay = await t.db.businessTx('salon-a', (c) => c.query(`select kind, amount from payments where business_id = 'salon-a'`))
    expect(pay.rows).toEqual([{ kind: 'declared', amount: '50.00' }])
    await expect(t.db.businessTx('salon-a', (c) => c.query(`update payments set kind = 'online' where business_id = 'salon-a'`))).rejects.toThrow(/check constraint/)
  })

  it('export puis anonymisation d’une cliente : coordonnées effacées, historique légal conservé, autre entreprise intacte', async () => {
    const two = await setup({ businesses: [{ id: 'salon-a', verified: true }, { id: 'salon-b', verified: true }] })
    try {
      const { customer } = await book(two, 'salon-a', 1, 26 * H)
      await book(two, 'salon-b', 1, 26 * H) // même personne fictive, autre salon
      await two.app.ingest('salon-a', admin, { type: 'InboundMessageReceived', customerId: customer.id, channel: 'sms', body: 'Combien coûte la pose ?', source: 'pilot-test' as const, eventId: 'q1', occurredAt: T0.toISOString() })

      const exp = await two.app.exportCustomerData('salon-a', pro, customer.id)
      expect(exp!.value).toMatchObject({ customer: { firstName: 'Test1', email: 'test1@exemple.invalid' } })
      expect(exp!.value!.allMessages.length).toBeGreaterThanOrEqual(2)
      // une cliente d'une autre entreprise n'est pas exportable depuis A
      const otherId = (await two.app.snapshot('salon-b')).state.customers[0].id
      if (otherId !== customer.id) expect((await two.app.exportCustomerData('salon-a', pro, otherId)).value).toBeUndefined()

      expect((await two.app.anonymizeCustomerData('salon-a', pro, customer.id)).value).toBe(true)
      const a = await two.app.snapshot('salon-a')
      const c = a.state.customers.find((x) => x.id === customer.id)!
      expect(c).toMatchObject({ firstName: 'Cliente', lastName: 'anonymisée', phone: '', email: '' })
      expect(c.anonymizedAt).toBeTruthy()
      const raw = await two.db.businessTx('salon-a', (q) => q.query(`select body from messages where business_id = 'salon-a' and customer_id = $1`, [customer.id]))
      expect(raw.rows.every((r) => r.body === '[contenu supprimé]')).toBe(true)
      const consents = await two.db.businessTx('salon-a', (q) => q.query(`select count(*)::int as n from consent_records where business_id = 'salon-a' and customer_id = $1`, [customer.id]))
      expect(consents.rows[0].n).toBeGreaterThan(0) // preuve légale conservée (sans PII)
      const dump = JSON.stringify(await two.db.businessTx('salon-a', (q) => q.query(`select * from customers where business_id = 'salon-a'`)).then((r) => r.rows))
      expect(dump).not.toContain('test1@exemple.invalid')
      expect(dump).not.toContain('06 00 00 00 01')
      // l'autre salon garde sa propre fiche
      expect((await two.app.snapshot('salon-b')).state.customers[0]).toMatchObject({ firstName: 'Test1', email: 'test1@exemple.invalid' })
      const audit = await two.app.auditLog('salon-a')
      expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(['customer.exported', 'customer.anonymized']))
      // le journal d'audit ne contient pas les coordonnées
      expect(JSON.stringify(audit)).not.toContain('test1@exemple.invalid')
    } finally {
      await two.close()
    }
  })
})
