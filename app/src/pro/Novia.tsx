import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { novia, serviceById, services, type SmartFillFunnel } from '../domain'
import { formatEUR } from '../core/revenue'
import { refillsDue } from '../core/smartfill'
import type { Appointment, Customer, Opportunity } from '../core/types'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, salon, Sheet, SimBadge, useDemoState, useNow } from '../ui/common'
import { customerName, RunCard, StatTile } from './parts'

/** jour du salon, pour ouvrir l'agenda sur ce jour */
const dayKey = (iso: string) => salon.dayKey(new Date(iso))

export function Novia() {
  const st = useDemoState()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const sfId = params.get('smartfill')
  const byId = (id: string) => st.customers.find((c) => c.id === id)

  const slots = st.opportunities.filter((o) => o.kind === 'smartfill')
  const runs = [...st.runs].sort((a, b) => {
    const rank = (x: typeof a) => (x.state === 'active' ? 0 : x.state === 'paused' ? 1 : 2)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return b.startedAt.localeCompare(a.startedAt)
  })
  const refills = refillsDue(st.customers, st.appointments, services, now)
  const voice = novia.pro.voiceStats()
  const won = novia.pro.cockpit(now).revenue.noviaWonThisMonth

  const recentNoShows = st.appointments.filter((a) => a.status === 'no_show' && new Date(a.start) >= new Date(now.getTime() - 30 * 86_400_000))
  const recovered = st.opportunities.filter((o) => o.kind === 'noshow_recovery' && o.status === 'won').length
  const nsPotential = st.opportunities.filter((o) => o.kind === 'noshow_recovery' && o.status === 'open').reduce((s, o) => s + o.amount, 0)

  return (
    <main className="wrap page">
      <header className="p-head">
        <div>
          <div className="p-head__date">NOVIA</div>
          <h1 className="display">Votre assistante</h1>
        </div>
      </header>

      <nav className="hub" aria-label="Espaces NOVIA">
        <Link to="/pro/voice" className="hub__tile hub__tile--voice">
          <Icon name="phone" size={20} />
          <strong>Voice</strong>
          <span>
            {voice.received} appels · {voice.booked} RDV créés
          </span>
        </Link>
        <Link to="/pro/revenue" className="hub__tile">
          <Icon name="chart" size={20} />
          <strong>Revenus</strong>
          <span>{formatEUR(won)} gagnés ce mois</span>
        </Link>
        <Link to="/pro/reglages" className="hub__tile">
          <Icon name="settings" size={20} />
          <strong>Réglages</strong>
          <span>Automatisations, horaires</span>
        </Link>
      </nav>

      <p className="muted" style={{ margin: '18px 0 0', fontSize: 14 }}>
        Ce que NOVIA fait pour vous en ce moment. Les messages sont simulés : aucune cliente n’est contactée.
      </p>

      <section className="p-section">
        <div className="p-section__head">
          <h2 className="p-section__title">
            <Icon name="bolt" size={20} /> Créneaux libérés
          </h2>
          <span className="muted" style={{ fontSize: 12 }}>
            NOVIA cherche une cliente
          </span>
        </div>
        {slots.length === 0 && <div className="card" style={{ padding: 18, fontSize: 14 }}>Aucun créneau libéré pour l’instant.</div>}
        <div className="grid-2">
          {slots.map((o) => (
            <SlotCard key={o.id} o={o} result={o.resultAppointmentId ? st.appointments.find((a) => a.id === o.resultAppointmentId) : undefined} customers={st.customers} onLaunch={() => setParams({ smartfill: o.id })} />
          ))}
        </div>
      </section>

      <section className="p-section">
        <div className="p-section__head">
          <h2 className="p-section__title">
            <Icon name="refresh" size={20} /> Absences et annulations
          </h2>
          <span className="muted" style={{ fontSize: 12 }}>
            NOVIA les récupère
          </span>
        </div>
        <div className="stats" style={{ marginTop: 0 }}>
          <StatTile label="Absences (30 j)" value={recentNoShows.length} />
          <StatTile label="Absences récupérées" value={recovered} />
          <StatTile label="Encore à récupérer" value={formatEUR(nsPotential)} hint="potentiel, pas encore réservé" />
          <StatTile label="Suivis en cours" value={runs.filter((r) => r.state === 'active' || r.state === 'paused').length} hint="absences et annulations" />
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {runs.map((r) => (
            <div key={r.id}>
              <RunCard run={r} customer={byId(r.customerId)} compact={r.state !== 'active' && r.state !== 'paused'} />
              {r.appointmentId && (
                <Link to={`/pro/rdv/${r.appointmentId}`} className="link-arrow" style={{ margin: '8px 4px 0', fontSize: 13 }}>
                  Voir le rendez-vous d’origine <Icon name="arrowRight" size={14} />
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="p-section">
        <div className="p-section__head">
          <h2 className="p-section__title">Remplissages à prévoir</h2>
        </div>
        <div className="timeline">
          {refills.map(({ customer, last, daysSince, recommended }) => (
            <Link key={customer.id} to={`/pro/clientes/${customer.id}`} className="appt" style={{ gridTemplateColumns: '1fr auto' }}>
              <div style={{ minWidth: 0 }}>
                <div className="appt__who">{customerName(customer)}</div>
                <div className="appt__what">
                  {serviceById(last.serviceId)?.name} il y a {daysSince} jours · retour conseillé à {recommended} j (démo)
                </div>
              </div>
              <span className="badge">{customer.optOut ? 'Opposition' : !customer.consent.marketing ? 'Sans consentement' : 'Contactable'}</span>
            </Link>
          ))}
        </div>
      </section>

      <SmartFillSheet key={sfId ?? 'none'} id={sfId} onClose={() => setParams({}, { replace: true })} opportunity={slots.find((o) => o.id === sfId)} />
    </main>
  )
}

function SlotCard({ o, result, customers, onLaunch }: { o: Opportunity; result?: Appointment; customers: Customer[]; onLaunch: () => void }) {
  const winner = result ? customers.find((c) => c.id === result.customerId) : undefined
  return (
    <article className={`card novia-card ${o.status === 'open' ? 'novia-card--dark' : ''}`}>
      <div className="novia-card__row">
        <span className="eyebrow" style={o.status === 'open' ? { color: 'rgba(244,239,233,.6)' } : undefined}>
          {o.status === 'open' ? 'Créneau libre · NOVIA cherche une cliente' : o.status === 'won' ? 'Créneau rempli par NOVIA' : 'Gardé libre'}
        </span>
        <span className="muted" style={{ fontSize: 13 }}>
          {o.slotDurationMin} min · {formatEUR(o.amount)}
        </span>
      </div>
      <div className="novia-card__title">
        {capitalize(fmt.dayLong(o.slotStart!))} · {fmt.time(o.slotStart!)}
      </div>
      {o.status === 'open' ? (
        <button className="btn btn--light btn--sm" style={{ justifySelf: 'start' }} onClick={onLaunch}>
          <Icon name="bolt" size={16} /> Remplir ce créneau
        </button>
      ) : (
        <div className="run__result">
          {winner ? `${customerName(winner)} a réservé · ${formatEUR(o.amount)} en CA réservé` : 'Créneau rempli'}
        </div>
      )}
    </article>
  )
}

function SmartFillSheet({ id, opportunity: o, onClose }: { id: string | null; opportunity?: Opportunity; onClose: () => void }) {
  const [phase, setPhase] = useState<'intro' | 'running' | 'done'>('intro')
  const [snapshot, setSnapshot] = useState<SmartFillFunnel | null>(null)
  const [winner, setWinner] = useState<Customer | null>(null)
  const [booked, setBooked] = useState<Appointment | null>(null)
  const close = () => {
    setPhase('intro')
    setSnapshot(null)
    setWinner(null)
    setBooked(null)
    onClose()
  }
  if (!id || !o?.slotStart) return null
  const alreadyFilled = o.status !== 'open' && phase === 'intro'

  const launch = () => {
    // photo de l'entonnoir AVANT la réservation simulée
    setSnapshot(novia.pro.previewSmartFill(o.id))
    setPhase('running')
    setTimeout(async () => {
      const r = await novia.pro.launchSmartFill(o.id)
      if (r.ok && r.value) {
        setWinner(r.value.customer)
        setBooked(r.value.appointment)
      }
      setPhase('done')
    }, 1600)
  }

  return (
    <Sheet open onClose={close} label="SmartFill">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="eyebrow">Créneau libéré · NOVIA SmartFill</span>
        <SimBadge />
      </div>
      <h2 className="display" style={{ fontSize: 32, margin: '8px 0 4px' }}>
        {capitalize(fmt.dayShort(o.slotStart))} · {fmt.time(o.slotStart)}
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        {o.slotDurationMin} min libérées · {formatEUR(o.amount)} en CA potentiel
      </p>

      {phase === 'intro' && !alreadyFilled && (
        <>
          <p style={{ fontSize: 15, margin: '18px 0' }}>
            NOVIA contacterait les clientes éligibles selon les règles configurées : liste d’attente, délai de remplissage, consentement,
            absence d’opposition et de reprise humaine. La première qui réserve récupère le créneau.
          </p>
          <button className="btn btn--lacquer btn--block" onClick={launch}>
            <Icon name="bolt" size={18} /> Proposer ce créneau
          </button>
          <button
            className="btn btn--ghost btn--block"
            style={{ marginTop: 8 }}
            onClick={() => {
              novia.pro.keepSlotFree(o.id)
              close()
            }}
          >
            Garder ce créneau libre
          </button>
        </>
      )}

      {snapshot && (
        <>
          <div className="funnel" aria-live="polite">
            <FunnelRow n={snapshot.eligible.length} total={snapshot.eligible.length} label="clientes éligibles" />
            <FunnelRow n={snapshot.contactable.length} total={snapshot.eligible.length} label="contactables" />
            <FunnelRow n={phase === 'running' ? 0 : winner ? 1 : 0} total={snapshot.eligible.length} label={phase === 'running' ? 'en attente de réponse…' : 'réservation'} />
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Écartées : {snapshot.eligible.filter((c) => !snapshot.contactable.includes(c)).map((c) => `${c.firstName} (${c.optOut ? 'opposition' : c.humanTakeover ? 'reprise humaine' : 'sans consentement'})`).join(', ') || 'aucune'}.
          </div>
        </>
      )}

      {phase === 'done' && winner && (
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          <div className="run__result">
            {customerName(winner)} a pris le créneau (simulé). Le trou est comblé : {formatEUR(o.amount)} passent de « à récupérer » à « réservé ».
          </div>
          <div className="sf-links">
            {booked && (
              <Link to={`/pro/agenda?jour=${dayKey(booked.start)}&rdv=${booked.id}`} className="btn btn--ghost" onClick={close}>
                <Icon name="calendar" size={17} /> Dans l’agenda
              </Link>
            )}
            <Link to="/pro/revenue" className="btn btn--primary" onClick={close}>
              Voir le revenu <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        </div>
      )}
      {phase === 'done' && !winner && <div className="run__result run__result--neutral" style={{ marginTop: 16 }}>Aucune cliente contactable : le créneau reste libre.</div>}
      {alreadyFilled && (
        <div className="run__result" style={{ marginTop: 16 }}>
          Ce créneau a déjà été rempli.
        </div>
      )}
    </Sheet>
  )
}

function FunnelRow({ n, total, label }: { n: number; total: number; label: string }) {
  const pct = total ? Math.max(0.16, n / total) : 0
  return (
    <div className="funnel__row">
      <span className="funnel__bar" style={{ width: `${pct * 100}%` }} />
      <span className="funnel__num">{n}</span>
      <span className="funnel__label">{label}</span>
    </div>
  )
}
