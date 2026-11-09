/**
 * Exécution des envois décidés par le moteur (file `outbox`).
 *
 * - simulated : le provider Mock consigne, rien n'est transmis (démonstration) ;
 * - shadow    : AUCUN appel provider ; l'envoi est marqué « aurait été envoyé » ;
 * - live      : appel du provider ; un échec retentable est retenté (5 essais max),
 *               un échec définitif est marqué et journalisé.
 *
 * Une panne de fournisseur ne remonte jamais comme exception : la décision métier est
 * déjà enregistrée, seul l'envoi est en attente ou en échec.
 */
import { renderTemplate } from '../config/profile'
import { mayInitiateOutbound } from '../core/optout'
import type { ConversationMessage } from '../core/types'
import type { ProviderError, ProviderResult, TechnicalProviders } from '../providers/types'
import { LIMITS, type ExecutionMode, type JournalEntry, type NoviaState, type OutboxEntry } from './model'
import type { BusinessProfile } from '../config/profile'

export const MAX_ATTEMPTS = 5

type Outcome =
  | { kind: 'done'; status: 'simulated' | 'sent'; externalRef?: { provider: string; id: string } }
  | { kind: 'shadow' }
  | { kind: 'error'; error: ProviderError }

/** Toute exception imprévue d'un provider devient une erreur typée retentable. */
async function call<T>(provider: string, fn: () => Promise<ProviderResult<T>>): Promise<ProviderResult<T>> {
  try {
    return await fn()
  } catch (e) {
    return { ok: false, error: { provider, code: 'unexpected', retryable: true, message: e instanceof Error ? e.message : 'Erreur inattendue' } }
  }
}

const missing = (provider: string): ProviderError => ({ provider, code: 'not_connected', retryable: false, message: `${provider} : aucun fournisseur branché.` })

async function deliver(entry: OutboxEntry, s: NoviaState, p: TechnicalProviders, profile: BusinessProfile): Promise<ProviderResult<{ status: 'simulated' | 'sent'; externalRef?: { provider: string; id: string } }>> {
  const base = { businessId: entry.businessId, idempotencyKey: entry.key }
  switch (entry.kind) {
    case 'message':
    case 'conversation_reply': {
      let customerId: string | undefined
      let body = ''
      let purpose: 'transactional' | 'marketing' | 'conversation' = 'conversation'
      if (entry.kind === 'message') {
        const m = s.messages.find((x) => x.id === entry.ref)
        customerId = m?.customerId
        body = m?.body ?? ''
        purpose = m && /^W0[34]/.test(m.purpose) ? 'marketing' : 'transactional'
      } else {
        const conv = s.conversations.find((c) => c.messages.some((m) => m.id === entry.ref))
        customerId = conv?.customerId
        body = conv?.messages.find((m) => m.id === entry.ref)?.body ?? ''
      }
      const c = s.customers.find((x) => x.id === customerId)
      if (!c) return { ok: false, error: { provider: p.messaging.name, code: 'invalid_request', retryable: false, message: 'Destinataire introuvable.' } }
      const r = await call(p.messaging.name, () => p.messaging.send({ ...base, to: { customerId: c.id, phone: c.phone, name: `${c.firstName} ${c.lastName}` }, channel: 'sms', body, purpose }))
      return r.ok ? { ok: true, value: { status: r.value.status === 'simulated' ? 'simulated' : 'sent', externalRef: r.value.externalRef } } : r
    }
    case 'crm.upsert':
    case 'crm.optout': {
      if (!p.crm) return { ok: false, error: missing('crm') }
      const crm = p.crm
      const c = s.customers.find((x) => x.id === entry.ref)
      if (!c) return { ok: false, error: { provider: crm.name, code: 'invalid_request', retryable: false, message: 'Cliente introuvable.' } }
      const r =
        entry.kind === 'crm.upsert'
          ? await call(crm.name, () => crm.upsertContact({ ...base, customer: c, marketingConsent: mayInitiateOutbound({ ...c, humanTakeover: false }), source: c.source }))
          : await call(crm.name, () => crm.setOptOut({ ...base, customerId: c.id, externalRef: c.externalRefs?.find((x) => x.provider === crm.name), optOut: c.optOut }))
      return r.ok ? { ok: true, value: { status: 'sent', externalRef: r.value && 'externalRef' in r.value ? r.value.externalRef : undefined } } : r
    }
    case 'voice.configure': {
      if (!p.voice) return { ok: false, error: missing('voice') }
      const voice = p.voice
      const greeting = renderTemplate(profile.voice.value.greeting, { business: profile.identity.name.value, artist: profile.identity.artistFirstName.value })
      const r = await call(voice.name, () => voice.configure({ ...base, settings: s.voice, greeting }))
      return r.ok ? { ok: true, value: { status: 'sent' } } : r
    }
  }
}

