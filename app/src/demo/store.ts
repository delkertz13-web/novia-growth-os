/**
 * Stockage de la DÉMONSTRATION : l'état NOVIA de l'entreprise fictive, en mémoire et
 * persisté dans le navigateur (localStorage), avec remise à zéro. Aucune donnée ne
 * quitte l'appareil.
 */
import { createFixedClock } from '../providers/clock'
import { createMemoryStore, type Persistence } from '../engine/store'
import { parseWall } from '../core/time'
import { business } from './config/business'
import { demoScenario } from './config/scenario'
import { createSeed, STATE_VERSION, type DemoState } from './seed'

/** Horloge de la démonstration : l'heure réelle n'est jamais lue. Heure murale du salon. */
export const demoClock = createFixedClock(parseWall(demoScenario.referenceDate, business.timezone.value))
export const demoSeed = () => createSeed(demoClock.now())

const KEY = 'novia-demo-state'

const browser: Persistence<DemoState> = {
  load() {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return undefined
      const parsed = JSON.parse(raw) as DemoState
      // même version ET même date de référence, sinon on repart du scénario
      if (parsed.version === STATE_VERSION && parsed.seededAt === demoClock.now().toISOString()) return parsed
    } catch {
      /* stockage indisponible : on repart du jeu de démonstration */
    }
    return undefined
  },
  save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  },
}

export const demoStore = createMemoryStore<DemoState>(demoSeed(), typeof window === 'undefined' ? undefined : browser)

export const resetDemo = () => demoStore.replace(demoSeed())
