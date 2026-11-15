import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { business, novia, services } from '../domain'
import { heroSlots, mediaUrl, resolveMedia } from '../media/media'
import type { MediaAsset } from '../media/types'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, Photo, salon } from '../ui/common'
import { prefersReducedMotion } from '../ui/motion'
import { ClientHeader } from './ClientLayout'

/** Premier créneau libre sur 14 jours, pour la prestation active la plus courte. */
function nextFreeSlot(): Date | undefined {
  const active = services.filter((s) => s.active)
  if (!active.length) return undefined
  const shortest = active.reduce((a, b) => (b.durationMin < a.durationMin ? b : a))
  const day = salon.startOfDay(novia.now())
  for (let i = 0; i < 14; i++) {
    const d = salon.addDays(day, i)
    const slot = novia.client.availableSlots(d, shortest.id)[0]
    if (slot) return slot
  }
  return undefined
}

/** Copie basse résolution, floutée une fois pour toutes par le navigateur (aucun flou recalculé au scroll). */
function BlurPlate({ asset }: { asset: MediaAsset }) {
  const w = asset.widths[0]
  return (
    <picture>
      <source type="image/avif" srcSet={mediaUrl(asset, w, 'avif')} />
      <source type="image/webp" srcSet={mediaUrl(asset, w, 'webp')} />
      <img src={mediaUrl(asset, w, asset.fallback)} alt="" decoding="async" />
    </picture>
  )
}

/**
 * Hero V2 — scène en plans :
 *   0 · photo (nette) + copie floutée qui apparaît au scroll (mise au point qui recule)
 *   1 · main détourée, qui avance un peu plus vite que le décor
 *   2 · voiles de lisibilité
 *   3 · texte et carte « Prochain créneau » flottante
 * La scène reste en place (sticky) et la suite de la page glisse par-dessus.
 * Le scroll n'écrit qu'une variable CSS `--p` (0 → 1), une fois par image.
 */
export function Hero({ onPassed }: { onPassed?: (passed: boolean) => void }) {
  const ref = useRef<HTMLElement>(null)
  const photo = resolveMedia([heroSlots.photo, 'g-pose-01'])
  // Le détourage n'a de sens que superposé à sa propre photo d'origine.
  const cutout = photo?.id === heroSlots.photo ? resolveMedia(heroSlots.cutout) : undefined
  const slot = useMemo(nextFreeSlot, [])
  const [entering, setEntering] = useState(true)
  const passedRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 1800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const write = () => {
      frame = 0
      const h = Math.max(1, el.offsetHeight)
      const raw = Math.min(1, Math.max(0, window.scrollY / h))
      el.style.setProperty('--p', prefersReducedMotion() ? '0' : raw.toFixed(4))
      // Scène entièrement recouverte : on arrête de la peindre.
      if (raw >= 1) el.setAttribute('data-covered', '')
      else el.removeAttribute('data-covered')
      const passed = raw > 0.55
      if (passed !== passedRef.current) {
        passedRef.current = passed
        onPassed?.(passed)
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(write)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    write()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [onPassed])

  return (
    <section
      ref={ref}
      className={`hero2 ${cutout ? 'has-cutout' : ''} ${entering ? 'is-entering' : ''}`}
      style={photo ? ({ '--hero-ratio': (photo.height / photo.width).toFixed(4) } as CSSProperties) : undefined}
      aria-label="Accueil"
    >
      <div className="hero2__stage" aria-hidden={photo ? undefined : true}>
        <div className="hero2__layer hero2__bg">
          <Photo
            media={[heroSlots.photo, 'g-pose-01']}
            alt="Pose d’ongles amande nude rosé, filets et feuille d’or, en gros plan"
            priority
            sizes="100vw"
            placeholderLabel="Visuel à fournir · photo d’accueil (media-source/hero/hero.jpg)"
          />
        </div>
        {photo && (
          <div className="hero2__layer hero2__blur" aria-hidden="true">
            <BlurPlate asset={photo} />
          </div>
        )}
        {cutout && (
          <div className="hero2__layer hero2__subject" aria-hidden="true">
            <Photo media={heroSlots.cutout} alt="" eager sizes="100vw" />
          </div>
        )}
        <div className="hero2__shade" />
      </div>

      <div className="hero2__front">
        <ClientHeader overlay />
        <div className="wrap hero2__content">
          <h1 className="display hero2__title">
            <span className="hero2__line">
              <span>L’art de l’ongle,</span>
            </span>
            <span className="hero2__line">
              <em>au millimètre.</em>
            </span>
          </h1>
          <div className="hero2__badges">
            <span className="hero2__tag">Nail artist · {business.city.value}</span>
            <span className="hero2__tag">Sur rendez-vous</span>
            {photo?.provenance === 'fictif' && <span className="hero2__tag hero2__tag--prov">Visuel fictif</span>}
          </div>
          <p className="hero2__lead">Poses gel, french, nail art et semi-permanent. Réservez en moins d’une minute.</p>

          <div className="hero2__card glass">
            <div className="hero2__slot">
              <span className="hero2__slot-label">{slot ? 'Prochain créneau' : 'En moins d’une minute'}</span>
              <span className="hero2__slot-value">
                {slot ? (
                  <>
                    <span className="hero2__slot-day">{capitalize(fmt.date(slot, { weekday: 'short' }))} </span>
                    {fmt.date(slot, { day: 'numeric', month: 'short' })} · {fmt.time(slot)}
                  </>
                ) : (
                  'Choisissez votre créneau'
                )}
              </span>
            </div>
            <Link to="/reserver" viewTransition className="btn btn--lacquer hero2__book">
              Réserver <Icon name="arrowRight" size={18} className="hero2__book-icon" />
            </Link>
          </div>
          <Link to="/galerie" viewTransition className="hero2__more">
            Voir les réalisations <Icon name="arrowRight" size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}
