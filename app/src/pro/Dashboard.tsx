import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { business, customerName, kpiDefinitions, novia, serviceById, type FeedItem, type Reaction, type TodayItem, type TodayState } from '../domain'
import { appointmentEnd } from '../core/appointmentStatus'
import { formatEUR } from '../core/revenue'
import type { Appointment } from '../core/types'
import { Icon } from '../ui/Icon'
import { Counter } from '../ui/motion/Counter'
import { useReducedMotion } from '../ui/motion'
import { capitalize, fmt, sameDay, Sheet, useDemoState, useNow } from '../ui/common'
import { OutcomeButtons } from './parts'
import { ReactionLinks, ReactionSteps } from './Reaction'
import { useValidation } from './Validation'
import './cockpit.css'

/**
 * Cockpit NOVIA Pro. Lit une vue construite par le domaine (novia.pro.cockpit) et
 * n'agit que par des intentions métier. Quand la professionnelle déclare un statut,
 * la carte reste en place et montre NOVIA réagir, étape par étape, pendant que les
 * compteurs du haut se mettent à jour.
 */
export function Dashboard() {
  const st = useDemoState()
  const now = useNow()
  const view = useMemo(() => novia.pro.cockpit(now), [st, now])
  const reduce = useReducedMotion()

  // Réactions en cours d'affichage : la carte reste visible après la décision.
  const [held, setHeld] = useState<{ before: Appointment; reaction: Reaction; leaving?: boolean }[]>([])
  const onReaction = useCallback((reaction: Reaction, before: Appointment) => setHeld((h) => [...h.filter((x) => x.before.id !== before.id), { before, reaction }]), [])
  const { pick, ui } = useValidation(onReaction)
  const dismiss = (id: string) => {
    if (reduce) return setHeld((h) => h.filter((x) => x.before.id !== id))
    setHeld((h) => h.map((x) => (x.before.id === id ? { ...x, leaving: true } : x)))
    window.setTimeout(() => setHeld((h) => h.filter((x) => x.before.id !== id)), 420)
  }

  const actions = [
    ...view.toConfirm.filter((a) => !held.some((h) => h.before.id === a.id)).map((a) => ({ a, h: undefined })),
    ...held.map((h) => ({ a: h.before, h })),
  ].sort((x, y) => y.a.start.localeCompare(x.a.start))

  const byId = (id: string) => st.customers.find((c) => c.id === id)
  const pulse = usePulse(st)
  const runs = view.recoveries.active.length
  const rev = view.revenue
  const [how, setHow] = useState(false)
  const slots = view.freedSlots.length

  return (
    <main className="wrap page ck">
      <header className="ck-head">
        <div>
          <div className="ck-head__date">
            {capitalize(fmt.dayLong(now))}
            {novia.clockMode === 'demo' && <span className="ck-head__clock"> · {fmt.time(now)} (démo)</span>}
          </div>
          <h1 className="display">Bonjour {business.artistFirstName.value}</h1>
        </div>
        <Link to="/pro/reglages" className="avatar" aria-label="Réglages">
          {business.artistFirstName.value.charAt(0)}
        </Link>
      </header>

      <p className="ck-pulse" aria-live="polite">
        <span className="ck-pulse__dot" key={pulse} aria-hidden="true" />
        <span>
          NOVIA veille
          {runs > 0 && ` · ${runs} récupération${runs > 1 ? 's' : ''} en cours`}
          {slots > 0 && ` · ${slots} créneau${slots > 1 ? 'x' : ''} à remplir`}
        </span>
      </p>

      <section className="ck-panel" aria-label="Le salon aujourd’hui">
        <div className="ck-panel__main">
          <span className="ck-label">CA du jour</span>
          <span className="ck-big">
            <Counter value={rev.todayBooked + rev.todayConfirmed} format={formatEUR} />
          </span>
          <span className="ck-split">
            <span>
              <i className="lv lv--booked" aria-hidden="true" />
              {formatEUR(rev.todayBooked)} réservé
            </span>
            <span>
              <i className="lv lv--confirmed" aria-hidden="true" />
              {formatEUR(rev.todayConfirmed)} confirmé
            </span>
          </span>
        </div>
        <div className="ck-panel__row">
          <Link to="/pro/revenue" className="ck-kpi ck-kpi--recover">
            <span className="ck-kpi__v">
              <Counter value={rev.toRecover} format={formatEUR} />
            </span>
            <span className="ck-kpi__l">à récupérer</span>
            <span className="ck-kpi__lv">potentiel</span>
          </Link>
          <Link to="/pro/revenue" className="ck-kpi">
            <span className="ck-kpi__v">
              <Counter value={rev.noviaWonThisMonth} format={formatEUR} />
            </span>
            <span className="ck-kpi__l">gagné par NOVIA ce mois</span>
            <span className="ck-kpi__lv">dont {formatEUR(rev.noviaConfirmedThisMonth)} confirmé</span>
          </Link>
          <Link to="/pro/novia" className="ck-kpi">
            <span className="ck-kpi__v">
              <Counter value={slots} />
            </span>
            <span className="ck-kpi__l">créneau{slots > 1 ? 'x' : ''} libéré{slots > 1 ? 's' : ''}</span>
            <span className="ck-kpi__lv">NOVIA cherche une cliente</span>
          </Link>
        </div>
        <button type="button" className="ck-how" onClick={() => setHow(true)}>
          <Icon name="info" size={15} /> Comment sont calculés ces chiffres ?
        </button>
      </section>
      <Sheet open={how} onClose={() => setHow(false)} label="Calcul des indicateurs">
        <KpiHelp onClose={() => setHow(false)} />
      </Sheet>

      <section className="p-section" aria-labelledby="ck-actions">
        <div className="p-section__head">
          <h2 className="p-section__title" id="ck-actions">
            Actions nécessaires {view.toConfirm.length > 0 && <span className="count">{view.toConfirm.length}</span>}
          </h2>
        </div>
        {actions.length === 0 ? (
          <div className="ck-calm">
            <Icon name="check" size={16} /> Tout est à jour. NOVIA ne déduit jamais une présence de l’heure : les rendez-vous terminés apparaîtront ici.
          </div>
        ) : (
          <div className="ck-actions">
            {actions.map(({ a, h }) => (
              <ActionCard
                key={a.id}
                a={a}
                customerName={customerName(byId(a.customerId))}
                now={now}
                reaction={h?.reaction}
                leaving={h?.leaving}
                onPick={(o) => pick(a, o)}
                onDone={() => dismiss(a.id)}
              />
            ))}
          </div>
        )}
      </section>

      {view.needsReply.length > 0 && (
        <section className="p-section" aria-labelledby="ck-reply">
          <div className="p-section__head">
            <h2 className="p-section__title" id="ck-reply">
              Messages à traiter <span className="count">{view.needsReply.length}</span>
            </h2>
            <Link to="/pro/messages" className="link-arrow">
              Messages <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <div className="ck-replies">
            {view.needsReply.map((i) => (
              <Link key={i.conversation.id} to={`/pro/messages/${i.conversation.id}`} className="ck-reply">
                <span className="ck-reply__who">
                  {customerName(i.customer)}
                  <span>{i.conversation.needsHumanReason}</span>
                </span>
                <span className="ck-reply__text">« {i.last?.body} »</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="p-section" aria-labelledby="ck-today">
        <div className="p-section__head">
          <h2 className="p-section__title" id="ck-today">
            Aujourd’hui
          </h2>
          <Link to="/pro/agenda" className="link-arrow">
            Agenda <Icon name="arrowRight" size={16} />
          </Link>
        </div>
        <TodayRail items={view.today} now={now} />
      </section>

      <section className="p-section" aria-labelledby="ck-novia">
        <div className="p-section__head">
          <h2 className="p-section__title" id="ck-novia">
            NOVIA en action
          </h2>
        </div>
        <div className="ck-novia">
          {view.freedSlots.slice(0, 1).map((o) => (
            <Link key={o.id} to={`/pro/novia?smartfill=${o.id}`} className="ck-slot">
              <span className="ck-label">
                <Icon name="bolt" size={14} /> Créneau libéré
              </span>
              <span className="ck-slot__when">
                {capitalize(fmt.dayShort(o.slotStart!))} · {fmt.time(o.slotStart!)}
              </span>
              <span className="ck-hint">
                {o.slotDurationMin} min · {formatEUR(o.amount)} à récupérer
              </span>
              <span className="btn btn--lacquer btn--sm">Remplir ce créneau</span>
            </Link>
          ))}
          <Link to="/pro/novia" className="ck-tile">
            <span className="ck-label">
              <Icon name="refresh" size={14} /> Récupérations
            </span>
            <span className="ck-tile__v">
              <Counter value={runs} />
            </span>
            <span className="ck-hint">
              en cours · {view.recoveries.recoveredThisMonth} réussie{view.recoveries.recoveredThisMonth > 1 ? 's' : ''} ce mois
            </span>
          </Link>
          <Feed items={view.feed} now={now} />
        </div>
      </section>
      {ui}
    </main>
  )
}

/** Change de valeur à chaque changement d'état métier : le point du pouls clignote une fois. */
function usePulse(st: unknown) {
  const [n, setN] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setN((x) => x + 1)
  }, [st])
  return n
}

/* ---------------- Carte d'action ---------------- */

function ActionCard({
  a,
  customerName: who,
  now,
  reaction,
  leaving,
  onPick,
  onDone,
}: {
  a: Appointment
  customerName: string
  now: Date
  reaction?: Reaction
  leaving?: boolean
  onPick: Parameters<typeof OutcomeButtons>[0]['onPick']
  onDone: () => void
}) {
  const s = serviceById(a.serviceId)
  const [played, setPlayed] = useState(false)
  const doneRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (played) doneRef.current?.focus()
  }, [played])

  return (
    <div className={`ck-collapse ${leaving ? 'is-leaving' : ''}`}>
      <article className={`ck-card ${reaction ? `is-reacting is-${reaction.outcome}` : ''}`}>
        <Link to={`/pro/rdv/${a.id}`} className="ck-card__top">
          <span className="ck-card__time">{fmt.time(a.start)}</span>
          <span className="ck-card__who">
            <strong>{who}</strong>
            <span>
              {s?.name} · {fmt.eur(a.price)}
            </span>
          </span>
          {reaction ? (
            <span className={`ck-state ck-state--${reaction.outcome}`} key={reaction.outcome}>
              {reaction.stateLabel}
            </span>
          ) : (
            <span className="ck-state ck-state--unknown">À confirmer</span>
          )}
        </Link>

        {reaction ? (
          <div className="ck-card__rx">
            <ReactionSteps reaction={reaction} onPlayed={() => setPlayed(true)} />
            <div className={`ck-card__after ${played ? 'is-on' : ''}`}>
              <ReactionLinks reaction={reaction} />
              <button ref={doneRef} type="button" className="btn btn--ghost btn--sm" onClick={onDone}>
                OK
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="ck-card__q">
              Terminé à {fmt.time(appointmentEnd(a))}
              {!sameDay(new Date(a.start), now) ? ` le ${fmt.dayShort(a.start)}` : ''}. Était-elle là ?
            </p>
            <OutcomeButtons a={a} now={now} onPick={onPick} />
          </>
        )}
      </article>
    </div>
  )
}

/* ---------------- Journée ---------------- */

const stateText: Record<TodayState, string> = {
  done: 'Présente',
  absent: 'Absente',
  cancelled: 'Annulée',
  to_confirm: 'À confirmer',
  in_progress: 'En cours',
  next: 'Prochaine',
  upcoming: '',
}

function TodayRail({ items, now }: { items: TodayItem[]; now: Date }) {
  if (!items.length) return <div className="ck-calm">Aucun rendez-vous aujourd’hui.</div>
  const nowIdx = items.findIndex((i) => new Date(i.appointment.start).getTime() > now.getTime())
  return (
    <ol className="ck-rail">
      {items.map((i, idx) => (
        <li key={i.appointment.id} className={`ck-rail__item is-${i.state}`}>
          {idx === nowIdx && (
            <div className="ck-now" aria-label={`Maintenant, ${fmt.time(now)}`}>
              <span>{fmt.time(now)}</span>
            </div>
          )}
          <Link to={`/pro/rdv/${i.appointment.id}`} className="ck-rail__row">
            <span className="ck-rail__time">{fmt.time(i.appointment.start)}</span>
            <span className="ck-rail__dot" aria-hidden="true" />
            <span className="ck-rail__who">
              <strong>{customerName(i.customer)}</strong>
              <span>
                {serviceById(i.appointment.serviceId)?.name} · {fmt.eur(i.appointment.price)}
              </span>
            </span>
            {stateText[i.state] && (
              <span className={`ck-state ck-state--${i.state}`} key={i.state}>
                {stateText[i.state]}
              </span>
            )}
          </Link>
        </li>
      ))}
      {nowIdx === -1 && (
        <li className="ck-rail__item">
          <div className="ck-now" aria-label={`Maintenant, ${fmt.time(now)}`}>
            <span>{fmt.time(now)}</span>
          </div>
        </li>
      )}
    </ol>
  )
}

/* ---------------- Activité ---------------- */

const ago = (iso: string, now: Date) => {
  const m = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'à l’instant'
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return capitalize(fmt.dayShort(iso))
}

function Feed({ items, now }: { items: FeedItem[]; now: Date }) {
  if (!items.length) return null
  return (
    <div className="ck-feed">
      <span className="ck-label">Dernières actions de NOVIA</span>
      <ol>
        {items.slice(0, 4).map((f) => (
          <li key={f.id} className={`ck-feed__item k-${f.kind}`}>
            <span className="ck-feed__dot" aria-hidden="true" />
            <span className="ck-feed__text">
              {f.who && <strong>{f.who} · </strong>}
              {f.label}
            </span>
            <span className="ck-feed__at">{ago(f.at, now)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ---------------- Définitions des indicateurs ---------------- */

function KpiHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="kpi-help">
      <h2 className="display">Ces chiffres</h2>
      <p className="kpi-help__levels">
        <span>
          <i className="lv lv--potential" /> Potentiel : peut encore être regagné.
        </span>
        <span>
          <i className="lv lv--booked" /> Réservé : un rendez-vous existe, rien n’est encaissé.
        </span>
        <span>
          <i className="lv lv--confirmed" /> Confirmé : prestation attestée et preuve de paiement.
        </span>
      </p>
      <dl>
        {kpiDefinitions.map((k) => (
          <div key={k.id}>
            <dt>
              {k.label} <small>{k.level}</small>
            </dt>
            <dd>{k.rule}</dd>
          </div>
        ))}
      </dl>
      <p className="kpi-help__demo">Données de démonstration, entièrement fictives. Aucun montant n’est encaissé par NOVIA.</p>
      <button className="btn btn--ghost btn--block" onClick={onClose}>
        Fermer
      </button>
    </div>
  )
}
