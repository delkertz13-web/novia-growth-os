/**
 * API NOVIA de bout en bout (HTTP réel, PostgreSQL réel, passkeys réelles) :
 * authentification, autorisation par entreprise, validation des entrées, deux appareils.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contact, setup, T0 } from './fixtures'
import { device, startServer } from './http-client'
import { hasPg } from './pg'

describe.skipIf(!hasPg())('API NOVIA : authentification et autorisation', () => {
  let t: Awaited<ReturnType<typeof setup>>
  let s: Awaited<ReturnType<typeof startServer>>
  const owner = () => s.auth.createInvitation('salon-a', 'OWNER', 'iPhone', 'system:test')
  beforeAll(async () => {
    t = await setup({ businesses: [{ id: 'salon-a', verified: true }, { id: 'salon-b', verified: true }] })
    s = await startServer(t)
  })
  afterAll(async () => {
    await s.close()
    await t.close()
  })

  it('sans session : 401 partout, sans rien révéler', async () => {
    const d = device(s.base)
    expect((await d.call('GET', '/api/me')).status).toBe(401)
    expect((await d.call('GET', '/api/b/salon-a/state')).status).toBe(401)
    expect((await d.call('POST', '/api/b/salon-a/commands', { type: 'MarkConversationRead', conversationId: 'x' })).status).toBe(401)
  })

  it('invitation → passkey → session : la pro voit SON entreprise et son rôle', async () => {
    const d = device(s.base)
    const r = await d.acceptInvitation(await owner(), 'Léna (test)')
    expect(r.status).toBe(200)
    expect(d.cookie).toMatch(/^novia_session=/)
    const me = await d.call('GET', '/api/me')
    expect(me.body.businesses).toEqual([{ id: 'salon-a', name: 'Salon Test', role: 'OWNER' }])
    expect((await d.call('GET', '/api/b/salon-a/state')).body.profile.businessId).toBe('salon-a')
  })

  it('une invitation ne sert qu’une fois ; une invitation inconnue est refusée', async () => {
    const token = await owner()
    expect((await device(s.base).acceptInvitation(token)).status).toBe(200)
    expect((await device(s.base).acceptInvitation(token)).status).toBe(401)
    expect((await device(s.base).acceptInvitation('inventé')).status).toBe(401)
  })

  it('l’entreprise B est inaccessible à une pro de l’entreprise A (403), quelle que soit la route', async () => {
    const d = device(s.base)
    await d.acceptInvitation(await owner())
    for (const [m, p, b] of [
      ['GET', '/api/b/salon-b/state', undefined],
      ['GET', '/api/b/salon-b/revision', undefined],
      ['GET', '/api/b/salon-b/shadow-decisions', undefined],
      ['POST', '/api/b/salon-b/commands', { type: 'MarkConversationRead', conversationId: 'conv-c1' }],
      ['GET', '/api/b/salon-b/customers/c1/export', undefined],
      ['GET', '/api/b/inexistante/state', undefined],
    ] as const)
      expect((await d.call(m, p, b)).status, p).toBe(403)
  })

  it('rôle PRO : pas d’audit, pas d’événements de test, pas d’export ni d’anonymisation', async () => {
    const d = device(s.base)
    await d.acceptInvitation(await s.auth.createInvitation('salon-a', 'PRO', 'Tablette', 'system:test'))
    expect((await d.call('GET', '/api/b/salon-a/state')).status).toBe(200)
    expect((await d.call('GET', '/api/b/salon-a/audit')).status).toBe(403)
    expect((await d.call('POST', '/api/b/salon-a/test-events', { eventId: 'x', type: 'InboundMessageReceived', channel: 'sms', body: 'Bonjour' })).status).toBe(403)
    expect((await d.call('GET', '/api/b/salon-a/customers/c1/export')).status).toBe(403)
  })

  it('protection CSRF : en-tête NOVIA et origine identique exigés pour toute écriture', async () => {
    const d = device(s.base)
    await d.acceptInvitation(await owner())
    const cmd = { type: 'MarkConversationRead', conversationId: 'conv-c1' }
    expect((await d.call('POST', '/api/b/salon-a/commands', cmd, { 'x-novia': '' })).status).toBe(403)
    expect((await d.call('POST', '/api/b/salon-a/commands', cmd, { origin: 'https://attaquant.example' })).status).toBe(403)
  })

  it('validation : commande interne, champ en trop, paiement non déclaré, source imposée → 400', async () => {
    const d = device(s.base)
    await d.acceptInvitation(await owner())
    const bad = [
      { type: 'SequenceStepDue', runId: 'r1' },
      { type: 'ReminderDue', appointmentId: 'a1', hoursBefore: 24 },
      { type: 'MessageDeliveryUpdated', outboxKey: 'k', status: 'sent' },
      { type: 'PaymentRecorded', appointmentId: 'a1', method: 'online' },
      { type: 'PaymentRecorded', appointmentId: 'a1', method: 'demo' },
      { type: 'MarkConversationRead', conversationId: 'c', businessId: 'salon-b' },
      { type: 'BookingCreated', serviceId: 'pose', start: T0.toISOString(), contact: contact(9), leadSource: 'site', origin: 'smartfill' },
      { type: 'ConsentChanged', customerId: 'c1', change: { channel: 'sms', purpose: 'marketing', state: 'opposed', source: 'inbound_stop' } },
    ]
    for (const b of bad) expect((await d.call('POST', '/api/b/salon-a/commands', b)).status, JSON.stringify(b)).toBe(400)
  })

  it('une passkey d’une autre origine (hameçonnage) est refusée ; la déconnexion ferme la session', async () => {
    const d = device(s.base)
    await d.acceptInvitation(await owner())
    const o = await d.call('POST', '/api/auth/login/options', {})
    const phished = await d.call('POST', '/api/auth/login/verify', { challengeId: o.body.challengeId, response: d.authenticator.login(o.body.options, 'https://faux-novia.example') })
    expect(phished.status).toBe(401)
    expect((await d.login()).status).toBe(200)
    expect((await d.call('POST', '/api/auth/logout', {})).status).toBe(200)
    expect((await d.call('GET', '/api/me')).status).toBe(401)
  })

  it('deux appareils : A modifie, B voit la nouvelle révision puis le nouvel état (serveur autoritaire)', async () => {
    const a = device(s.base)
    await a.acceptInvitation(await owner())
    // le même compte sur un 2e appareil (passkey synchronisée : même clé)
    const b = device(s.base, a.authenticator)
    expect((await b.login()).status).toBe(200)

    const before = (await b.call('GET', '/api/b/salon-a/revision')).body.revision
    const booked = await a.call('POST', '/api/b/salon-a/commands', {
      type: 'BookingCreated',
      serviceId: 'pose',
      start: new Date(T0.getTime() + 3 * 86_400_000).toISOString(),
      contact: contact(2),
      leadSource: 'manual',
      origin: 'pro',
    })
    expect(booked.body.result.ok).toBe(true)
    const after = (await b.call('GET', '/api/b/salon-a/revision')).body.revision
    expect(after).toBeGreaterThan(before)
    const state = (await b.call('GET', '/api/b/salon-a/state')).body.state
    expect(state.appointments.map((x: { id: string }) => x.id)).toContain(booked.body.result.value.id)
  })
})
