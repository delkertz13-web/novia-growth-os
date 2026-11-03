import { useState } from 'react'
import { capitalize, fmt, sameDay, useDemoState, useNow } from '../ui/common'
import { AppointmentRow } from './parts'

export function Agenda() {
  const st = useDemoState()
  const now = useNow()
  const [offset, setOffset] = useState(0)
  const days = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + i - 2)
    return d
  })
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
              <small>{d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</small>
              <b>{d.getDate()}</b>
              <i>{n ? `${n} RDV` : '—'}</i>
            </button>
          )
        })}
      </div>
      <div className="timeline stagger">
        {list.length === 0 && <div className="card" style={{ padding: 18, fontSize: 14 }}>Aucun rendez-vous ce jour-là.</div>}
        {list.map((a) => (
          <AppointmentRow key={a.id} a={a} customer={byId(a.customerId)} now={now} />
        ))}
      </div>
    </main>
  )
}
