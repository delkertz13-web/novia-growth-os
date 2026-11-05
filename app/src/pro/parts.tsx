import { useState } from 'react'
import { Link } from 'react-router-dom'
import { serviceById } from '../config/services.demo'
import { appointmentEnd, attendanceState, outcomeLabels } from '../core/appointmentStatus'
import type { Appointment, Customer, ValidationOutcome, WorkflowRun } from '../core/types'
import { novia } from '../domain'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, Sheet, SimBadge, StatusPill } from '../ui/common'

export const customerName = (c?: Customer) => (c ? `${c.firstName} ${c.lastName}` : '—')

/* ---------------- Ligne de rendez-vous ---------------- */

/** origine visible dans l'agenda quand NOVIA a obtenu le rendez-vous */
const originTag: Partial<Record<Appointment['bookingOrigin'], string>> = { voice: 'Voice', smartfill: 'SmartFill', recovery: 'Récupération' }

export function AppointmentRow({ a, customer, now }: { a: Appointment; customer?: Customer; now: Date }) {
  const s = serviceById(a.serviceId)
  const past = appointmentEnd(a).getTime() < now.getTime() && attendanceState(a, now) !== 'unknown'
  return (
    <Link to={`/pro/rdv/${a.id}`} className={`appt ${past ? 'is-past' : ''}`}>
      <div className="appt__time">
        {fmt.time(a.start)}
        <small>{fmt.duration(a.durationMin)}</small>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="appt__who">{customerName(customer)}</div>
        <div className="appt__what">
          {s?.name}
          {originTag[a.bookingOrigin] && <span className={`origin-tag origin-tag--${a.bookingOrigin}`}>{originTag[a.bookingOrigin]}</span>}
        </div>
      </div>
      <div className="appt__right">
        <span className="appt__price">{fmt.eur(a.price)}</span>
        <StatusPill appointment={a} now={now} compact />
      </div>
    </Link>
  )
}

/* ---------------- Boutons Présente / Absente / Annulée / Reportée ---------------- */

const order: ValidationOutcome[] = ['present', 'absent', 'cancelled', 'rescheduled']
const statusOf: Record<ValidationOutcome, Appointment['status']> = {
  present: 'showed',
  absent: 'no_show',
  cancelled: 'cancelled',
  rescheduled: 'rescheduled',
}

