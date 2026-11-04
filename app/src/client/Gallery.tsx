import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { gallery, galleryById, galleryCategories, lengthLabels, shapeLabels } from '../config/content.demo'
import type { GalleryCategory, NailLength, NailShape } from '../config/schema'
import { hasFictionalMedia, provenanceNote } from '../media/media'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/common'
import { prefersReducedMotion, runViewTransition, withViewTransition } from '../ui/motion'
import { ClientFooter } from './ClientLayout'
import './gallery/gallery.css'
import { categoriesWithCount, distinct, filterGallery, parseGalleryParams, viewerList, type GalleryView } from './gallery/model'
import { POSE_VT, PoseViewer } from './gallery/PoseViewer'
import { useDepth } from './gallery/useDepth'

const pad = (n: number) => String(n).padStart(2, '0')
const categoryLabel = (id: GalleryCategory) => galleryCategories.find((c) => c.id === id)?.label ?? ''
const setVT = (el: HTMLElement | null | undefined, name: string) => {
  if (el) el.style.setProperty('view-transition-name', name)
}

/**
 * Galerie V2 — scène sombre.
 * Portfolio (par défaut) : grandes cartes qui prennent de la profondeur au scroll.
 * Grille (secondaire) : vue d'ensemble compacte.
 * Une pose s'ouvre en plein écran par une transition continue depuis sa carte,
 * on passe d'une pose à l'autre au doigt, puis « Je veux cette pose » ouvre la réservation.
 */
