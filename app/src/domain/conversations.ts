/**
 * Conversations NOVIA ↔ clientes, et la collaboration avec la professionnelle.
 *
 * Trois états, déduits (jamais stockés) :
 *   - NOVIA gère              : NOVIA répond avec les réponses approuvées
 *   - Réponse humaine requise : question inconnue ou sujet sensible, NOVIA s'arrête
 *   - Reprise humaine         : la professionnelle a repris la main, NOVIA ne répond plus
 */
import type { Conversation, ConversationMessage, Customer } from '../core/types'
import type { NoviaSnapshot } from '../engine/model'

export type ConversationState = 'novia' | 'needs_human' | 'human'

export const conversationStateLabels: Record<ConversationState, string> = {
  novia: 'NOVIA gère',
  needs_human: 'Réponse humaine nécessaire',
  human: 'Reprise humaine',
}

export const channelLabels: Record<Conversation['channel'], string> = { sms: 'SMS', instagram: 'Instagram', site: 'Site' }

export function conversationState(conv: Pick<Conversation, 'needsHuman'>, customer?: Pick<Customer, 'humanTakeover'>): ConversationState {
  if (customer?.humanTakeover) return 'human'
  return conv.needsHuman ? 'needs_human' : 'novia'
}

export { normalize, triage, type Triage } from '../core/triage'

export interface InboxItem {
  conversation: Conversation
  customer?: Customer
  state: ConversationState
  last?: ConversationMessage
}

const order: Record<ConversationState, number> = { needs_human: 0, human: 1, novia: 2 }

/** Boîte de réception : ce qui attend la professionnelle d'abord, puis le plus récent. */
export function buildInbox(snap: Pick<NoviaSnapshot, 'conversations' | 'customers'>): InboxItem[] {
  return snap.conversations
    .map((conversation): InboxItem => {
      const customer = snap.customers.find((c) => c.id === conversation.customerId)
      return { conversation, customer, state: conversationState(conversation, customer), last: conversation.messages.at(-1) }
    })
    .sort((a, b) => order[a.state] - order[b.state] || (b.last?.at ?? '').localeCompare(a.last?.at ?? ''))
}

export const needsHumanCount = (snap: Pick<NoviaSnapshot, 'conversations' | 'customers'>) =>
  buildInbox(snap).filter((i) => i.state === 'needs_human').length
