/**
 * Store local de la démonstration. Persistance navigateur (localStorage) uniquement,
 * avec remise à zéro. Aucune donnée ne quitte l'appareil.
 */
import { demoScenario } from '../../config/demo'
import { createDemoClock } from '../clock'
import { createSeed, STATE_VERSION, type DemoState } from './seed'

/** Horloge de la démonstration : l'heure réelle n'est jamais lue. */
export const demoClock = createDemoClock(demoScenario.referenceDate)
const seed = () => createSeed(demoClock.now())

const KEY = 'novia-demo-state'

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState
      // même version ET même date de référence, sinon on repart du scénario
      if (parsed.version === STATE_VERSION && parsed.seededAt === demoClock.now().toISOString()) return parsed
    }
  } catch {
    /* stockage indisponible : on repart du jeu de démonstration */
  }
  return seed()
}

let state: DemoState = typeof window === 'undefined' ? seed() : load()
const listeners = new Set<() => void>()

export const getState = () => state

export function setState(update: (s: DemoState) => DemoState) {
  state = update(state)
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function resetDemo() {
  setState(() => seed())
}

export function nextId(prefix: string) {
  let id = ''
  setState((s) => {
    id = `${prefix}${s.seq}`
    return { ...s, seq: s.seq + 1 }
  })
  return id
}