export function OutcomeButtons({
  a,
  now,
  onPick,
}: {
  a: Appointment
  now: Date
  onPick: (o: ValidationOutcome) => void
}) {
  const started = new Date(a.start).getTime() <= now.getTime()
  const closed = a.status === 'rescheduled'
  return (
    <div className="outcomes" role="group" aria-label="Statut réel du rendez-vous">
      {order.map((o) => {
        const current = a.status === statusOf[o]
        const disabled = closed || current || ((o === 'present' || o === 'absent') && !started)
        return (
          <button key={o} className={`outcome outcome--${o} ${current ? 'is-current' : ''}`} disabled={disabled} onClick={() => onPick(o)}>
            <i />
            {outcomeLabels[o]}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Choix d'un nouveau créneau (report) ---------------- */

export function ReschedulePicker({
  a,
  open,
  onClose,
  onPick,
}: {
  a: Appointment
  open: boolean
  onClose: () => void
  onPick: (d: Date) => void
}) {
  const [dayIdx, setDayIdx] = useState(0)
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = novia.now()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + i + 1)
    return { d, slots: novia.pro.availableSlots(d, a.serviceId) }
  }).filter((x) => x.slots.length)
  const current = days[Math.min(dayIdx, days.length - 1)]
  return (
    <Sheet open={open} onClose={onClose} label="Choisir un nouveau créneau">
      <h2 className="display" style={{ fontSize: 30, margin: '0 0 4px' }}>
        Reporter
      </h2>
      <p className="muted" style={{ margin: '0 0 16px' }}>
        {serviceById(a.serviceId)?.name} · {fmt.duration(a.durationMin)}
      </p>
      <div className="chips" style={{ marginBottom: 16 }}>
        {days.map((x, i) => (
          <button key={x.d.toISOString()} className={`chip chip--sm ${i === dayIdx ? 'is-active' : ''}`} onClick={() => setDayIdx(i)}>
            {capitalize(fmt.dayShort(x.d))}
          </button>
        ))}
      </div>
      {current && (
        <div className="slots">
          {current.slots.map((s) => (
            <button key={s.toISOString()} className="slot" onClick={() => onPick(s)}>
              {fmt.time(s)}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

/* ---------------- Séquence W03 / W04 ---------------- */

const wfTitles: Record<string, string> = {
  W03: 'Annulation → récupération',
  W04: 'No-show → récupération',
}

const outcomeText: Record<string, string> = {
  recovered: 'Récupérée : nouveau rendez-vous réservé (→ W02).',
  no_response: 'Aucune réponse : séquence terminée.',
  declined: 'Refus de la cliente : séquence terminée.',
  obsolete: 'Statut corrigé : séquence devenue obsolète.',
  stopped: 'Séquence stoppée par un contrôle.',
}

export function RunCard({ run, customer, compact = false }: { run: WorkflowRun; customer?: Customer; compact?: boolean }) {
  const [toast, setToast] = useState('')
  const actions = compact ? run.actions.slice(-3) : run.actions
  const flash = (t: string) => {
    setToast(t)
    setTimeout(() => setToast(''), 2400)
  }
  return (
    <article className="card run">
      <div className="run__head">
        <div>
          <div className="run__wf">{run.workflow}</div>
          <div className="run__title">
            {wfTitles[run.workflow] ?? run.workflow} · {customerName(customer)}
          </div>
        </div>
        <SimBadge />
      </div>
      <ol className="steps">
        {actions.map((x, i) => (
          <li key={i + x.at} className={i === actions.length - 1 ? 'is-new' : ''}>
            <span className={`steps__dot steps__dot--${x.kind}`} />
            {x.label}
            <span className="steps__time">
              {capitalize(fmt.dayShort(x.at))} · {fmt.time(x.at)}
            </span>
          </li>
        ))}
      </ol>
      {run.state === 'active' ? (
        <>
          {novia.demo && (
            <div className="run__actions" role="group" aria-label="Simuler la suite (démo)">
              <span className="run__sim">Simuler</span>
              <button className="btn btn--ghost btn--sm" onClick={() => novia.demo?.advanceRecovery(run.id)}>
                <Icon name="play" size={14} /> Le temps passe
              </button>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  const a = novia.demo?.clientRebooks(run.id)
                  if (a) flash(`${customer?.firstName} a réservé ${fmt.dayShort(a.start)} à ${fmt.time(a.start)} (simulé)`)
                }}
              >
                Elle réserve
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => novia.demo?.clientDeclines(run.id)}>
                Elle refuse
              </button>
            </div>
          )}
          {customer && (
            <button className="btn btn--ghost btn--sm run__takeover" onClick={() => novia.pro.takeOverConversation(customer.id)}>
              <Icon name="message" size={14} /> Reprendre la conversation
            </button>
          )}
        </>
      ) : run.state === 'paused' ? (
        <div className="run__paused">
          <span>
            <Icon name="pause" size={14} /> En pause : vous avez repris la conversation. Aucun message n’est envoyé.
          </span>
          {customer && (
            <button className="btn btn--primary btn--sm" onClick={() => novia.pro.letNoviaHandle(customer.id)}>
              <Icon name="sparkle" size={14} /> Rendre à NOVIA
            </button>
          )}
        </div>
      ) : (
        <div className={`run__result ${run.outcome === 'recovered' ? '' : 'run__result--neutral'}`}>
          {outcomeText[run.outcome ?? 'stopped']}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </article>
  )
}

export function StatTile({
  label,
  value,
  hint,
  variant,
  to,
}: {
  label: string
  value: string | number
  hint?: string
  variant?: 'dark' | 'alert'
  to?: string
}) {
  const body = (
    <>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </>
  )
  const cls = `stat ${variant ? `stat--${variant}` : ''}`
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
