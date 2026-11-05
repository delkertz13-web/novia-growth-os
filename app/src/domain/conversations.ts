/**
 * Conversations NOVIA ↔ clientes, et la collaboration avec la professionnelle.
 *
 * Trois états, déduits (jamais stockés) :
 *   - NOVIA gère              : NOVIA répond avec les réponses approuvées
 *   - Réponse humaine requise : question inconnue ou sujet sensible, NOVIA s'arrête
 *   - Reprise humaine         : la professionnelle a repris la main, NOVIA ne répond plus
 */
import { approvedAnswers, sensitiveKeywords, type ApprovedAnswer } from '../config/novia.demo'
import type { Conversation, ConversationMessage, Customer } from '../core/types'
import type { NoviaSnapshot } from '../providers/types'

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

/** minuscules, sans accents ni apostrophes typographiques */
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')

export type Triage =
  | { kind: 'faq'; answer: ApprovedAnswer }
  | { kind: 'sensitive'; reason: string }
  | { kind: 'unknown'; reason: string }

/**
 * Décide si NOVIA peut répondre seule. Le sensible passe TOUJOURS avant la FAQ :
 * « quel prix pour une réaction allergique ? » va à la professionnelle.
 */
export function triage(text: string, answers: ApprovedAnswer[] = approvedAnswers): Triage {
  const t = normalize(text)
  if (sensitiveKeywords.some((k) => t.includes(k))) return { kind: 'sensitive', reason: 'Sujet sensible : NOVIA ne répond pas seule.' }
  const answer = answers.find((a) => a.keywords.some((k) => t.includes(k)))
  if (answer) return { kind: 'faq', answer }
  return { kind: 'unknown', reason: 'Question sans réponse approuvée.' }
}

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
