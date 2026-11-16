/**
 * Données personnelles d'une cliente : EXPORT (droit d'accès / portabilité) et
 * ANONYMISATION (droit à l'effacement). Fonctions pures sur l'état NOVIA, d'une seule
 * entreprise : la persistance (et la purge des tables hors de l'état chargé) est faite
 * par le serveur, dans la transaction de cette entreprise.
 *
 * Effacé : nom, téléphone, e-mail, références externes, contenu des messages et des
 * appels, liste d'attente. Conservé (minimum légal et comptable) : les RDV et leur
 * montant (sans identité), les preuves de paiement déclarées, le REGISTRE DE
 * CONSENTEMENT (preuve d'une opposition ou d'un accord, sans coordonnées), le journal
 * d'audit (identifiants techniques, sans contenu).
 */
import type { NoviaState } from './model'
import type { Customer } from '../core/types'

export const ERASED = '[contenu supprimé]'

export interface CustomerExport {
  exportedAt: string
  businessId: string
  customer: Omit<Customer, 'consents'>
  consents: Customer['consents']
  appointments: NoviaState['appointments']
  conversations: NoviaState['conversations']
  automaticMessages: NoviaState['messages']
  sequences: NoviaState['runs']
  calls: NoviaState['calls']
}

export function exportCustomer(state: NoviaState, customerId: string, at: Date): CustomerExport | undefined {
  const c = state.customers.find((x) => x.id === customerId)
  if (!c) return undefined
  const { consents, ...customer } = c
  return {
    exportedAt: at.toISOString(),
    businessId: state.businessId,
    customer,
    consents,
    appointments: state.appointments.filter((a) => a.customerId === customerId),
    conversations: state.conversations.filter((x) => x.customerId === customerId),
    automaticMessages: state.messages.filter((m) => m.customerId === customerId),
    sequences: state.runs.filter((r) => r.customerId === customerId),
    calls: state.calls.filter((x) => x.customerId === customerId),
  }
}

export function anonymizeCustomer(state: NoviaState, customerId: string, at: Date): NoviaState {
  const c = state.customers.find((x) => x.id === customerId)
  if (!c) throw new Error('Cliente introuvable')
  if (c.anonymizedAt) return state
  const iso = at.toISOString()
  return {
    ...state,
    customers: state.customers.map((x) =>
      x.id !== customerId
        ? x
        : {
            ...x,
            firstName: 'Cliente',
            lastName: 'anonymisée',
            phone: '',
            email: '',
            externalRefs: [],
            referrerId: undefined,
            humanTakeover: false,
            anonymizedAt: iso,
            // l'opposition reste prouvée, la preuve textuelle (qui peut citer un message) est effacée
            consents: x.consents.map((k) => (k.proofRef ? { ...k, proofRef: ERASED } : k)),
          },
    ),
    // plus personne à contacter : les séquences s'arrêtent
    runs: state.runs.map((r) =>
      r.customerId === customerId && (r.state === 'active' || r.state === 'paused')
        ? { ...r, state: 'stopped', step: 'done', endedAt: iso, outcome: 'stopped', actions: [...r.actions, { at: iso, kind: 'stop', label: 'Données de la cliente effacées : NOVIA s’arrête.' }] }
        : r,
    ),
    conversations: state.conversations.map((x) => (x.customerId === customerId ? { ...x, messages: x.messages.map((m) => ({ ...m, body: ERASED })), needsHumanReason: undefined } : x)),
    messages: state.messages.map((m) => (m.customerId === customerId ? { ...m, to: 'Cliente anonymisée', body: ERASED } : m)),
    calls: state.calls.map((x) => (x.customerId === customerId ? { ...x, callerName: 'Cliente anonymisée', phone: '', summary: ERASED, transcript: [] } : x)),
    waitlist: state.waitlist.filter((w) => w.customerId !== customerId),
  }
}
