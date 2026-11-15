/**
 * P1 — moteur NOVIA et contrats V2 : orchestration hors des providers, idempotence,
 * pannes de fournisseur, versions, isolation multi-entreprise, profil injecté, consentement,
 * mode shadow. Aucun réseau, aucune heure réelle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessProfile } from '../config/profile'
import { addDays, parseWall } from '../core/time'
import { demoProfile } from '../demo/config/profile'
import { createSeed } from '../demo/seed'
import { createNovia } from '../domain/intents'
import { createPilotProfile } from '../pilot/profile'
import { createFixedClock } from '../providers/clock'
import { createMockProviders, type Fault } from '../providers/mock'
import type { MessagingProvider, SendMessageRequest } from '../providers/types'
import { createEngine, createMemoryStore, emptyState, shadowReport, type ExecutionMode, type NoviaState } from '.'

const TZ = 'Europe/Paris'
const NOW = parseWall('2026-11-19T15:10:00', TZ)
const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}
/** le même profil, chaque valeur marquée « vérifiée » par l'établissement */
const verified = (p: BusinessProfile): BusinessProfile =>
  JSON.parse(JSON.stringify(p), (k, v) => (k === 'status' && (v === 'demo' || v === 'unknown') ? 'verified' : v))

function setup(opts: { profile?: BusinessProfile; execution?: ExecutionMode; faults?: (w: { method: string }) => Fault | undefined; crm?: boolean; messaging?: MessagingProvider; state?: NoviaState } = {}) {
  const clock = createFixedClock(NOW)
  const store = createMemoryStore<NoviaState>(opts.state ?? createSeed(NOW))
  const mocks = createMockProviders(clock, { faults: opts.faults, crm: opts.crm })
  const providers = opts.messaging ? { ...mocks, messaging: opts.messaging } : mocks
  const engine = createEngine({ store, profile: opts.profile ?? demoProfile, providers, execution: opts.execution ?? 'simulated' })
  return { store, engine, ledger: mocks.ledger, novia: createNovia(engine) }
}

type Novia = ReturnType<typeof setup>['novia']
const firstSlot = (novia: Novia, serviceId: string, from = 1) => {
  for (let d = from; d < from + 14; d++) {
    const s = novia.client.availableSlots(addDays(NOW, d, TZ), serviceId)[0]
    if (s) return s
  }
  throw new Error('aucun créneau')
}
const contact = { firstName: 'Nina', lastName: 'Essai', phone: '06 12 12 12 12', email: 'nina@exemple.demo' }
const book = (novia: Novia, extra: Partial<Parameters<Novia['client']['book']>[0]> = {}) =>
  novia.client.book({ serviceId: 'remplissage', start: firstSlot(novia, 'remplissage'), contact, source: 'site', origin: 'site', ...extra })
const awaiting = (novia: Novia) => novia.pro.cockpit(NOW).toConfirm[0]