/** Reporte le résultat d'un envoi sur la file, le message et le journal. */
function apply(s: NoviaState, entry: OutboxEntry, outcome: Outcome, at: string): NoviaState {
  const attempts = entry.attempts + (outcome.kind === 'shadow' ? 0 : 1)
  let status: OutboxEntry['status']
  let delivery: NonNullable<ConversationMessage['delivery']>
  const journal: JournalEntry[] = []
  if (outcome.kind === 'shadow') {
    status = 'shadow'
    delivery = 'shadow'
    journal.push({ at, kind: 'would_send', label: `Mode shadow : NOVIA aurait exécuté « ${entry.kind} » (${entry.key}).` })
  } else if (outcome.kind === 'done') {
    status = 'done'
    delivery = outcome.status
  } else if (outcome.error.retryable && attempts < MAX_ATTEMPTS) {
    status = 'retrying'
    delivery = 'retrying'
    journal.push({ at, kind: 'delivery', label: `Échec temporaire (${outcome.error.code}), nouvel essai prévu : ${outcome.error.message}` })
  } else {
    status = 'failed'
    delivery = 'failed'
    journal.push({ at, kind: 'delivery', label: `Échec définitif (${outcome.error.code}) : ${outcome.error.message}` })
  }
  const externalRef = outcome.kind === 'done' ? outcome.externalRef : undefined
  const lastError = outcome.kind === 'error' ? { code: outcome.error.code, message: outcome.error.message, retryable: outcome.error.retryable } : undefined
  return {
    ...s,
    outbox: s.outbox.map((o) => (o.key === entry.key ? { ...o, status, attempts, ...(lastError ? { lastError } : {}), ...(externalRef ? { externalRef } : {}) } : o)),
    messages: entry.kind === 'message' ? s.messages.map((m) => (m.id === entry.ref ? { ...m, status: delivery, ...(externalRef ? { externalRef } : {}) } : m)) : s.messages,
    conversations:
      entry.kind === 'conversation_reply'
        ? s.conversations.map((c) => (c.messages.some((m) => m.id === entry.ref) ? { ...c, messages: c.messages.map((m) => (m.id === entry.ref ? { ...m, delivery } : m)) } : c))
        : s.conversations,
    customers:
      entry.kind === 'crm.upsert' && externalRef
        ? s.customers.map((c) => (c.id === entry.ref ? { ...c, externalRefs: [...(c.externalRefs ?? []).filter((r) => r.provider !== externalRef.provider), externalRef] } : c))
        : s.customers,
    journal: [...journal, ...s.journal].slice(0, LIMITS.journal),
  }
}

export type Delivery = [OutboxEntry, Outcome]

/** Exécute les envois en attente (appels provider, hors transaction). */
export async function runDeliveries(state: NoviaState, providers: TechnicalProviders, profile: BusinessProfile, execution: ExecutionMode): Promise<Delivery[]> {
  const pending = state.outbox.filter((o) => o.status === 'pending' || o.status === 'retrying').reverse()
  const done: Delivery[] = []
  for (const entry of pending) {
    if (execution === 'shadow') {
      done.push([entry, { kind: 'shadow' }])
      continue
    }
    const r = await deliver(entry, state, providers, profile)
    done.push([entry, r.ok ? { kind: 'done', ...r.value } : { kind: 'error', error: r.error }])
  }
  return done
}

/** Reporte les résultats sur l'état COURANT (relu dans la transaction). */
export const applyDeliveries = (state: NoviaState, deliveries: Delivery[], at: string) =>
  deliveries.reduce((s, [entry, outcome]) => {
    const current = s.outbox.find((o) => o.key === entry.key)
    return current && (current.status === 'pending' || current.status === 'retrying') ? apply(s, current, outcome, at) : s
  }, state)
