/**
 * Providers MOCK (contrats V2). Purement TECHNIQUES : ils ne décident rien.
 * Rien n'est envoyé, appelé ni encaissé : chaque écriture est consignée en mémoire,
 * avec son `idempotencyKey` (rejouée, elle renvoie le même résultat sans second effet).
 *
 * L'orchestration (que faire après une absence, une annulation, une réservation…) vit
 * dans le moteur NOVIA (src/engine), plus ici.
 *
 * `faults` permet aux tests de simuler une panne (retentable ou non) d'un fournisseur.
 */
import type {
  CrmMirrorProvider,
  ExternalCalendarProvider,
  MessagingProvider,
  PaymentProvider,
  ProviderError,
  ProviderResult,
  SendMessageRequest,
  TechnicalProviders,
  VoiceProvider,
} from '../types'
import type { ClockProvider } from '../types'

export type Fault = Pick<ProviderError, 'code' | 'retryable'> & { message?: string }

/** Une écriture consignée par un Mock (journal technique, jamais transmis). */
export interface MockWrite {
  provider: string
  method: string
  idempotencyKey: string
  payload: unknown
}

export interface MockOptions {
  /** décide d'une panne pour une écriture donnée (tests) */
  faults?: (w: Omit<MockWrite, 'payload'>) => Fault | undefined
  /** `simulated` : démo ; `accepted` : simule un fournisseur qui accepte (tests du mode live) */
  messageStatus?: 'simulated' | 'accepted'
}

/** Journal + idempotence partagés par les Mocks d'une composition. */
export function createMockLedger(opts: MockOptions = {}) {
  const writes: MockWrite[] = []
  const results = new Map<string, ProviderResult<unknown>>()
  let n = 0
  async function write<T>(provider: string, method: string, idempotencyKey: string, payload: unknown, value: () => T): Promise<ProviderResult<T>> {
    const k = `${provider}:${method}:${idempotencyKey}`
    const done = results.get(k)
    if (done?.ok) return done as ProviderResult<T>
    const fault = opts.faults?.({ provider, method, idempotencyKey })
    if (fault) return { ok: false, error: { provider, code: fault.code, retryable: fault.retryable, message: fault.message ?? `${provider} : panne simulée (${fault.code}).` } }
    writes.push({ provider, method, idempotencyKey, payload })
    const res: ProviderResult<T> = { ok: true, value: value() }
    results.set(k, res)
    return res
  }
  return { writes, write, nextRef: (provider: string) => ({ provider, id: `${provider}-${++n}` }), messageStatus: opts.messageStatus ?? 'simulated' }
}
export type MockLedger = ReturnType<typeof createMockLedger>

export function createMockMessaging(ledger: MockLedger): MessagingProvider {
  const name = 'mock-sms'
  return {
    name,
    send: (req: SendMessageRequest) => ledger.write(name, 'send', req.idempotencyKey, req, () => ({ externalRef: ledger.nextRef(name), status: ledger.messageStatus })),
  }
}

export function createMockCrmMirror(ledger: MockLedger): CrmMirrorProvider {
  const name = 'mock-crm'
  return {
    name,
    upsertContact: (req) => ledger.write(name, 'upsertContact', req.idempotencyKey, req, () => ({ externalRef: { provider: name, id: `contact-${req.customer.id}` } })),
    setOptOut: (req) => ledger.write(name, 'setOptOut', req.idempotencyKey, req, () => undefined),
  }
}

export function createMockVoice(ledger: MockLedger): VoiceProvider {
  const name = 'mock-voice'
  return { name, configure: (req) => ledger.write(name, 'configure', req.idempotencyKey, req, () => undefined) }
}

export function createMockPayment(ledger: MockLedger): PaymentProvider {
  const name = 'mock-payment'
  return {
    name,
    createPaymentLink: (req) =>
      ledger.write(name, 'createPaymentLink', req.idempotencyKey, req, () => ({ url: `https://paiement.mock.invalid/${req.appointment.id}`, externalRef: ledger.nextRef(name) })),
  }
}

/** Agenda externe fictif : aucun créneau occupé hors NOVIA. */
export function createMockCalendar(): ExternalCalendarProvider {
  return { name: 'mock-calendar', listBusy: async () => ({ ok: true, value: [] }) }
}

/** Fournisseurs Mock complets pour une entreprise. */
export function createMockProviders(clock: ClockProvider, opts: MockOptions & { crm?: boolean } = {}): TechnicalProviders & { ledger: MockLedger } {
  const ledger = createMockLedger(opts)
  return {
    ledger,
    clock,
    messaging: createMockMessaging(ledger),
    crm: opts.crm ? createMockCrmMirror(ledger) : undefined,
    voice: createMockVoice(ledger),
    payment: createMockPayment(ledger),
    calendar: createMockCalendar(),
  }
}
