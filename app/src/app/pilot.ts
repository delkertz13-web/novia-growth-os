/**
 * Composition NOVIA_MODE=pilot (P1 : local, sans aucune connexion).
 *
 * - profil de l'entreprise pilote, NON vérifié (rien n'est inventé, tout est bloquant) ;
 * - heure SYSTÈME, interprétée dans le fuseau du salon ;
 * - base NOVIA locale (en mémoire, persistée dans ce navigateur) en attendant l'API + PostgreSQL (P2) ;
 * - exécution SHADOW : NOVIA décide pour de vrai et n'envoie rien ;
 * - providers Mock uniquement : aucun SMS, aucun appel, aucun paiement, aucun réseau.
 *
 * N'importe RIEN de src/demo (vérifié par architecture.test.ts).
 */
import { createNovia } from '../domain/intents'
import { createEngine, createMemoryStore, emptyState, STATE_VERSION, type NoviaState } from '../engine'
import { SystemClock } from '../providers/clock'
import { createMockProviders } from '../providers/mock'
import { createPilotProfile } from '../pilot/profile'

export const mode = 'pilot' as const

const businessId = import.meta.env.VITE_NOVIA_BUSINESS_ID || 'pilot-001'
const timezone = import.meta.env.VITE_NOVIA_TIMEZONE || 'Europe/Paris'
const KEY = `novia-pilot-local-${businessId}`

export function createPilotNovia() {
  const profile = createPilotProfile(businessId, timezone)
  const store = createMemoryStore<NoviaState>(emptyState(businessId, profile.defaultSettings), {
    load() {
      try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
        const parsed = raw ? (JSON.parse(raw) as NoviaState) : undefined
        return parsed?.version === STATE_VERSION ? parsed : undefined
      } catch {
        return undefined
      }
    },
    save(state) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state))
      } catch {
        /* ignore */
      }
    },
  })
  const engine = createEngine({ store, profile, providers: createMockProviders(SystemClock), execution: 'shadow' })
  return createNovia(engine)
}

export const novia = createPilotNovia()
