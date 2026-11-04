import { useEffect, type RefObject } from 'react'
import { useReducedMotion } from '../../ui/motion'

/**
 * Profondeur au scroll : pour chaque élément `[data-depth]` visible, écrit
 *   --d : position du centre de l'élément par rapport au centre de l'écran (-1 haut … 0 centre … 1 bas)
 *   --a : valeur absolue de --d (le CSS de Safari ne connaît pas encore abs()).
 * Seuls les éléments à l'écran sont mesurés (IntersectionObserver), une fois par image,
 * toutes les lectures avant toutes les écritures. En mouvement réduit, tout reste à 0.
 */
export function useDepth(ref: RefObject<HTMLElement | null>, key: string) {
  const reduce = useReducedMotion()
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-depth]'))
    for (const el of els) {
      el.style.setProperty('--d', '0')
      el.style.setProperty('--a', '0')
    }
    if (reduce || !('IntersectionObserver' in window)) return

    const visible = new Set<HTMLElement>()
    let frame = 0
    const write = () => {
      frame = 0
      const vh = window.innerHeight
      const measures = Array.from(visible, (el) => {
        const r = el.getBoundingClientRect()
        const d = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2)
        return [el, Math.max(-1, Math.min(1, d))] as const
      })
      for (const [el, d] of measures) {
        el.style.setProperty('--d', d.toFixed(3))
        el.style.setProperty('--a', Math.abs(d).toFixed(3))
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(write)
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target as HTMLElement)
        else visible.delete(e.target as HTMLElement)
      }
      schedule()
    })
    for (const el of els) io.observe(el)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ref, key, reduce])
}
