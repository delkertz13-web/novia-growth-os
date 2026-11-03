import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { gallery, galleryById, galleryCategories, lengthLabels, serviceForCategory, shapeLabels } from '../config/content.demo'
import type { GalleryCategory, NailLength, NailShape } from '../config/schema'
import { serviceById } from '../config/services.demo'
import { hasFictionalMedia, provenanceNote } from '../media/media'
import { Icon } from '../ui/Icon'
import { Photo, Sheet } from '../ui/common'
import { ClientFooter } from './ClientLayout'

export function Gallery() {
  const [params, setParams] = useSearchParams()
  const [cat, setCat] = useState<GalleryCategory | 'all'>('all')
  const [shape, setShape] = useState<NailShape | 'all'>('all')
  const [length, setLength] = useState<NailLength | 'all'>('all')
  const openId = params.get('photo')
  const open = openId ? galleryById(openId) : undefined

  const items = useMemo(
    () =>
      gallery.filter(
        (g) => (cat === 'all' || g.category === cat) && (shape === 'all' || g.shape === shape) && (length === 'all' || g.length === length),
      ),
    [cat, shape, length],
  )
  const shapes = Array.from(new Set(gallery.map((g) => g.shape)))

  const close = () => setParams({}, { replace: true })
  const service = open ? serviceById(serviceForCategory[open.category]) : undefined

  return (
    <main className="page">
      <div className="wrap">
        <div className="page-head">
          <div className="eyebrow">Réalisations</div>
          <h1 className="display">Galerie</h1>
          <p className="muted" style={{ margin: 0 }}>
            Formes, longueurs et finitions. Touchez un visuel pour le voir en grand.
          </p>
          {hasFictionalMedia('gallery') && <p className="provenance-note">{provenanceNote()}</p>}
        </div>

        <div className="filters">
          <div className="chips" role="tablist" aria-label="Catégories">
            <button className={`chip ${cat === 'all' ? 'is-active' : ''}`} onClick={() => setCat('all')}>
              Tout
            </button>
            {galleryCategories.map((c) => (
              <button key={c.id} className={`chip ${cat === c.id ? 'is-active' : ''}`} onClick={() => setCat(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="chips" aria-label="Forme et longueur">
            {shapes.map((s) => (
              <button key={s} className={`chip chip--sm ${shape === s ? 'is-active' : ''}`} onClick={() => setShape(shape === s ? 'all' : s)}>
                {shapeLabels[s]}
              </button>
            ))}
            <span style={{ width: 1, background: 'var(--line-strong)', flex: '0 0 1px', margin: '4px 2px' }} />
            {(Object.keys(lengthLabels) as NailLength[]).map((l) => (
              <button key={l} className={`chip chip--sm ${length === l ? 'is-active' : ''}`} onClick={() => setLength(length === l ? 'all' : l)}>
                {lengthLabels[l]}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="empty">Aucune réalisation pour cette combinaison.</div>
        ) : (
          <div className="masonry">
            {items.map((g) => (
              <button key={g.id} className="masonry__item" onClick={() => setParams({ photo: g.id })}>
                <Photo item={g} sizes="(min-width: 720px) 33vw, 50vw" />
                <div className="masonry__cap">{g.title}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!open} onClose={close} label={open?.title ?? 'Réalisation'}>
        {open && (
          <div className="viewer">
            <Photo item={open} eager sizes="(min-width: 720px) 560px, 100vw" provenanceBadge />
            <h2 className="display">{open.title}</h2>
            <div className="tags">
              <span className="badge">{galleryCategories.find((c) => c.id === open.category)?.label}</span>
              <span className="badge">{shapeLabels[open.shape]}</span>
              <span className="badge">{lengthLabels[open.length]}</span>
            </div>
            {service && (
              <Link to={`/reserver?service=${service.id}&inspiration=${open.id}`} className="btn btn--primary btn--block">
                Réserver · {service.name} <Icon name="arrowRight" size={18} />
              </Link>
            )}
          </div>
        )}
      </Sheet>
      <ClientFooter />
    </main>
  )
}