export function Gallery() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { view, cat } = parseGalleryParams(params)
  const [shape, setShape] = useState<NailShape | 'all'>('all')
  const [length, setLength] = useState<NailLength | 'all'>('all')
  const listRef = useRef<HTMLOListElement>(null)

  const items = useMemo(() => filterGallery(gallery, { cat, shape, length }), [cat, shape, length])
  const cats = useMemo(() => categoriesWithCount(gallery), [])
  const shapes = useMemo(() => distinct(gallery, 'shape'), [])
  const lengths = useMemo(() => distinct(gallery, 'length'), [])

  const openId = params.get('photo')
  const open = openId ? galleryById(openId) : undefined
  const viewerItems = open ? viewerList(gallery, items, open.id) : []

  useDepth(listRef, `${view}:${items.map((g) => g.id).join(',')}`)

  const update = (mutate: (p: URLSearchParams) => void, opts: { replace?: boolean; state?: unknown; flushSync?: boolean } = {}) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        mutate(next)
        return next
      },
      { preventScrollReset: true, ...opts },
    )

  const setCat = (c: GalleryCategory | 'all') =>
    runViewTransition(() => update((p) => (c === 'all' ? p.delete('cat') : p.set('cat', c)), { replace: true, flushSync: true }))
  const setView = (v: GalleryView) =>
    runViewTransition(() => update((p) => (v === 'portfolio' ? p.delete('vue') : p.set('vue', v)), { replace: true, flushSync: true }))

  /* ---------- Carte → plein écran ---------- */

  const openPose = (id: string, card: HTMLElement) => {
    const media = card.querySelector<HTMLElement>('[data-vt]')
    setVT(media, POSE_VT) // la carte est capturée sous ce nom…
    const t = runViewTransition(() => {
      setVT(media, 'none') // …puis le cède à la visionneuse
      update((p) => p.set('photo', id), { state: { pose: true }, flushSync: true })
    })
    if (!t) setVT(media, 'none')
  }

  /* ---------- Plein écran → carte ---------- */

  const pendingClose = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    if (!openId && pendingClose.current) {
      const done = pendingClose.current
      pendingClose.current = null
      done()
    }
  }, [openId])

  const closePose = useCallback(
    (id: string) => {
      const pushedHere = (location.state as { pose?: boolean } | null)?.pose === true
      let media: HTMLElement | null = null
      const t = runViewTransition(
        () =>
          new Promise<void>((resolve) => {
            const done = () => {
              // Visionneuse démontée : la carte de la pose affichée reprend le nom partagé.
              const card = listRef.current?.querySelector<HTMLElement>(`[data-pose="${id}"]`)
              if (card) {
                const r = card.getBoundingClientRect()
                if (r.bottom < 0 || r.top > window.innerHeight) card.scrollIntoView({ block: 'center' })
                card.focus({ preventScroll: true })
                media = card.querySelector<HTMLElement>('[data-vt]')
                if (!prefersReducedMotion()) setVT(media, POSE_VT)
              }
              resolve()
            }
            pendingClose.current = done
            // Ouverte depuis la galerie : on revient dans l'historique (le geste retour d'iOS fait pareil).
            if (pushedHere) navigate(-1)
            else update((p) => p.delete('photo'), { replace: true })
            window.setTimeout(() => {
              if (pendingClose.current === done) {
                pendingClose.current = null
                done()
              }
            }, 600)
          }),
      )
      const clear = () => setVT(media, 'none')
      if (t) t.finished.then(clear, clear)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location.state, navigate],
  )

  const onIndexChange = useCallback(
    (id: string) => update((p) => p.set('photo', id), { replace: true, state: location.state }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location.state],
  )

  const fictional = hasFictionalMedia('gallery')

  return (
    <>
      <main className="page scene gallery">
        <div className="wrap">
          <header className="gallery__head">
            <div>
              <div className="eyebrow">Réalisations</div>
              <h1 className="display gallery__title">Galerie</h1>
            </div>
            <div className="seg" role="group" aria-label="Affichage">
              <button type="button" className={view === 'portfolio' ? 'is-on' : ''} aria-pressed={view === 'portfolio'} onClick={() => setView('portfolio')}>
                Portfolio
              </button>
              <button type="button" className={view === 'grille' ? 'is-on' : ''} aria-pressed={view === 'grille'} onClick={() => setView('grille')}>
                Grille
              </button>
            </div>
          </header>
          <p className="gallery__lead">Touchez une pose pour la voir en grand, puis réservez-la en un geste.</p>
          {fictional && <p className="provenance-note gallery__prov">{provenanceNote()}</p>}
        </div>

        <div className="gallery__bar">
          <div className="wrap">
            <div className="chips gallery__chips" role="group" aria-label="Catégories">
              <button type="button" className={`chip ${cat === 'all' ? 'is-active' : ''}`} aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
                Tout <small>{gallery.length}</small>
              </button>
              {cats.map((c) => (
                <button key={c.id} type="button" className={`chip ${cat === c.id ? 'is-active' : ''}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                  {c.label} <small>{c.count}</small>
                </button>
              ))}
            </div>
            {(shapes.length > 1 || lengths.length > 1) && (
              <div className="chips gallery__chips gallery__chips--sub" role="group" aria-label="Forme et longueur">
                {shapes.length > 1 &&
                  shapes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`chip chip--sm ${shape === s ? 'is-active' : ''}`}
                      aria-pressed={shape === s}
                      onClick={() => withViewTransition(() => setShape(shape === s ? 'all' : s))}
                    >
                      {shapeLabels[s]}
                    </button>
                  ))}
                {lengths.length > 1 &&
                  lengths.map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={`chip chip--sm ${length === l ? 'is-active' : ''}`}
                      aria-pressed={length === l}
                      onClick={() => withViewTransition(() => setLength(length === l ? 'all' : l))}
                    >
                      {lengthLabels[l]}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div className="wrap">
          {items.length === 0 ? (
            <div className="empty">Aucune réalisation pour cette combinaison.</div>
          ) : view === 'portfolio' ? (
            <ol className="folio" ref={listRef} aria-label="Portfolio">
              {items.map((g, i) => (
                <li key={g.id} className="folio__item" data-depth>
                  <button
                    type="button"
                    className="folio__card"
                    data-pose={g.id}
                    onClick={(e) => openPose(g.id, e.currentTarget)}
                    aria-label={`${g.title} · ${categoryLabel(g.category)} — voir la pose`}
                  >
                    <div className="folio__media" data-vt>
                      <Photo item={g} eager={i < 2} sizes="(min-width: 720px) 560px, calc(100vw - 40px)" provenanceBadge />
                    </div>
                    <div className="folio__cap">
                      <span className="folio__num">{pad(i + 1)}</span>
                      <span className="display folio__title">{g.title}</span>
                      <span className="folio__meta">
                        {categoryLabel(g.category)} · {shapeLabels[g.shape]} · {lengthLabels[g.length]}
                      </span>
                    </div>
                    <span className="folio__open glass" aria-hidden="true">
                      <Icon name="arrowRight" size={18} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <ol className="tiles" ref={listRef} aria-label="Grille">
              {items.map((g) => (
                <li key={g.id} className="tiles__item">
                  <button type="button" className="tiles__card" data-pose={g.id} onClick={(e) => openPose(g.id, e.currentTarget)}>
                    <div className="tiles__media" data-vt>
                      <Photo item={g} sizes="(min-width: 720px) 33vw, 50vw" provenanceBadge />
                    </div>
                    <span className="tiles__cap">{g.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
        <ClientFooter />
      </main>

      {open && <PoseViewer key={viewerItems === gallery ? 'all' : cat} items={viewerItems} initialId={open.id} onIndexChange={onIndexChange} onClose={closePose} />}
    </>
  )
}
