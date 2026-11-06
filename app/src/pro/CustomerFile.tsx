import { useState } from 'react'
import { business } from '../config/business.demo'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { serviceById } from '../config/services.demo'
import { sourceLabels } from '../core/revenue'
import { novia, segmentLabels, type TimelineEvent } from '../domain'
import { Icon, type IconName } from '../ui/Icon'
import { capitalize, fmt, StatusPill, useDemoState, useNow } from '../ui/common'
import { RunCard } from './parts'

export const leadLabels: Record<string, string> = {
  site: 'Site',
  instagram: 'Instagram',
  facebook: 'Facebook',
  chatbot: 'Chatbot',
  manual: 'Saisie manuelle',
  phone: 'Téléphone',
  voice: 'NOVIA Voice',
  referral: 'Parrainage',
}

const kindIcon: Record<TimelineEvent['kind'], IconName> = {
  booked: 'calendar',
  reminder: 'clock',
  attendance: 'user',
  service: 'star',
  payment: 'check',
  satisfaction: 'star',
  followup: 'refresh',
  cancelled: 'x',
  call: 'phone',
}

/** Fiche cliente : l'essentiel d'abord, l'historique ensuite. */
export function CustomerFile() {
  const { id = '' } = useParams()
  useDemoState()
  const now = useNow()
  const navigate = useNavigate()
  const [allHistory, setAllHistory] = useState(false)
  const [allAppts, setAllAppts] = useState(false)
  const file = novia.pro.customerFile(id, now)
  if (!file) {
    return (
      <main className="wrap page" style={{ paddingTop: 30 }}>
        <p>Cliente introuvable (la démo a peut-être été réinitialisée).</p>
        <Link to="/pro/clientes" className="btn btn--primary">
          Retour aux clientes
        </Link>
      </main>
    )
  }
  const { customer: c, appointments, upcoming, runs, noShows, refill, amounts, cancellations, segments, conversation, lastService } = file
  const open = runs.filter((r) => r.state === 'active' || r.state === 'paused')
  const timeline = novia.pro.timeline(c.id, now)
  const shownHistory = allHistory ? timeline.history : timeline.history.slice(0, 6)

  const openConversation = () => {
    const r = novia.pro.conversationFor(c.id)
    if (r.ok) navigate(`/pro/messages/${r.value.id}`)
  }
  const consent = c.optOut ? 'Opposition (STOP)' : !c.consent.marketing ? 'Rappels seulement' : 'Rappels + offres'

  return (
    <main className="wrap page cf">
      <div className="cf__top">
        <button type="button" className="icon-btn" aria-label="Retour" onClick={() => history.back()}>
          <Icon name="arrowLeft" size={18} />
        </button>
        <span className="eyebrow">Fiche cliente · données fictives</span>
      </div>

      <header className="cf__head">
        <div className="cf__avatar" aria-hidden="true">
          {c.firstName.charAt(0)}
          {c.lastName.charAt(0)}
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 className="display">
            {c.firstName} {c.lastName}
          </h1>
          <div className="muted">
            {c.lifecycle === 'prospect' ? 'Prospect' : 'Cliente'} depuis {new Date(c.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} · via{' '}
            {leadLabels[c.source] ?? c.source}
          </div>
          <div className="cf__contact">
            <span>{c.phone}</span>
            <span>{c.email}</span>
          </div>
        </div>
      </header>

      {segments.length > 0 && (
        <div className="cf__tags">
          {segments.map((s) => (
            <Link key={s} to={`/pro/clientes?segment=${s}`} className={`ops-tag ops-tag--${s}`}>
              {segmentLabels[s]}
            </Link>
          ))}
        </div>
      )}

      <section className={`card cf__novia ${c.humanTakeover ? 'is-human' : conversation?.state === 'needs_human' ? 'is-waiting' : ''}`}>
        <div className="cf__novia-state">
          <span className="cf__novia-dot" aria-hidden="true" />
          <div>
            <strong>{c.humanTakeover ? 'Vous gérez la conversation' : conversation?.state === 'needs_human' ? `Intervention de ${business.artistFirstName.value} nécessaire` : 'NOVIA gère la conversation'}</strong>
            <span className="muted">
              {c.humanTakeover
                ? `NOVIA n’envoie rien à ${c.firstName}${open.length ? ` ; ${open.length} séquence${open.length > 1 ? 's' : ''} en pause` : ''}.`
                : conversation?.state === 'needs_human'
                  ? conversation.conversation.needsHumanReason
                  : open.length
                    ? `${open.length} séquence${open.length > 1 ? 's' : ''} en cours.`
                    : 'Rappels et suivis selon vos réglages.'}
            </span>
          </div>
        </div>
        <div className="cf__novia-actions">
          <button className="btn btn--glass btn--sm" onClick={openConversation}>
            <Icon name="message" size={15} /> {conversation ? 'Ouvrir la conversation' : 'Écrire'}
          </button>
          {c.humanTakeover ? (
            <button className="btn btn--primary btn--sm" onClick={() => novia.pro.letNoviaHandle(c.id)}>
              <Icon name="sparkle" size={15} /> Rendre à NOVIA
            </button>
          ) : (
            <button className="btn btn--ghost btn--sm" onClick={() => novia.pro.takeOverConversation(c.id)}>
              <Icon name="hand" size={15} /> Reprendre la conversation
            </button>
          )}
        </div>
        {conversation?.last && (
          <p className="cf__last">
            <span>{conversation.last.from === 'client' ? c.firstName : conversation.last.from === 'novia' ? 'NOVIA' : 'Vous'} :</span> {conversation.last.body}
          </p>
        )}
      </section>

      <dl className="cf__facts">
        <div>
          <dt>Prochain RDV</dt>
          <dd>{upcoming ? `${capitalize(fmt.dayShort(upcoming.start))} · ${fmt.time(upcoming.start)}` : '—'}</dd>
        </div>
        <div>
          <dt>Dernière prestation</dt>
          <dd>{lastService ? `${serviceById(lastService.serviceId)?.name} · ${fmt.dayShort(lastService.start)}` : '—'}</dd>
        </div>
        <div>
          <dt>
            <i className="lv lv--booked" aria-hidden="true" /> Réservé
          </dt>
          <dd>{fmt.eur(amounts.booked)}</dd>
        </div>
        <div>
          <dt>
            <i className="lv lv--confirmed" aria-hidden="true" /> Confirmé
          </dt>
          <dd>{fmt.eur(amounts.confirmed)}</dd>
        </div>
        <div>
          <dt>Absences · annulations</dt>
          <dd>
            {noShows.total} · {cancellations}
          </dd>
        </div>
        <div>
          <dt>Remplissage</dt>
          <dd>{refill ? `Conseillé (${refill.daysSince} j)` : upcoming ? 'RDV prévu' : '—'}</dd>
        </div>
        <div className="cf__facts-wide">
          <dt>Consentement</dt>
          <dd>{consent}</dd>
        </div>
      </dl>

      {open.map((r) => (
        <RunCard key={r.id} run={r} customer={c} />
      ))}

      {timeline.upcoming.length > 0 && (
        <section className="p-section">
          <div className="p-section__head">
            <h2 className="p-section__title">À venir</h2>
          </div>
          <Timeline events={timeline.upcoming} future />
        </section>
      )}

      <section className="p-section">
        <div className="p-section__head">
          <h2 className="p-section__title">Historique</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            Messages simulés
          </span>
        </div>
        <Timeline events={shownHistory} />
        {timeline.history.length > 6 && (
          <button className="btn btn--ghost btn--sm cf__more" onClick={() => setAllHistory((v) => !v)}>
            {allHistory ? 'Réduire' : `Tout afficher (${timeline.history.length})`}
          </button>
        )}
      </section>

      <section className="p-section">
        <button className="cf__toggle" aria-expanded={allAppts} onClick={() => setAllAppts((v) => !v)}>
          <span className="p-section__title">Rendez-vous ({appointments.length})</span>
          <Icon name="chevronRight" size={18} className={allAppts ? 'is-open' : ''} />
        </button>
        {allAppts && (
          <div className="timeline">
            {appointments.map((a) => (
              <Link key={a.id} to={`/pro/rdv/${a.id}`} className="appt">
                <div className="appt__time">
                  {new Date(a.start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '')}
                  <small>{fmt.time(a.start)}</small>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="appt__who">{serviceById(a.serviceId)?.name}</div>
                  <div className="appt__what">
                    {capitalize(fmt.dayShort(a.start))} · {sourceLabels[a.attribution]}
                  </div>
                </div>
                <div className="appt__right">
                  <span className="appt__price">{fmt.eur(a.price)}</span>
                  <StatusPill appointment={a} now={now} compact />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

    </main>
  )
}

function Timeline({ events, future }: { events: TimelineEvent[]; future?: boolean }) {
  return (
    <ol className={`tl ${future ? 'tl--future' : ''}`}>
      {events.map((e) => {
        const body = (
          <>
            <span className={`tl__dot tl__dot--${e.kind} ${e.byNovia ? 'is-novia' : ''}`} aria-hidden="true">
              <Icon name={kindIcon[e.kind]} size={13} />
            </span>
            <span className="tl__body">
              <span className="tl__title">
                {e.title}
                {e.byNovia && <span className="tl__novia">NOVIA</span>}
              </span>
              {e.detail && <span className="tl__detail">{e.detail}</span>}
            </span>
            <span className="tl__at">
              {capitalize(fmt.dayShort(e.at))}
              <small>{fmt.time(e.at)}</small>
            </span>
          </>
        )
        const to = e.callId ? `/pro/voice?appel=${e.callId}` : e.appointmentId ? `/pro/rdv/${e.appointmentId}` : undefined
        return (
          <li key={e.id}>
            {to ? (
              <Link to={to} className="tl__row">
                {body}
              </Link>
            ) : (
              <div className="tl__row">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
