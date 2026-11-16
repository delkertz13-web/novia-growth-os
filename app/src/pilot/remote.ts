/**
 * Moteur DISTANT du pilote : le serveur NOVIA fait autorité.
 *
 * - une écriture est envoyée à l'API (`/commands`) : le serveur décide (moteur + PostgreSQL)
 *   et renvoie le résultat ; le navigateur recharge alors l'état du serveur ;
 * - le navigateur ne garde qu'une COPIE en mémoire (cache d'affichage), jamais écrite dans
 *   le stockage local : fermer l'onglet ne perd rien, un autre appareil voit la même chose ;
 * - un autre appareil a modifié quelque chose : la révision change, l'état est relu
 *   (interrogation régulière et au retour sur l'onglet).
 *
 * Même interface que le moteur local : les écrans ne savent pas où les décisions sont prises.
 */
import { timeZoneOf, type BusinessProfile } from '../config/profile'
import { createMemoryStore, type Engine, type EngineResult, type NoviaState } from '../engine'
import type { Draft } from '../engine/engine'
import { SystemClock } from '../providers/clock'

export interface PilotSnapshot {
  state: NoviaState
  profile: BusinessProfile
  revision: number
}

/** Accès au serveur (remplaçable en test). */
export interface PilotTransport {
  state(): Promise<PilotSnapshot>
  revision(): Promise<number>
  command(draft: Draft): Promise<{ result: EngineResult; revision: number }>
}

/** Champs d'enveloppe : posés par le SERVEUR (source, identifiant, date, entreprise), jamais par le navigateur. */
const ENVELOPE = ['source', 'eventId', 'occurredAt', 'businessId', 'version', 'externalRefs', 'provenance'] as const

export function toCommand(draft: Draft): Draft {
  const out = { ...draft } as Record<string, unknown>
  for (const k of ENVELOPE) delete out[k]
  return out as Draft
}

export function createRemoteEngine(initial: PilotSnapshot, transport: PilotTransport, clock: { now(): Date } = SystemClock) {
  const store = createMemoryStore<NoviaState>(initial.state) // aucune persistance locale
  const profile = initial.profile
  let revision = initial.revision
  let syncing: Promise<void> | undefined

  /** Relit l'état du serveur (une seule lecture à la fois). */
  function refresh(): Promise<void> {
    syncing ??= transport
      .state()
      .then((s) => {
        revision = s.revision
        store.replace(s.state)
      })
      .finally(() => (syncing = undefined))
    return syncing
  }

  /** Révision du serveur différente : un autre appareil (ou l'ordonnanceur) a écrit. */
  async function sync() {
    const r = await transport.revision()
    if (r !== revision) await refresh()
    return r
  }

  async function execute<T = unknown>(draft: Draft): Promise<EngineResult<T>> {
    let response: { result: EngineResult; revision: number }
    try {
      response = await transport.command(toCommand(draft))
    } catch (e) {
      // réponse perdue : le serveur a peut-être enregistré ; on relit avant toute nouvelle action
      void refresh().catch(() => undefined)
      return { ok: false, error: e instanceof Error ? e.message : 'Serveur NOVIA injoignable.', code: 'internal' }
    }
    if (response.revision !== revision) await refresh().catch(() => undefined)
    return response.result as EngineResult<T>
  }

  const engine: Engine = {
    execute,
    // l'envoi et l'ordonnancement sont faits par le SERVEUR (shadow), jamais par le navigateur
    flush: async () => undefined,
    tick: async () => 0,
    store,
    profile,
    execution: 'shadow',
    timeZone: timeZoneOf(profile),
    clockMode: 'system',
    now: () => clock.now(),
  }
  return { engine, refresh, sync, revision: () => revision }
}
