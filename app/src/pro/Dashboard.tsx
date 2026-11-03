import { Link } from 'react-router-dom'
import { business } from '../config/business.demo'
import { serviceById, services } from '../config/services.demo'
import { appointmentEnd, isActiveBooking, isAwaitingValidation } from '../core/appointmentStatus'
import { appointmentLevel, formatEUR } from '../core/revenue'
import { refillsDue } from '../core/smartfill'
import { providers } from '../providers/mock'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, sameDay, SimBadge, useDemoState, useNow } from '../ui/common'
import { AppointmentRow, customerName, OutcomeButtons, StatTile } from './parts'
import { useValidation } from './Validation'

export function Dashboard() {
  const st = useDemoState()
  const now = useNow()
  const { pick, ui } = useValidation()
  const byId = (id: string) => st.customers.find((c) => c.id === id)

  const today = st.appointments
    .filter((a) => sameDay(new Date(a.start), now) && a.status !== 'rescheduled')
    .sort((a, b) => a.start.localeCompare(b.start))
  const pending = st.appointments.filter((a) => isAwaitingValidation(a, now)).sort((a, b) => b.start.localeCompare(a.start))
  const upcoming = today.filter((a) => isActiveBooking(a.status) && appointmentEnd(a).getTime() > now.getTime())
  const bookedToday = today.filter((a) => appointmentLevel(a) === 'booked').reduce((s, a) => s + a.price, 0)
  const freeSlots = st.opportunities.filter((o) => o.kind === 'smartfill' && o.status === 'open')
  const activeRuns = st.runs.filter((r) => r.state === 'active')
  const refills = refillsDue(st.customers, st.appointments, services, now)
  const revenue = providers.analytics.getRevenue()

  return (
    <main className="wrap page">
      <header className="p-head">
        <div>
          <div className="p-head__date">{capitalize(fmt.dayLong(now))}</div>
          <h1 className="display">Bonjour {business.artistFirstName.value}</h1>
        </div>
        <div className="avatar" aria-hidden="true">
          {business.artistFirstName.value.charAt(0)}
        </div>
      </header>

      <div className="stats stagger">
        <StatTile label="RDV aujourd’hui" value={today.filter((a) => a.status !== 'cancelled').length} to="/pro/agenda" />
        <StatTile label="CA réservé du jour" value={formatEUR(bookedToday)} hint="pas encore encaissé" variant="dark" />
        <StatTile label="Créneaux libérés" value={freeSlots.length} hint="à remplir" to="/pro/novia" />
        <StatTile label="Actions nécessaires" value={pending.length} hint="présences à confirmer" variant={pending.length ? 'alert' : undefined} />
      </div>

      <section className="p-section">
        <div className="p-section__head">
          <h2 className="p-section__title">
            À confirmer {pending.length > 0 && <span className="count">{pending.length}</span>}
          </h2>
        </div>
        {pending.length === 0 ? (
          <div className="card" style={{ padding: 18, fontSize: 14 }}>
            Tout est à jour. Les rendez-vous terminés apparaîtront ici : NOVIA ne déduit jamais une présence de l’heure.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {pending.map((a) => {
              const c = byId(a.customerId)
              return (
                <article key={a.id} className="card validate">
                  <Link to={`/pro/rdv/${a.id}`} className="validate__top">
                    <div className="validate__time">{fmt.time(a.start)}</div>
                    <div style={{ flex: 1 }}>
                      <div className="validate__who">{customerName(c)}</div>
                      <div className="validate__what">
                        {serviceById(a.serviceId)?.name} · {fmt.eur(a.price)}
                      </div>
                    </div>
                    <Icon name="chevronRight" size={18} />
                  </Link>
                  <div className="validate__q">Le rendez-vous est terminé. Était-elle présente ?</div>
                  <OutcomeButtons a={a} now={now} onPick={(o) => pick(a, o)} />
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="p-section">
        <div className="p-section__head">
          <h2 className="p-section__title">Prochains rendez-vous</h2>
          <Link to="/pro/agenda" className="link-arrow">
            Agenda <Icon name="arrowRight" size={16} />
          </Link>
        </div>
        <div className="timeline">
          {upcoming.length === 0 && <div className="muted" style={{ fontSize: 14 }}>Plus de rendez-vous aujourd’hui.</div>}
          {upcoming.map((a) => (
            <AppointmentRow key={a.id} a={a} customer={byId(a.customerId)} now={now} />
          ))}
        </div>
      </section>

      <section className="p-section">
        <div className="p-section__head">
          <h2 className="p-section__title">NOVIA en action</h2>
          <SimBadge />
        </div>
        <div className="grid-2">
          {freeSlots.slice(0, 1).map((o) => (
            <Link key={o.id} to={`/pro/novia?smartfill=${o.id}`} className="card novia-card novia-card--dark">
              <div className="novia-card__row">
                <span className="eyebrow" style={{ color: 'rgba(244,239,233,.6)' }}>
                  Créneau libre
                </span>
                <Icon name="bolt" size={18} />
              </div>
              <div className="novia-card__title">
                {capitalize(fmt.dayShort(o.slotStart!))} · {fmt.time(o.slotStart!)}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {o.slotDurationMin} min · {formatEUR(o.amount)} à récupérer
              </div>
              <span className="btn btn--light btn--sm" style={{ justifySelf: 'start' }}>
                Lancer SmartFill
              </span>
            </Link>
          ))}
          <Link to="/pro/novia" className="card novia-card">
            <div className="novia-card__row">
              <span className="eyebrow">Récupérations en cours</span>
              <Icon name="refresh" size={18} />
            </div>
            <div className="novia-card__title">
              {activeRuns.length} séquence{activeRuns.length > 1 ? 's' : ''} W03 / W04
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {refills.length} remplissage{refills.length > 1 ? 's' : ''} à prévoir
            </div>
          </Link>
          <Link to="/pro/revenue" className="card novia-card">
            <div className="novia-card__row">
              <span className="eyebrow">Revenue · tout l’historique démo</span>
              <Icon name="chart" size={18} />
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
              <span>
                <b style={{ fontSize: 17 }}>{formatEUR(revenue.totals.potential)}</b>
                <br />
                <span className="muted">potentiel</span>
              </span>
              <span>
                <b style={{ fontSize: 17 }}>{formatEUR(revenue.totals.booked)}</b>
                <br />
                <span className="muted">réservé</span>
              </span>
              <span>
                <b style={{ fontSize: 17 }}>{formatEUR(revenue.totals.confirmed)}</b>
                <br />
                <span className="muted">confirmé</span>
              </span>
            </div>
          </Link>
        </div>
      </section>
      {ui}
    </main>
  )
}
