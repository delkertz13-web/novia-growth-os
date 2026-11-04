/**
 * Socle de mouvement V2. Règles :
 * - uniquement transform / opacity / filter ;
 * - aucune animation en boucle, tout part d'une action ou d'un changement d'état ;
 * - prefers-reduced-motion : plans figés, transitions réduites à des fondus ou supprimées.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { flushSync } from 'react-dom'

/** Durées (ms), alignées sur les variables CSS --dur-1 … --dur-4. */
export const durations = { tap: 120, base: 240, move: 420, scene: 700 } as const

/* ---------------- Mouvement réduit ---------------- */

const REDUCE = '(prefers-reduced-motion: reduce)'
const subscribeReduce = (cb: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia(REDUCE)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCE).matches

export const useReducedMotion = () => useSyncExternalStore(subscribeReduce, prefersReducedMotion, () => false)

/* ---------------- Transitions d'état (View Transitions API) ---------------- */

/**
 * Applique un changement d'état React dans une transition de vue quand le navigateur
 * la prend en charge (Safari 18+), sinon directement. Pour les navigations, utiliser
 * l'option `viewTransition` de React Router (Link, NavLink, navigate).
 */
export function withViewTransition(update: () => void) {
  const doc = typeof document !== 'undefined' ? (document as Document & { startViewTransition?: (cb: () => void) => unknown }) : undefined
  if (!doc?.startViewTransition || prefersReducedMotion()) {
    update()
    return
  }
  doc.startViewTransition(() => flushSync(update))
}

/* ---------------- Progression au scroll ---------------- */

/**
 * Écrit la progression de l'élément dans la variable CSS `--p` (0 → 1) pendant
 * qu'il traverse l'écran : 0 quand son haut atteint le haut de l'écran, 1 quand il
 * a défilé de toute sa hauteur. Écouteur passif, une écriture par image, aucune
 * lecture de mise en page hors de requestAnimationFrame, arrêt hors écran.
 * En mouvement réduit, `--p` reste à 0.
 */
export function useScrollProgress<T extends HTMLElement>(ref: RefObject<T | null>) {
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--p', '0')
    if (reduce) return
    let frame = 0
    let visible = true
    const write = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)))
      el.style.setProperty('--p', p.toFixed(4))
    }
    const onScroll = () => {
      if (visible && !frame) frame = requestAnimationFrame(write)
    }
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => (visible = e.isIntersecting)) : undefined
    io?.observe(el)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    write()
    return () => {
      io?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ref, reduce])
}

/* ---------------- Apparition à l'entrée dans l'écran ---------------- */

/** Vrai dès que l'élément entre dans l'écran (une seule fois). */
export function useInView<T extends HTMLElement>(ref: RefObject<T | null>, rootMargin = '0px 0px -10% 0px') {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (!('IntersectionObserver' in window)) {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin, seen])
  return seen
}

/* ---------------- Valeur qui défile ---------------- */

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Fait défiler un nombre de sa valeur précédente vers la nouvelle (600 ms).
 * Au premier rendu, la valeur est affichée directement sauf si `fromZero`.
 */
export function useCountUp(target: number, { duration = 600, fromZero = false } = {}) {
  const reduce = useReducedMotion()
  const [value, setValue] = useState(fromZero && !reduce ? 0 : target)
  const current = useRef(value)
  useEffect(() => {
    const from = current.current
    if (reduce || from === target) {
      current.current = target
      setValue(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      const v = from + (target - from) * easeOut(t)
      current.current = t === 1 ? target : v
      setValue(current.current)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduce])
  return value
}
