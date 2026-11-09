import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { capitalize, fmt, salon, sameDay, useDemoState, useNow } from '../ui/common'
import { AppointmentRow } from './parts'

export function Agenda() {
  const st = useDemoState()
  const now = useNow()
  const [params] = useSearchParams()
  // ?jour=AAAA-MM-JJ ouvre l'agenda sur ce jour, ?rdv=id met le rendez-vous en évidence
  const [offset, setOffset] = useState(() => {
    const j = params.get('jour')
    if (!j) return 0
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) return 0
    const diff = salon.daysBetween(now, salon.parseDayKey(j))
    return Math.max(-2, Math.min(7, diff))
  })
  const highlight = params.get('rdv')
  // jours du SALON (fuseau de l'entreprise), à minuit
  const days = Array.from({ length: 10 }, (_, i) => salon.startOfDay(salon.addDays(now, i - 2)))
  const day = days[offset + 2]
  const list = st.appointments
    .filter((a) => sameDay(new Date(a.start), day) && a.status !== 'rescheduled')
    .sort((a, b) => a.start.localeCompare(b.start))
  const byId = (id: string) => st.customers.find((c) => c.id === id)

  return (
    <main className="wrap page">
      <header className="p-head">
        <div>
          <div className="p-head__date">Agenda</div>
          <h1 className="display">{offset === 0 ? 'Aujourd’hui' : capitalize(fmt.dayLong(day))}</h1>
        </div>
      </header>
      <div className="days" role="listbox" aria-label="Jour" style={{ marginTop: 10 }}>
        {days.map((d, i) => {
          const n = st.appointments.filter((a) => sameDay(new Date(a.start), d) && a.status !== 'rescheduled' && a.status !== 'cancelled').length
          return (
            <button key={d.toISOString()} className={`day ${i === offset + 2 ? 'is-selected' : ''}`} onClick={() => setOffset(i - 2)} aria-selected={i === offset + 2}>
              <small>{fmt.date(d, { weekday: 'short' }).replace('.', '')}</small>
              <b>{salon.wall(d).day}</b>
              <i>{n ? `${n} RDV` : '—'}</i>
            </button>
          )
        })}
      </div>
      <div className="timeline stagger">
        {list.length === 0 && <div className="card" style={{ padding: 18, fontSize: 14 }}>Aucun rendez-vous ce jour-là.</div>}
        {list.map((a) => (
          <AppointmentRow key={a.id} a={a} customer={byId(a.customerId)} now={now} highlight={a.id === highlight} />
        ))}
      </div>
    </main>
  )
}
