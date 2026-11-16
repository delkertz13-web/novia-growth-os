/**
 * P3 · préparation de PILOT-001, de bout en bout (HTTP réel, PostgreSQL réel, passkeys) :
 * entreprise vide, faits INCONNU / ESTIMÉ / VÉRIFIÉ, reprise de la préparation, droits
 * OWNER / PRO, isolation, messages types, FAQ, Planity qui fait foi, provenance, avis
 * shadow, métriques, import CSV, déclencheur CRON.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assessReadiness } from '../../src/pilot/readiness'
import type { BusinessProfile } from '../../src/config/profile'
import { contact, setup, T0 } from './fixtures'
import { device, startServer } from './http-client'
import { hasPg } from './pg'

const H = 3_600_000
const v = <T,>(value: T) => ({ value, status: 'verified' as const })
const service = { id: 'pose-gel', name: 'Pose gel', description: '', durationMin: 90, price: 55, deposit: 0, category: 'pose', returnRecommendedAfterDays: 21, active: true, coverImageId: '' }

describe.skipIf(!hasPg())('P3 : préparation du pilote', () => {
  let t: Awaited<ReturnType<typeof setup>>
  let s: Awaited<ReturnType<typeof startServer>>
  let ticks = 0
  const CRON = 'c'.repeat(40)
  let owner: ReturnType<typeof device>
  let ownerOfA: ReturnType<typeof device>
  let proDevice: ReturnType<typeof device>
  const P = '/api/b/pilot-001'

  beforeAll(async () => {
    t = await setup({ businesses: [{ id: 'pilot-001' }, { id: 'salon-a', verified: true }] })
    s = await startServer(t, { cronToken: CRON, tick: async () => void ticks++ })
    owner = device(s.base)
    await owner.acceptInvitation(await s.auth.createInvitation('pilot-001', 'OWNER', 'iPhone', 'system:test'), 'Propriétaire')
    proDevice = device(s.base)
    await proDevice.acceptInvitation(await s.auth.createInvitation('pilot-001', 'PRO', 'iPad', 'system:test'), 'Pro')
    ownerOfA = device(s.base)
    await ownerOfA.acceptInvitation(await s.auth.createInvitation('salon-a', 'OWNER', 'iPhone', 'system:test'), 'Propriétaire A')
  })
  afterAll(async () => {
    await s.close()
    await t.close()
  })

  it('entreprise neuve : tout est inconnu, aucun texte ni réponse, rien au-delà du shadow', async () => {
    const r = await owner.call('GET', `${P}/onboarding`)
    expect(r.status).toBe(200)
    const { profile, engineProfile, facts, templates, faq, settings } = r.body
    expect(facts).toEqual({})
    expect(templates).toEqual([])
    expect(faq).toEqual([])
    expect(profile.services.items).toEqual([])
    expect(profile.identity.name).toEqual({ value: '', status: 'unknown' })
    expect(Object.values(engineProfile.templates as Record<string, { status: string }>).every((x) => x.status === 'unknown')).toBe(true)
    const caps = assessReadiness(engineProfile as BusinessProfile, facts, settings)
    expect(caps.find((c) => c.id === 'booking_online')!.level).toBe('BLOCKED')
    expect(caps.find((c) => c.id === 'voice')!.level).toBe('NOT_CONFIGURED')
    expect(caps.every((c) => c.level !== 'READY_FOR_TEST' && c.level !== 'READY_FOR_LIVE')).toBe(true)
  })

  it('lire la préparation ne modifie rien (pas de révision)', async () => {
    const before = (await owner.call('GET', `${P}/revision`)).body.revision
    await owner.call('GET', `${P}/onboarding`)
    await proDevice.call('GET', `${P}/onboarding`)
    expect((await owner.call('GET', `${P}/revision`)).body.revision).toBe(before)
  })

  it('fait estimé enregistré, repris depuis un autre appareil ; « vérifié » sans contenu refusé', async () => {
    expect((await owner.call('PUT', `${P}/onboarding/facts/planity.plan`, { value: 'Formule à confirmer avec la pro', status: 'estimated' })).status).toBe(200)
    expect((await owner.call('PUT', `${P}/onboarding/facts/planity.cost`, { value: '', status: 'verified' })).status).toBe(400)
    expect((await owner.call('PUT', `${P}/onboarding/facts/inventee`, { value: 'x', status: 'verified' })).status).toBe(400)
    // même passkey (synchronisée), autre appareil : la préparation reprend où elle en était
    const other = device(s.base, owner.authenticator)
    expect((await other.login()).status).toBe(200)
    const facts = (await other.call('GET', `${P}/onboarding`)).body.facts
    expect(facts['planity.plan']).toMatchObject({ value: 'Formule à confirmer avec la pro', status: 'estimated' })
    expect(facts['planity.cost']).toBeUndefined()
  })

  it('droits : la PRO lit, rédige et donne son avis ; seule la propriétaire modifie, approuve et importe', async () => {
    expect((await proDevice.call('GET', `${P}/onboarding`)).status).toBe(200)
    expect((await proDevice.call('PUT', `${P}/onboarding/facts/goals.priority`, { value: 'x', status: 'verified' })).status).toBe(403)
    expect((await proDevice.call('PUT', `${P}/profile/services`, { value: { status: 'verified', items: [service] } })).status).toBe(403)
    const d = await proDevice.call('POST', `${P}/templates`, { key: 'W04.recovery', body: 'Bonjour {firstName}, on reprend rendez-vous ?' })
    expect(d.status).toBe(200)
    expect((await proDevice.call('POST', `${P}/templates/W04.recovery/${d.body.version}/approve`, {})).status).toBe(403)
    const f = await proDevice.call('POST', `${P}/faq`, { intent: 'Parking', keywords: ['parking'], answer: 'À compléter' })
    expect(f.status).toBe(200)
    expect((await proDevice.call('POST', `${P}/faq/${f.body.id}/approve`, {})).status).toBe(403)
    expect((await proDevice.call('POST', `${P}/import/customers`, { source: 'IMPORT', rows: [] })).status).toBe(403)
  })

  it('isolation : aucune route de préparation n’ouvre une autre entreprise', async () => {
    for (const [m, p, b] of [
      ['GET', '/api/b/salon-a/onboarding', undefined],
      ['GET', '/api/b/salon-a/pilot-metrics', undefined],
      ['GET', '/api/b/salon-a/shadow-decisions', undefined],
      ['PUT', '/api/b/salon-a/onboarding/facts/planity.plan', { value: 'x', status: 'verified' }],
      ['POST', '/api/b/salon-a/templates', { key: 'W04.recovery', body: 'x' }],
      ['POST', '/api/b/salon-a/shadow-decisions/1/feedback', { verdict: 'AGREE' }],
      ['POST', '/api/b/salon-a/import/customers', { source: 'IMPORT', rows: [] }],
    ] as const)
      expect((await owner.call(m, p, b)).status, p).toBe(403)
    // une décision de A ne peut pas recevoir d'avis par la route de PILOT-001 (introuvable chez elle)
    await ownerOfA.call('POST', '/api/b/salon-a/commands', { type: 'BookingCreated', serviceId: 'pose', start: new Date(T0.getTime() + 26 * H).toISOString(), contact: contact(9), leadSource: 'manual', origin: 'pro' })
    const idA = (await ownerOfA.call('GET', '/api/b/salon-a/shadow-decisions')).body.decisions[0].id
    expect((await owner.call('POST', `${P}/shadow-decisions/${idA}/feedback`, { verdict: 'AGREE' })).status).toBe(400)
  })

  it('messages types : brouillon → approuvé (seul utilisé par le moteur) → nouvelle version, l’ancienne archivée', async () => {
    expect((await owner.call('POST', `${P}/templates`, { key: 'W02.confirmation', body: 'Bonjour {inconnue}' })).status).toBe(400)
    const v1 = (await owner.call('POST', `${P}/templates`, { key: 'W02.confirmation', body: '{business} : {service} le {when}.' })).body.version
    let o = (await owner.call('GET', `${P}/onboarding`)).body
    expect(o.engineProfile.templates['W02.confirmation'].status).toBe('unknown') // un brouillon ne sert à rien
    await owner.call('POST', `${P}/templates/W02.confirmation/${v1}/approve`, {})
    o = (await owner.call('GET', `${P}/onboarding`)).body
    expect(o.engineProfile.templates['W02.confirmation']).toEqual({ value: '{business} : {service} le {when}.', status: 'verified' })
    const v2 = (await owner.call('POST', `${P}/templates`, { key: 'W02.confirmation', body: '{business} : RDV {service} confirmé, {when}.' })).body.version
    await owner.call('POST', `${P}/templates/W02.confirmation/${v2}/approve`, {})
    o = (await owner.call('GET', `${P}/onboarding`)).body
    const rows = o.templates.filter((x: { key: string }) => x.key === 'W02.confirmation')
    expect(rows.map((x: { version: number; status: string }) => [x.version, x.status])).toEqual([
      [v2, 'APPROVED'],
      [v1, 'ARCHIVED'],
    ])
    expect(rows[0]).toMatchObject({ workflow: 'W02', channel: 'sms', purpose: 'transactional', author: expect.stringMatching(/^user:/) })
    expect(o.engineProfile.templates['W02.confirmation'].value).toMatch(/confirmé/)
  })

  it('FAQ : sans réponse approuvée, la question va à un humain ; approuvée, NOVIA répond avec CE texte', async () => {
    await owner.call('POST', '/api/b/pilot-001/commands', { type: 'ContactUpserted', contact: contact(1), leadSource: 'manual' })
    let st = (await owner.call('GET', `${P}/state`)).body.state
    const c = st.customers[0]
    await s.app.ingest('pilot-001', { type: 'test', id: 't' }, { type: 'InboundMessageReceived', customerId: c.id, channel: 'sms', body: 'Avez-vous un parking ?', source: 'pilot-test', eventId: 'q1', occurredAt: T0.toISOString() })
    st = (await owner.call('GET', `${P}/state`)).body.state
    let conv = st.conversations.find((x: { customerId: string }) => x.customerId === c.id)
    expect(conv.needsHuman).toBe(true)
    expect(conv.messages.filter((m: { from: string }) => m.from === 'novia')).toHaveLength(0)

    const id = (await owner.call('POST', `${P}/faq`, { intent: 'Stationnement', keywords: ['stationner', 'garer'], answer: 'Réponse validée par la pro.' })).body.id
    await owner.call('POST', `${P}/faq/${id}/approve`, {})
    await s.app.ingest('pilot-001', { type: 'test', id: 't' }, { type: 'InboundMessageReceived', customerId: c.id, channel: 'sms', body: 'Où se garer ?', source: 'pilot-test', eventId: 'q2', occurredAt: T0.toISOString() })
    st = (await owner.call('GET', `${P}/state`)).body.state
    conv = st.conversations.find((x: { customerId: string }) => x.customerId === c.id)
    expect(conv.messages.filter((m: { from: string }) => m.from === 'novia').map((m: { body: string }) => m.body)).toEqual(['Réponse validée par la pro.'])
    // un brouillon (celui de la PRO, plus haut) n'est jamais utilisé
    const o = (await owner.call('GET', `${P}/onboarding`)).body
    expect(o.engineProfile.approvedAnswers.value.map((a: { answer: string }) => a.answer)).toEqual(['Réponse validée par la pro.'])
  })

  it('Planity fait foi : réservation en ligne refusée même avec horaires et prestations vérifiés ; la saisie de la pro passe', async () => {
    const open = { open: '09:00', close: '19:00' }
    const put = (sec: string, value: unknown) => owner.call('PUT', `${P}/profile/${sec}`, { value })
    expect((await put('services', { status: 'verified', items: [service] })).status).toBe(200)
    expect((await put('hours', { openingHours: v({ 0: null, 1: null, 2: open, 3: open, 4: open, 5: open, 6: open }), breaks: v([]) })).status).toBe(200)
    expect((await put('booking', v({ minNoticeHours: 0, maxAdvanceDays: 60, slotStepMin: 30, bufferMin: 0 }))).status).toBe(200)
    expect((await put('schedule', { authority: v('planity'), externalReminders: v(true) })).status).toBe(200)
    expect((await put('services', { status: 'demo', items: [service] })).status).toBe(400) // jamais de « démo » en pilote
    const start = new Date(T0.getTime() + 26 * H).toISOString()
    const online = await owner.call('POST', `${P}/commands`, { type: 'BookingCreated', serviceId: 'pose-gel', start, contact: contact(2), leadSource: 'site', origin: 'site' })
    expect(online.body.result).toMatchObject({ ok: false, error: expect.stringMatching(/Réservation en ligne indisponible/) })
    const o = (await owner.call('GET', `${P}/onboarding`)).body
    const caps = assessReadiness(o.engineProfile, o.facts, o.settings)
    expect(caps.find((c) => c.id === 'booking_online')!.reasons.join(' ')).toMatch(/Planity fait foi/)
    // l'agenda envoie déjà des rappels : NOVIA n'en ajoute pas
    expect(caps.find((c) => c.id === 'W02.reminder')!.reasons.join(' ')).toMatch(/doublon/)
    const manual = await proDevice.call('POST', `${P}/commands`, { type: 'BookingCreated', serviceId: 'pose-gel', start, contact: contact(2), leadSource: 'manual', origin: 'pro' })
    expect(manual.body.result).toMatchObject({ ok: true })
  })

  it('provenance posée par le serveur selon le rôle ; le navigateur ne peut pas la choisir', async () => {
    const start = new Date(T0.getTime() + 50 * H).toISOString()
    await owner.call('POST', `${P}/commands`, { type: 'BookingCreated', serviceId: 'pose-gel', start, contact: contact(3), leadSource: 'manual', origin: 'pro' })
    expect((await owner.call('POST', `${P}/commands`, { type: 'ContactUpserted', contact: contact(4), leadSource: 'manual', provenance: 'PLANITY_NOTIFICATION' })).status).toBe(400)
    const st = (await owner.call('GET', `${P}/state`)).body.state
    const byPhone = (n: number) => st.customers.find((c: { phone: string }) => c.phone === contact(n).phone)
    expect(byPhone(2).provenance).toBe('PRO_MANUAL')
    expect(byPhone(3).provenance).toBe('OWNER_MANUAL')
    const appts = st.appointments as { customerId: string; provenance: string }[]
    expect(appts.find((a) => a.customerId === byPhone(2).id)!.provenance).toBe('PRO_MANUAL')
    expect(appts.find((a) => a.customerId === byPhone(3).id)!.provenance).toBe('OWNER_MANUAL')
    expect(appts.some((a) => a.provenance?.startsWith('PLANITY'))).toBe(false)
  })

  it('correction de saisie et liste d’attente passent par le moteur', async () => {
    const st = (await owner.call('GET', `${P}/state`)).body.state
    const a = st.appointments[0]
    const newStart = new Date(new Date(a.start).getTime() + H).toISOString()
    const r = await owner.call('POST', `${P}/commands`, { type: 'AppointmentCorrected', appointmentId: a.id, start: newStart })
    expect(r.body.result).toMatchObject({ ok: true })
    const w = await owner.call('POST', `${P}/commands`, { type: 'WaitlistJoined', customerId: a.customerId, serviceId: 'pose-gel', days: [2, 3], periods: ['matin'] })
    expect(w.body.result).toMatchObject({ ok: true })
    const after = (await owner.call('GET', `${P}/state`)).body.state
    expect(after.appointments.find((x: { id: string }) => x.id === a.id).start).toBe(newStart)
    expect(after.waitlist.some((x: { customerId: string }) => x.customerId === a.customerId)).toBe(true)
  })

  it('Shadow Control Center : filtres, avis (sans effet sur les règles), métriques sans revenu', async () => {
    const all = (await owner.call('GET', `${P}/shadow-decisions`)).body.decisions as { id: number; result: string; workflow: string; customer_id: string }[]
    expect(all.length).toBeGreaterThan(0)
    const blocked = (await owner.call('GET', `${P}/shadow-decisions?result=BLOCKED`)).body.decisions as typeof all
    expect(blocked.every((d) => d.result === 'BLOCKED')).toBe(true)
    expect((await owner.call('GET', `${P}/shadow-decisions?workflow=W99`)).status).toBe(400)
    expect((await owner.call('GET', `${P}/shadow-decisions?from=pas-une-date`)).status).toBe(400)
    const one = all[0]
    const byCustomer = (await owner.call('GET', `${P}/shadow-decisions?customer=${one.customer_id}`)).body.decisions as typeof all
    expect(byCustomer.every((d) => d.customer_id === one.customer_id)).toBe(true)

    const profileBefore = (await owner.call('GET', `${P}/onboarding`)).body.engineProfile
    expect((await owner.call('POST', `${P}/shadow-decisions/${one.id}/feedback`, { verdict: 'PEUT-ETRE' })).status).toBe(400)
    expect((await owner.call('POST', `${P}/shadow-decisions/${one.id}/feedback`, { verdict: 'AGREE', comment: 'Oui' })).status).toBe(200)
    expect((await proDevice.call('POST', `${P}/shadow-decisions/${one.id}/feedback`, { verdict: 'UNSURE' })).status).toBe(200)
    // la propriétaire change d'avis : une seule réponse par personne
    expect((await owner.call('POST', `${P}/shadow-decisions/${one.id}/feedback`, { verdict: 'DISAGREE', comment: 'Trop tôt' })).status).toBe(200)
    const d = ((await owner.call('GET', `${P}/shadow-decisions`)).body.decisions as { id: number; feedback: { verdict: string; comment: string | null }[] }[]).find((x) => x.id === one.id)!
    expect(d.feedback.map((f) => f.verdict).sort()).toEqual(['DISAGREE', 'UNSURE'])
    expect(d.feedback.find((f) => f.verdict === 'DISAGREE')!.comment).toBe('Trop tôt')
    expect((await owner.call('GET', `${P}/onboarding`)).body.engineProfile).toEqual(profileBefore)

    const m = (await owner.call('GET', `${P}/pilot-metrics`)).body
    expect(m.decisions).toBe(m.wouldExecute + m.blocked)
    expect(m.decisions).toBeGreaterThanOrEqual(all.length)
    expect(m.feedback).toEqual({ AGREE: 0, DISAGREE: 1, UNSURE: 1 })
    expect(m.blockReasons.length).toBeGreaterThan(0)
    expect(JSON.stringify(m)).not.toMatch(/revenue|amount|gagn|€/i)
  })

  it('import CSV : aperçu sans écriture, doublons, invalides ; import avec provenance et SANS consentement marketing', async () => {
    const before = (await owner.call('GET', `${P}/state`)).body.state.customers.length
    const rows = [
      { line: 2, row: { firstName: 'Ana', lastName: 'Import', phone: '06 11 11 11 11', email: '' } },
      { line: 3, row: { firstName: 'Ana', lastName: 'Bis', phone: '0611111111', email: '' } }, // doublon dans le fichier
      { line: 4, row: { firstName: 'Déjà', lastName: 'Là', phone: contact(2).phone, email: '' } }, // déjà dans NOVIA
      { line: 5, row: { firstName: '', lastName: '', phone: '', email: '' } }, // invalide
      { line: 6, row: { firstName: 'Bea', lastName: 'Import', phone: '', email: 'bea@exemple.invalid' } },
    ]
    expect((await owner.call('POST', `${P}/import/customers`, { source: 'PLANITY', rows })).status).toBe(400)
    const preview = await owner.call('POST', `${P}/import/customers`, { source: 'PLANITY_EXPORT', rows })
    expect(preview.status).toBe(200)
    expect(preview.body.summary).toEqual({ total: 5, new: 2, duplicateExisting: 1, duplicateInFile: 1, invalid: 1 })
    expect(preview.body.imported).toBe(0)
    expect((await owner.call('GET', `${P}/state`)).body.state.customers.length).toBe(before)

    const done = await owner.call('POST', `${P}/import/customers`, { source: 'PLANITY_EXPORT', rows, dryRun: false })
    expect(done.body.imported).toBe(2)
    const st = (await owner.call('GET', `${P}/state`)).body.state
    expect(st.customers.length).toBe(before + 2)
    const imported = st.customers.filter((c: { lastName: string }) => c.lastName === 'Import')
    expect(imported).toHaveLength(2)
    for (const c of imported) {
      expect(c.provenance).toBe('PLANITY_EXPORT')
      expect(c.consent.marketing).toBe(false)
      expect(c.consents.some((r: { purpose: string; state: string }) => r.purpose === 'marketing' && r.state === 'granted')).toBe(false)
    }
    // rejouer l'import : tout est désormais en doublon
    const again = await owner.call('POST', `${P}/import/customers`, { source: 'PLANITY_EXPORT', rows, dryRun: false })
    expect(again.body.imported).toBe(0)
  })

  it('déclencheur CRON : jeton exigé (sans cookie), passage de l’ordonnanceur', async () => {
    const raw = (body: unknown) => fetch(`${s.base}/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect((await raw({})).status).toBe(403)
    expect((await raw({ token: 'mauvais' })).status).toBe(403)
    const before = ticks
    const ok = await raw({ token: CRON })
    expect(ok.status).toBe(200)
    expect(ticks).toBe(before + 1)
  })
})
