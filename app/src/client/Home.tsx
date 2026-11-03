import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { business } from '../config/business.demo'
import { gallery, reviews } from '../config/content.demo'
import { services } from '../config/services.demo'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/common'
import { ClientFooter, ClientHeader } from './ClientLayout'
import { HoursCard, ServiceRow } from './parts'

export function Home() {
  const navigate = useNavigate()
  const heroRef = useRef<HTMLElement>(null)
  const [showCta, setShowCta] = useState(false)

  useEffect(() => {
    const el = heroRef.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setShowCta(!e.isIntersecting), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <main>
      <section className="hero" ref={heroRef}>
        <ClientHeader overlay />
        <Photo imageId="g-pose-01" className="hero__media" eager />
        <div className="wrap hero__content stagger">
          <div className="hero__badges">
            <span className="badge badge--onDark">
              Nail artist · {business.city.value}
            </span>
            <span className="badge badge--onDark">Sur rendez-vous</span>
          </div>
          <h1 className="display hero__title">
            L’art de l’ongle, <em>au millimètre.</em>
          </h1>
          <p className="hero__lead">
            Poses gel, french, nail art et semi-permanent. Réservez votre créneau en moins d’une minute.
          </p>
          <div className="hero__ctas">
            <Link to="/reserver" className="btn btn--light">
              Prendre rendez-vous <Icon name="arrowRight" size={18} />
            </Link>
            <Link to="/galerie" className="btn btn--onDark">
              Voir les réalisations
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section__head">
            <div>
              <div className="eyebrow">Réalisations</div>
              <h2 className="display section__title">Le travail, de près.</h2>
            </div>
            <Link to="/galerie" className="link-arrow">
              Tout voir <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <div className="rail">
            {gallery.slice(0, 8).map((g) => (
              <button key={g.id} className="rail__item" onClick={() => navigate(`/galerie?photo=${g.id}`)}>
                <Photo item={g} />
                <div className="rail__cap">{g.title}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="section__head">
            <div>
              <div className="eyebrow">Prestations</div>
              <h2 className="display section__title">Choisir sa séance.</h2>
            </div>
          </div>
          <div className="svc-list stagger">
            {services.filter((s) => s.active).map((s) => (
              <ServiceRow key={s.id} service={s} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="section__head">
            <div>
              <div className="eyebrow">Avis</div>
              <h2 className="display section__title">Elles en parlent.</h2>
            </div>
            <span className="badge badge--sim">Avis fictifs</span>
          </div>
          <div className="reviews">
            {reviews.map((r) => (
              <article key={r.author} className="card review">
                <div className="review__stars" aria-label={`${r.rating} sur 5`}>
                  {Array.from({ length: r.rating }).map((_, i) => (
                    <Icon key={i} name="star" size={15} />
                  ))}
                </div>
                <p className="review__text" style={{ margin: 0 }}>
                  « {r.text} »
                </p>
                <div className="review__who">
                  <span>
                    {r.author} · {r.service}
                  </span>
                  <span className="badge">Démo</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="wrap info-grid">
          <HoursCard />
          <div className="card" style={{ padding: 22, display: 'grid', gap: 12, alignContent: 'start' }}>
            <div className="eyebrow">L’atelier</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Icon name="pin" size={18} /> {business.address.value}, {business.city.value}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Icon name="phone" size={18} /> {business.phone.value}
            </div>
            <Link to="/infos" className="link-arrow" style={{ marginTop: 6 }}>
              Questions fréquentes <Icon name="arrowRight" size={16} />
            </Link>
          </div>
        </div>
      </section>

      <ClientFooter />

      <div className={`sticky-cta ${showCta ? 'is-visible' : ''}`}>
        <Link to="/reserver" className="btn btn--primary btn--block">
          Prendre rendez-vous
        </Link>
      </div>
    </main>
  )
}
