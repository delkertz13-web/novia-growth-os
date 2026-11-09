import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { galleryCategories, lengthLabels, shapeLabels } from '../../config/vertical'
import type { GalleryItem } from '../../config/schema'
import { serviceById } from '../../domain'
import { resolveMedia } from '../../media/media'
import { Icon } from '../../ui/Icon'
import { fmt, Photo } from '../../ui/common'
import { prefersReducedMotion } from '../../ui/motion'
import { bookingHref, serviceIdForPose } from './model'

/** Nom de transition partagé : vignette de galerie → visionneuse → réservation. */
export const POSE_VT = 'pose'

const pad = (n: number) => String(n).padStart(2, '0')

interface Props {
  items: readonly GalleryItem[]
  initialId: string
  /** pose affichée après un balayage ou une flèche */
  onIndexChange: (id: string) => void
  onClose: (id: string) => void
}

/**
 * Visionneuse plein écran : les poses défilent horizontalement (scroll-snap natif,
 * donc geste iOS natif), la fiche de la pose suit, et « Je veux cette pose » reste
 * accessible en bas. Le bandeau DÉMO reste visible au-dessus.
 */
export function PoseViewer({ items, initialId, onIndexChange, onClose }: Props) {
  const start = Math.max(0, items.findIndex((g) => g.id === initialId))
  const [index, setIndex] = useState(start)
  const indexRef = useRef(start)
  const trackRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const frame = useRef(0)
  const pose = items[index] ?? items[0]
  const service = serviceById(serviceIdForPose(pose))
  const fictional = resolveMedia(pose.id)?.provenance === 'fictif'
  const category = galleryCategories.find((c) => c.id === pose.category)?.label

  // Position initiale avant la première peinture (et avant la capture de la transition).
  useLayoutEffect(() => {
    const t = trackRef.current
    if (t) t.scrollLeft = start * t.clientWidth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Page figée dessous, focus dans la visionneuse.
  useLayoutEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const go = (i: number) => {
    const t = trackRef.current
    if (!t) return
    const j = Math.max(0, Math.min(items.length - 1, i))
    t.scrollTo({ left: j * t.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  const onScroll = () => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const t = trackRef.current
      if (!t) return
      const i = Math.max(0, Math.min(items.length - 1, Math.round(t.scrollLeft / Math.max(1, t.clientWidth))))
      if (i !== indexRef.current) {
        indexRef.current = i
        setIndex(i)
        onIndexChange(items[i].id)
      }
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(items[indexRef.current].id)
      else if (e.key === 'ArrowRight') go(indexRef.current + 1)
      else if (e.key === 'ArrowLeft') go(indexRef.current - 1)
    }
    // Rotation / redimensionnement : rester sur la même pose.
    const onResize = () => {
      const t = trackRef.current
      if (t) t.scrollLeft = indexRef.current * t.clientWidth
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, onClose])

  return (
    <div className="pv scene" role="dialog" aria-modal="true" aria-label={`Réalisation : ${pose.title}`}>
      <div className="pv__scroll">
        <div className="pv__stage">
          <div className="pv__track" ref={trackRef} onScroll={onScroll} aria-roledescription="carrousel" aria-label="Réalisations">
            {items.map((g, i) => (
              <div
                key={g.id}
                className="pv__slide"
                role="group"
                aria-roledescription="diapositive"
                aria-label={`${i + 1} sur ${items.length}`}
                aria-hidden={i !== index || undefined}
              >
                <div className="pv__media" style={i === index ? ({ viewTransitionName: POSE_VT } as CSSProperties) : undefined}>
                  <Photo item={g} eager={Math.abs(i - index) <= 1} sizes="(min-width: 720px) 560px, 100vw" provenanceBadge />
                </div>
              </div>
            ))}
          </div>

          <div className="pv__bar">
            <span className="pv__count" aria-live="polite">
              {pad(index + 1)} <i>/ {pad(items.length)}</i>
            </span>
            <button ref={closeRef} type="button" className="pv__btn glass" onClick={() => onClose(pose.id)} aria-label="Fermer la réalisation">
              <Icon name="x" size={18} />
            </button>
          </div>
          {index > 0 && (
            <button type="button" className="pv__nav pv__nav--prev glass" onClick={() => go(index - 1)} aria-label="Réalisation précédente">
              <Icon name="arrowLeft" size={18} />
            </button>
          )}
          {index < items.length - 1 && (
            <button type="button" className="pv__nav pv__nav--next glass" onClick={() => go(index + 1)} aria-label="Réalisation suivante">
              <Icon name="arrowRight" size={18} />
            </button>
          )}
          <div className="pv__dots" aria-hidden="true">
            {items.map((g, i) => (
              <i key={g.id} className={i === index ? 'is-on' : undefined} />
            ))}
          </div>
        </div>

        <article className="pv__sheet" key={pose.id}>
          <div className="eyebrow">
            {category} · {shapeLabels[pose.shape]} · {lengthLabels[pose.length]}
          </div>
          <h2 className="display pv__title">{pose.title}</h2>
          <p className="pv__desc">{pose.alt}.</p>
          {service && (
            <div className="pv__service">
              <span className="pv__service-label">Prestation correspondante</span>
              <span className="pv__service-name">{service.name}</span>
              <span className="pv__service-meta">
                {fmt.duration(service.durationMin)} · {fmt.eur(service.price)}
              </span>
            </div>
          )}
          {fictional && <p className="pv__prov">Visuel fictif créé pour la démonstration : une inspiration, pas une réalisation du salon.</p>}
        </article>
      </div>

      <div className="pv__cta">
        <Link to={bookingHref(pose)} viewTransition className="btn btn--lacquer btn--block pv__want">
          Je veux cette pose <Icon name="arrowRight" size={18} />
        </Link>
      </div>
    </div>
  )
}
