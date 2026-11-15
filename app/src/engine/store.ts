/**
 * Port de stockage NOVIA : la base de NOVIA, qui fait autorité (clientes, RDV,
 * consentement, séquences, réglages…). Ce n'est PAS un provider : aucun fournisseur
 * externe n'en est la source.
 *
 * P1 : implémentation en mémoire (démo : persistée dans le navigateur). P2 : PostgreSQL
 * derrière l'API NOVIA ; `transact` y devient une transaction SQL, `businessId` une
 * contrainte imposée par la base (test d'isolation).
 */
import type { BusinessId } from '../core/types'
import type { NoviaState } from './model'

export interface NoviaStore<S extends NoviaState = NoviaState> {
  readonly businessId: BusinessId
  /** lecture du modèle courant (le cockpit lit cet instantané) */
  read(): S
  /** unité de travail atomique : tout ou rien */
  transact<T>(work: (state: S) => { state: S; value: T }): Promise<T>
  subscribe(listener: () => void): () => void
}

export interface Persistence<S> {
  load(): S | undefined
  save(state: S): void
}

/** Store en mémoire. `replace` sert à la réinitialisation de la démo et aux tests. */
export function createMemoryStore<S extends NoviaState>(initial: S, persistence?: Persistence<S>) {
  let state: S = persistence?.load() ?? initial
  if (state.businessId !== initial.businessId) state = initial
  const listeners = new Set<() => void>()
  const commit = (next: S) => {
    if (next.businessId !== state.businessId) throw new Error('Isolation : un état ne change jamais d’entreprise.')
    state = next
    persistence?.save(state)
    listeners.forEach((l) => l())
  }
  const store: NoviaStore<S> & { replace(next: S): void } = {
    businessId: initial.businessId,
    read: () => state,
    async transact(work) {
      const { state: next, value } = work(state)
      if (next !== state) commit(next)
      return value
    },
    subscribe(l) {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    replace: commit,
  }
  return store
}
export type MemoryStore<S extends NoviaState> = ReturnType<typeof createMemoryStore<S>>
