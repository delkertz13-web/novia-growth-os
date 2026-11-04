import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { business } from '../../config/business.demo'
import { rules } from '../../config/rules.demo'
import type { GalleryItem } from '../../config/schema'
import { serviceById } from '../../config/services.demo'
import type { Appointment } from '../../core/types'
import { Icon } from '../../ui/Icon'
import { capitalize, fmt, Photo } from '../../ui/common'
import { depositLabel, followUps, slotEnd, type FollowUp } from './model'

const followUpWhen = (f: FollowUp) => {
  if (f.key === 'confirmation') return 'À l’instant'
  if (f.state === 'skipped') return 'Non programmé : rendez-vous trop proche'
  return f.at ? `${capitalize(fmt.dayShort(f.at))} à ${fmt.time(f.at)}` : ''
}
const followUpState = (f: FollowUp) => (f.state === 'done' ? 'Simulée' : f.state === 'scheduled' ? 'Programmé · simulé' : '—')

/**
 * Confirmation : un sceau laqué se pose (≈ 1,2 s, une seule fois), puis le billet du
 * rendez-vous et ce que NOVIA ferait ensuite (W02 : confirmation, rappels 24 h et 2 h).
 */
export function Confirmation({ appointment: a, inspo }: { appointment: Appointment; inspo?: GalleryItem }) {
  const s = serviceById(a.serviceId)!
  const start = new Date(a.start)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [bookedAt] = useState(() => new Date())
  const steps = followUps(a, rules, bookedAt)

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <main className="wrap done2">
      <div className="seal" aria-hidden="true">
        <svg viewBox="0 0 104 104" width="104" height="104">
          <circle className="seal__ring" cx="52" cy="52" r="44" />
          <path className="seal__check" d="M34 53.5l12 12L71 40" />
        </svg>
      </div>

      <div className="eyebrow done2__eyebrow">Réservation simulée · démo</div>
      <h1 className="display done2__title" ref={titleRef} tabIndex={-1}>
        C’est réservé.
      </h1>
      <p className="done2__when">
        {capitalize(fmt.dayLong(start))}
        <br />
        <strong>
          {fmt.time(start)} → {fmt.time(slotEnd(start, a.durationMin))}
        </strong>
      </p>

      <section className="ticket" aria-label="Votre rendez-vous">
        {inspo && (
          <div className="ticket__inspo">
            <div className="ticket__inspo-media">
              <Photo item={inspo} eager sizes="56px" />
            </div>
            <div>
              <span className="ticket__k">Inspiration</span>
              <strong>{inspo.title}</strong>
            </div>
          </div>
        )}
        <div className="ticket__rows">
          <Row k="Prestation" v={s.name} />
          <Row k="Durée" v={fmt.duration(a.durationMin)} />
          <Row k="Prix" v={fmt.eur(a.price)} />
          <Row k="Acompte" v={depositLabel(a, fmt.eur)} />
          <Row k="Avec" v={`${business.artistFirstName.value} · ${business.name.value}`} />
        </div>
        <div className="ticket__ref">
          <span>Référence de démonstration</span>
          <code>{a.ref}</code>
        </div>
      </section>

      <section className="next" aria-label="Ce que NOVIA fait ensuite">
        <div className="next__head">
          <span className="eyebrow">Et ensuite, NOVIA s’en charge</span>
          <span className="next__demo">Démo</span>
        </div>
        <ol className="next__list">
          {steps.map((f) => (
            <li key={f.key} className={`next__item is-${f.state}`}>
              <span className="next__dot">{f.state !== 'skipped' && <Icon name="check" size={11} stroke={2.6} />}</span>
              <div className="next__body">
                <strong>{f.label}</strong>
                <span>{followUpWhen(f)}</span>
              </div>
              <span className="next__state">{followUpState(f)}</span>
            </li>
          ))}
        </ol>
        <p className="next__foot">Mode DÉMO : aucun SMS ni email réel n’est envoyé. Les délais viennent des paramètres de démonstration.</p>
      </section>

      <div className="done2__actions">
        <Link to={`/pro/rdv/${a.id}`} className="btn btn--primary">
          Voir ce rendez-vous côté pro
        </Link>
        <Link to="/" className="btn btn--ghost">
          Retour à l’accueil
        </Link>
      </div>
    </main>
  )
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="recap__row">
    <span>{k}</span>
    <span>{v}</span>
  </div>
)