const network = { fetch: vi.fn(), xhr: vi.fn(), ws: vi.fn() }
beforeEach(() => {
  vi.stubGlobal('fetch', network.fetch)
  vi.stubGlobal('XMLHttpRequest', network.xhr)
  vi.stubGlobal('WebSocket', network.ws)
})
afterEach(() => {
  for (const spy of Object.values(network)) expect(spy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('orchestration sortie des providers', () => {
  it('le moteur décide (RDV, attribution, confirmation W02) ; le provider Mock ne fait que transporter', async () => {
    const { novia, ledger, store } = setup()
    const a = ok(await book(novia))
    expect(a.attribution).toBe('acquisition')
    // une seule écriture technique : l'envoi de la confirmation, avec sa clé d'idempotence
    expect(ledger.writes).toEqual([expect.objectContaining({ provider: 'mock-sms', method: 'send', idempotencyKey: `W02:confirmation:${a.id}` })])
    expect(store.read().messages[0]).toMatchObject({ purpose: 'W02 · confirmation', status: 'simulated', externalRef: { provider: 'mock-sms' } })
  })

  it('changer de messagerie (GHL ↔ SMS direct) ne touche ni au moteur ni au domaine', async () => {
    const sent: SendMessageRequest[] = []
    const directSms: MessagingProvider = { name: 'sms-direct-test', send: async (req) => (sent.push(req), { ok: true, value: { externalRef: { provider: 'sms-direct-test', id: 'x1' }, status: 'accepted' } }) }
    const { novia, store } = setup({ messaging: directSms })
    const a = ok(await book(novia))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ businessId: demoProfile.businessId, idempotencyKey: `W02:confirmation:${a.id}`, purpose: 'transactional', to: { phone: contact.phone } })
    expect(store.read().messages[0].status).toBe('sent')
  })

  it('absence : W04 démarre, montant à récupérer, sans aucun appel provider', async () => {
    const { novia, ledger, store } = setup()
    const target = awaiting(novia)
    const r = ok(await novia.pro.declareAbsence(target.id))
    expect(r.stateLabel).toBe('Absente')
    expect(store.read().runs.some((x) => x.appointmentId === target.id && x.workflow === 'W04' && x.state === 'active')).toBe(true)
    expect(store.read().opportunities.some((o) => o.sourceAppointmentId === target.id && o.kind === 'noshow_recovery' && o.status === 'open')).toBe(true)
    expect(ledger.writes).toHaveLength(0)
  })
})

describe('idempotence', () => {
  it('un événement externe reçu deux fois n’est traité qu’une fois (inbox)', async () => {
    const { engine, store } = setup()
    const target = store.read().appointments.find((a) => a.status === 'confirmed' && new Date(a.start) < NOW)!
    const event = { type: 'AttendanceRecorded', appointmentId: target.id, attended: false, statusSource: 'integration', source: 'calendar', eventId: 'evt-42' } as const
    const first = await engine.execute(event)
    const runs = store.read().runs.length
    const again = await engine.execute(event)
    expect(first.ok).toBe(true)
    expect(again).toMatchObject({ ok: true, duplicate: true })
    expect(store.read().runs.length).toBe(runs)
    expect(store.read().appointments.find((a) => a.id === target.id)!.history).toHaveLength(1)
  })

  it('une même décision d’envoi n’est jamais exécutée deux fois (clé déterministe)', async () => {
    const { novia, engine, ledger, store } = setup()
    const a = ok(await book(novia))
    await engine.execute({ type: 'ReminderDue', source: 'novia-engine', appointmentId: a.id, hoursBefore: 24 })
    await engine.execute({ type: 'ReminderDue', source: 'novia-engine', appointmentId: a.id, hoursBefore: 24 })
    await engine.flush()
    expect(store.read().messages.filter((m) => m.purpose === 'W02 · rappel 24 h')).toHaveLength(1)
    expect(ledger.writes.filter((w) => w.idempotencyKey.startsWith('W02:reminder'))).toHaveLength(1)
  })

  it('le provider Mock rejoue une écriture déjà faite sans second effet', async () => {
    const { ledger } = setup()
    const { messaging } = createMockProviders(createFixedClock(NOW))
    const req = { businessId: 'b1', idempotencyKey: 'k', to: { customerId: 'c1', phone: '0600000000', name: 'X' }, channel: 'sms', body: 'x', purpose: 'transactional' } as const
    const [r1, r2] = [await messaging.send(req), await messaging.send(req)]
    expect(r1).toEqual(r2)
    expect(ledger.writes).toHaveLength(0) // ledgers isolés : rien n'a fuité d'une composition à l'autre
  })

  it('un événement plus ancien que l’état connu du RDV est ignoré (version)', async () => {
    const { novia, engine, store } = setup()
    const target = awaiting(novia)
    ok(await novia.pro.confirmPresence(target.id)) // version 1
    const stale = await engine.execute({ type: 'BookingCancelled', appointmentId: target.id, statusSource: 'integration', source: 'calendar', eventId: 'planity-7', version: 0 })
    expect(stale).toMatchObject({ ok: true, stale: true })
    expect(store.read().appointments.find((a) => a.id === target.id)!.status).toBe('showed')
  })

  it('statuts de livraison dans le désordre : « sent » arrivé après « delivered » est ignoré', async () => {
    const { novia, engine, store } = setup()
    const a = ok(await book(novia))
    const key = `W02:confirmation:${a.id}`
    const status = () => store.read().messages.find((m) => m.idempotencyKey === key)!.status
    ok(await engine.execute({ type: 'MessageDeliveryUpdated', outboxKey: key, status: 'delivered', source: 'messaging', eventId: 'dlr-2' }))
    const late = await engine.execute({ type: 'MessageDeliveryUpdated', outboxKey: key, status: 'sent', source: 'messaging', eventId: 'dlr-1' })
    expect(late.ok).toBe(true)
    expect(status()).toBe('delivered')
    expect(store.read().journal.some((j) => j.kind === 'stale' && /après « delivered »/.test(j.label))).toBe(true)
  })
})

describe('pannes de fournisseur', () => {
  it('panne retentable : la décision tient, l’envoi est retenté puis réussit une seule fois', async () => {
    let down = true
    const { novia, engine, ledger, store } = setup({ faults: () => (down ? { code: 'unavailable', retryable: true } : undefined) })
    const r = await book(novia)
    expect(r.ok).toBe(true)
    expect(store.read().messages[0].status).toBe('retrying')
    expect(store.read().outbox[0]).toMatchObject({ status: 'retrying', attempts: 1, lastError: { code: 'unavailable', retryable: true } })
    down = false
    await engine.flush()
    expect(store.read().messages[0].status).toBe('simulated')
    expect(ledger.writes).toHaveLength(1)
  })

  it('panne définitive : marquée en échec, jamais retentée', async () => {
    const { novia, engine, ledger, store } = setup({ faults: () => ({ code: 'invalid_request', retryable: false }) })
    expect((await book(novia)).ok).toBe(true)
    await engine.flush()
    expect(store.read().outbox[0]).toMatchObject({ status: 'failed', attempts: 1 })
    expect(store.read().journal.some((j) => j.kind === 'delivery' && /définitif/.test(j.label))).toBe(true)
    expect(ledger.writes).toHaveLength(0)
  })

  it('une exception imprévue du provider devient une erreur typée retentable, jamais une exception', async () => {
    const broken: MessagingProvider = {
      name: 'broken',
      send: () => {
        throw new Error('socket hang up')
      },
    }
    const { novia, store } = setup({ messaging: broken })
    const r = await book(novia)
    expect(r.ok).toBe(true)
    expect(store.read().outbox[0].lastError).toEqual({ code: 'unexpected', message: 'socket hang up', retryable: true })
  })

  it('au-delà de 5 essais, l’envoi passe en échec définitif', async () => {
    const { novia, engine, store } = setup({ faults: () => ({ code: 'rate_limited', retryable: true }) })
    await book(novia)
    for (let i = 0; i < 6; i++) await engine.flush()
    expect(store.read().outbox[0]).toMatchObject({ status: 'failed', attempts: 5 })
  })
})

describe('multi-entreprise', () => {
  it('deux entreprises sont isolées : données, identifiants et événements', async () => {
    const a = setup()
    const other = verified(createPilotProfile('salon-b', 'Europe/Paris'))
    const b = setup({ profile: other, state: emptyState('salon-b', other.defaultSettings) })
    ok(await book(a.novia))
    expect(b.store.read().customers).toHaveLength(0)
    expect(a.store.read().customers.every((c) => c.businessId === demoProfile.businessId)).toBe(true)
    expect(a.store.read().appointments.every((x) => x.businessId === demoProfile.businessId)).toBe(true)
    // un événement adressé à une autre entreprise est refusé
    const foreign = await b.engine.execute({ type: 'HumanTakeoverChanged', customerId: 'c01', value: true, businessId: demoProfile.businessId })
    expect(foreign).toMatchObject({ ok: false, code: 'isolation' })
    expect(a.store.read().customers.find((c) => c.id === 'c01')!.humanTakeover).toBe(false)
  })

  it('un store ne change jamais d’entreprise, et le moteur refuse un profil d’une autre entreprise', () => {
    const { store } = setup()
    expect(() => store.replace({ ...store.read(), businessId: 'intrus' })).toThrow(/Isolation/)
    expect(() => createEngine({ store, profile: createPilotProfile('autre', TZ), providers: createMockProviders(createFixedClock(NOW)), execution: 'simulated' })).toThrow(/Isolation/)
  })
})

describe('BusinessProfile injecté', () => {
  it('textes, nom et prestations viennent du profil, pas du code', async () => {
    const custom = verified(demoProfile)
    custom.identity = { ...custom.identity, name: { value: 'Atelier Iris', status: 'verified' } }
    custom.templates = { ...custom.templates, 'W02.confirmation': { value: '{business} : {service} confirmé pour {firstName}.', status: 'verified' } }
    const { novia, store } = setup({ profile: custom, execution: 'live' })
    ok(await book(novia))
    expect(store.read().messages[0].body).toBe('Atelier Iris : Remplissage confirmé pour Nina.')
  })

  it('hors simulation, une donnée non vérifiée BLOQUE l’automatisation qui en dépend', async () => {
    const { novia, store, ledger } = setup({ execution: 'live' }) // profil de démo : valeurs « demo »
    const a = ok(await book(novia))
    expect(a.status).toBe('booked') // la réservation est enregistrée…
    expect(store.read().messages).toHaveLength(0) // …mais aucun message n'est parti
    expect(store.read().journal.some((j) => j.kind === 'blocked' && j.appointmentId === a.id)).toBe(true)
    ok(await novia.pro.declareAbsence(awaiting(novia).id))
    expect(store.read().runs.filter((r) => r.state === 'active' && r.startedAt === NOW.toISOString())).toHaveLength(0)
    expect(ledger.writes).toHaveLength(0)
  })

  it('le profil pilote n’invente rien : tout est inconnu et les automatisations sont coupées', () => {
    const p = createPilotProfile('pilot-001', 'Europe/Paris')
    expect(p.identity.name).toEqual({ value: '', status: 'unknown' })
    expect(p.services.items).toEqual([])
    expect(Object.values(p.templates).every((t) => t.status === 'unknown' && t.value === '')).toBe(true)
    expect(Object.values(p.defaultSettings.automations).every((v) => v === false)).toBe(true)
    expect(JSON.stringify(p)).not.toMatch(/Léa|NOVIA Nails|exemple\.demo/)
  })
})

describe('consentement', () => {
  it('« STOP » reçu : opposition inscrite au registre avec sa preuve, reflétée dans le miroir CRM', async () => {
    const { engine, store, ledger } = setup({ crm: true })
    const r = await engine.execute({ type: 'InboundMessageReceived', source: 'messaging', eventId: 'sms-901', customerId: 'c01', channel: 'sms', body: 'STOP' })
    expect(r).toMatchObject({ ok: true, value: { kind: 'stop' } })
    const c = store.read().customers.find((x) => x.id === 'c01')!
    expect(c.optOut).toBe(true)
    expect(c.consents.at(-1)).toMatchObject({ state: 'opposed', source: 'inbound_stop', channel: 'sms', proofRef: 'message messaging:sms-901' })
    expect(ledger.writes.some((w) => w.method === 'setOptOut')).toBe(true)
  })

  it('l’opposition ne tombe ni par une réservation (case cochée) ni par une conversation', async () => {
    const { novia, store } = setup()
    const louise = store.read().customers.find((c) => c.id === 'c16')!
    expect(louise.optOut).toBe(true)
    ok(await novia.client.book({ serviceId: 'remplissage', start: firstSlot(novia, 'remplissage'), contact: { ...contact, phone: louise.phone, email: louise.email }, source: 'site', origin: 'site', marketingConsent: { granted: true, proofRef: 'case cochée' } }))
    const after = store.read().customers.find((c) => c.id === 'c16')!
    expect(after.optOut).toBe(true)
    expect(after.consents.at(-1)).toMatchObject({ purpose: 'marketing', state: 'granted', source: 'booking_form' })
  })

  it('seule une réinscription explicite ET prouvée lève l’opposition', async () => {
    const { novia, store } = setup()
    const without = await novia.pro.recordConsent('c16', { channel: 'sms', purpose: 'marketing', state: 'granted', source: 'explicit_resubscribe' })
    expect(without.ok).toBe(false)
    expect(store.read().customers.find((c) => c.id === 'c16')!.optOut).toBe(true)
    ok(await novia.pro.recordConsent('c16', { channel: 'sms', purpose: 'marketing', state: 'granted', source: 'explicit_resubscribe', proofRef: 'SMS « JE VEUX RECEVOIR » du 19/11' }))
    const c = store.read().customers.find((x) => x.id === 'c16')!
    expect(c.optOut).toBe(false)
    expect(c.consents.map((r) => r.state)).toEqual(['granted', 'granted', 'opposed', 'granted'])
  })
})

describe('mode shadow : NOVIA décide, n’envoie rien', () => {
  it('« aurait envoyé », « aurait démarré la récupération », « éligible SmartFill », « bloqué à cause du STOP »', async () => {
    const { novia, store, ledger } = setup({ profile: verified(demoProfile), execution: 'shadow' })
    const a = ok(await book(novia))
    const target = awaiting(novia)
    ok(await novia.pro.declareAbsence(target.id))
    const louiseAppt = store.read().appointments.find((x) => x.customerId === 'c16')!
    // Louise (STOP) manque un RDV : la récupération est bloquée
    store.replace({ ...store.read(), appointments: store.read().appointments.map((x) => (x.id === louiseAppt.id ? { ...x, status: 'confirmed', start: new Date(NOW.getTime() - 3 * 3_600_000).toISOString() } : x)) })
    ok(await novia.pro.declareAbsence(louiseAppt.id))
    const slot = novia.pro.cockpit(NOW).freedSlots[0]
    const funnel = (await novia.pro.launchSmartFill(slot.id)).ok
    expect(funnel).toBe(true)

    const report = shadowReport(store.read())
    expect(report.wouldSend.some((m) => m.purpose === 'W02 · confirmation' && m.to === 'Nina Essai')).toBe(true)
    expect(report.recoveriesStarted.some((r) => r.workflow === 'W04' && r.appointmentId === target.id)).toBe(true)
    expect(report.blocked.some((b) => b.customerId === 'c16' && /STOP/.test(b.label))).toBe(true)
    expect(report.smartFill.some((x) => /contactable/.test(x.label))).toBe(true)
    expect(report.smartFill.some((x) => /proposerait/.test(x.label))).toBe(true)
    expect(store.read().messages.find((m) => m.appointmentId === a.id)!.status).toBe('shadow')
    expect(ledger.writes).toHaveLength(0) // rien n'a été remis à un fournisseur
  })

  it('l’ordonnanceur déclenche les rappels dus, sans doublon, et jamais pour un RDV annulé', async () => {
    const { engine, store } = setup({ profile: verified(demoProfile), execution: 'shadow' })
    const due = await engine.tick()
    expect(due).toBeGreaterThan(0)
    expect(await engine.tick()).toBe(0)
    const reminders = store.read().messages.filter((m) => m.purpose.startsWith('W02 · rappel'))
    expect(reminders).toHaveLength(due)
    expect(reminders.every((m) => m.status === 'shadow')).toBe(true)
    const ids = new Set(reminders.map((m) => m.appointmentId))
    expect(store.read().appointments.filter((x) => ids.has(x.id)).every((x) => x.status === 'booked' || x.status === 'confirmed')).toBe(true)
  })
})

describe('revenu et Voice dans le moteur', () => {
  it('paiement déclaré par la pro (pilote) : le CA devient confirmé, une seule fois', async () => {
    const { novia, store } = setup({ execution: 'shadow' })
    const target = awaiting(novia)
    ok(await novia.pro.confirmPresence(target.id))
    const before = novia.pro.revenueAttribution().totals.confirmed
    expect(ok(await novia.pro.recordPaymentProof(target.id)).kind).toBe('declared')
    expect(novia.pro.revenueAttribution().totals.confirmed - before).toBe(target.price)
    expect(store.read().appointments.find((a) => a.id === target.id)!.paymentProof!.amount).toBe(target.price)
  })

  it('un appel Voice qui réserve : attribution Voice, réservé mais jamais confirmé automatiquement', async () => {
    const { engine, store } = setup()
    const start = firstSlot(createNovia(engine), 'semi-permanent').toISOString()
    const booked = await engine.execute<{ id: string; attribution: string; paymentProof?: unknown }>({ type: 'BookingCreated', source: 'voice', eventId: 'call-1', serviceId: 'semi-permanent', start, contact: { ...contact, phone: '06 55 55 55 55', email: 'v@exemple.demo' }, leadSource: 'voice', origin: 'voice' })
    expect(booked.ok && booked.value.attribution).toBe('voice')
    expect(booked.ok && booked.value.paymentProof).toBeUndefined()
    const r = await engine.execute({ type: 'VoiceCallCompleted', source: 'voice', eventId: 'call-1-end', call: { at: NOW.toISOString(), callerName: 'Nina Essai', phone: '06 55 55 55 55', durationSec: 60, trigger: 'missed', handledBy: 'novia', outcome: 'booked', summary: 'RDV', transcript: [], appointmentId: booked.ok ? booked.value.id : undefined } })
    expect(r.ok).toBe(true)
    expect(store.read().calls[0]).toMatchObject({ businessId: demoProfile.businessId, outcome: 'booked' })
  })
})
