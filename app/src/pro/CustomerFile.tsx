import { Link, useParams } from 'react-router-dom'
import { serviceById } from '../config/services.demo'
import { sourceLabels } from '../core/revenue'
import { novia } from '../domain'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, StatusPill, useDemoState, useNow } from '../ui/common'
import { RunCard } from './parts'

const leadLabels: Record<string, string> = {
  site: 'Site',
  instagram: 'Instagram',
  facebook: 'Facebook',
  chatbot: 'Chatbot',
  manual: 'Saisie manuelle',
  phone: 'Téléphone',
  voice: 'NOVIA Voice',
  referral: 'Parrainage',
}

/** Consulter une cliente : historique, suivi NOVIA, et qui tient la conversation. */
export function CustomerFile() {
  const { id = '' } = useParams()
  useDemoState()
  const now = useNow()
  const file = novia.pro.customerFile(id, now)
  if (!file) {
    return (
      <main className="wrap page" style={{ paddingTop: 30 }}>
        <p>Cliente introuvable (la démo a peut-être été réinitialisée).</p>
        <Link to="/pro" className="btn btn--primary">
          Retour
        </Link>
      </main>
    )
  }
  const { customer: c, appointments, upcoming, runs, noShows, lifetimeValue, contactable, refill } = file
  const active = runs.filter((r) => r.state === 'active')

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
        <div>
          <h1 className="display">
            {c.firstName} {c.lastName}
          </h1>
          <div className="muted">
            Cliente depuis {new Date(c.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} · {leadLabels[c.source] ?? c.source}
          </div>
        </div>
      </header>

      <section className={`card cf__novia ${c.humanTakeover ? 'is-human' : ''}`}>
        <div className="cf__novia-state">
          <span className="cf__novia-dot" aria-hidden="true" />
          <div>
            <strong>{c.humanTakeover ? 'Vous gérez la conversation' : 'NOVIA gère la conversation'}</strong>
            <span className="muted">
              {c.humanTakeover
                ? 'NOVIA n’envoie rien à cette cliente tant que vous ne lui rendez pas la main.'
                : active.length
                  ? `${active.length} séquence${active.length > 1 ? 's' : ''} en cours.`
                  : 'Rappels et suivis selon les règles du salon.'}
            </span>
          </div>
        </div>
        {c.humanTakeover ? (
          <button className="btn btn--primary btn--sm" onClick={() => novia.pro.letNoviaHandle(c.id)}>
            <Icon name="sparkle" size={15} /> Laisser NOVIA gérer
          </button>
        ) : (
          <button className="btn btn--ghost btn--sm" onClick={() => novia.pro.takeOverConversation(c.id)}>
            <Icon name="message" size={15} /> Reprendre la conversation
          </button>
        )}
      </section>

      <dl className="cf__facts">
        <div>
          <dt>Prestations attestées</dt>
          <dd>{fmt.eur(lifetimeValue)}</dd>
        </div>
        <div>
          <dt>No-shows 30 j / 90 j</dt>
          <dd>
            {noShows.d30} / {noShows.d90}
          </dd>
        </div>
        <div>
          <dt>Marketing</dt>
          <dd>{c.optOut ? 'Opposition' : !c.consent.marketing ? 'Sans consentement' : contactable ? 'Contactable' : 'En pause'}</dd>
        </div>
        <div>
          <dt>Remplissage</dt>
          <dd>{refill ? `Conseillé (${refill.daysSince} j)` : upcoming ? 'RDV prévu' : '—'}</dd>
        </div>
      </dl>

      {active.map((r) => (
        <RunCard key={r.id} run={r} customer={c} />
      ))}

      <section className="p-section">
        <div className="p-section__head">
          <h2 className="p-section__title">Rendez-vous</h2>
        </div>
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
      </section>
    </main>
  )
}
