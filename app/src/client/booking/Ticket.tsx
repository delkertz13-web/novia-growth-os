import { business } from '../../config/business.demo'
import { rules } from '../../config/rules.demo'
import type { GalleryItem, ServiceConfig } from '../../config/schema'
import type { Appointment } from '../../core/types'
import { resolveMedia } from '../../media/media'
import { Icon } from '../../ui/Icon'
import { capitalize, fmt, Photo } from '../../ui/common'
import { depositLabel, followUps, slotEnd, type FollowUp } from './model'

export type Phase = 'edit' | 'confirming' | 'done'

interface TicketProps {
  phase: Phase
  service: ServiceConfig
  slot: Date
  inspo?: GalleryItem
  contactName: string
  appointment?: Appointment | null
  onEdit: (what: 'service' | 'when' | 'contact') => void
}

/**
 * Récapitulatif en invitation : la pose en grand, puis la date et l'heure en
 * typographie, la prestation, et seulement ensuite les détails. Le même élément
 * reste à l'écran pendant la confirmation : il se recentre, reçoit le sceau et
 * sa référence ; rien n'est démonté, il n'y a jamais d'écran vide.
 */
export function Ticket({ phase, service, slot, inspo, contactName, appointment, onEdit }: TicketProps) {
  const fictional = inspo ? resolveMedia(inspo.id)?.provenance === 'fictif' : false
  const end = slotEnd(slot, service.durationMin)
  return (
    <article className="tk" data-phase={phase} aria-label="Votre rendez-vous">
      <div className="tk__photo">
        {inspo ? <Photo item={inspo} eager sizes="(min-width: 560px) 520px, 100vw" /> : <Photo imageId={service.coverImageId} eager sizes="(min-width: 560px) 520px, 100vw" />}
        {fictional && <span className="tk__prov">Visuel fictif</span>}
        <div className="tk__seal" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle className="tk__seal-ring" cx="32" cy="32" r="27" />
            <path className="tk__seal-check" d="M21 33l7.5 7.5L44 25" />
          </svg>
        </div>
      </div>

      <div className="tk__body">
        <span className="tk__eyebrow">{inspo ? 'Votre inspiration' : 'Votre séance'}</span>
        <h2 className="display tk__title">{inspo ? inspo.title : service.name}</h2>
        <p className="tk__date">{capitalize(fmt.dayLong(slot))}</p>
        <p className="tk__time">
          {fmt.time(slot)} <span>→ {fmt.time(end)}</span>
        </p>
        <p className="tk__service">
          {inspo ? `${service.name} · ` : ''}
          {fmt.duration(service.durationMin)} · <strong>{fmt.eur(service.price)}</strong>
        </p>

        <dl className="tk__details">
          <div>
            <dt>Avec</dt>
            <dd>
              {business.artistFirstName.value} · {business.name.value}
            </dd>
          </div>
          <div>
            <dt>Au nom de</dt>
            <dd>{contactName}</dd>
          </div>
          <div>
            <dt>Acompte</dt>
            <dd>{depositLabel(service, fmt.eur)}</dd>
          </div>
          <div className="tk__ref">
            <dt>Référence démo</dt>
            <dd>
              <code>{appointment?.ref ?? '—'}</code>
            </dd>
          </div>
        </dl>

        <div className="tk__edits" aria-hidden={phase !== 'edit' || undefined}>
          <span>Modifier :</span>
          <button type="button" tabIndex={phase === 'edit' ? 0 : -1} onClick={() => onEdit('service')}>
            prestation
          </button>
          <button type="button" tabIndex={phase === 'edit' ? 0 : -1} onClick={() => onEdit('when')}>
            date
          </button>
          <button type="button" tabIndex={phase === 'edit' ? 0 : -1} onClick={() => onEdit('contact')}>
            coordonnées
          </button>
        </div>
      </div>
    </article>
  )
}

const followUpWhen = (f: FollowUp) => {
  if (f.key === 'confirmation') return 'À l’instant'
  if (f.state === 'skipped') return 'Non programmé : rendez-vous trop proche'
  return f.at ? `${capitalize(fmt.dayShort(f.at))} à ${fmt.time(f.at)}` : ''
}

/** Ce que NOVIA ferait ensuite (W02 de démo) : affiché seulement une fois la réservation posée. */
export function NextSteps({ appointment, bookedAt }: { appointment: Appointment; bookedAt: Date }) {
  const list = followUps(appointment, rules, bookedAt)
  return (
    <section className="nx" aria-label="Ce que NOVIA fait ensuite">
      <div className="nx__head">
        <span>Et ensuite, NOVIA s’en charge</span>
        <span className="nx__demo">Démo</span>
      </div>
      <ol className="nx__list">
        {list.map((f) => (
          <li key={f.key} className={`nx__item is-${f.state}`}>
            <span className="nx__dot">{f.state !== 'skipped' && <Icon name="check" size={10} stroke={2.8} />}</span>
            <strong>{f.label}</strong>
            <span>{followUpWhen(f)}</span>
          </li>
        ))}
      </ol>
      <p className="nx__foot">Mode DÉMO : aucun SMS ni email réel n’est envoyé.</p>
    </section>
  )
}
