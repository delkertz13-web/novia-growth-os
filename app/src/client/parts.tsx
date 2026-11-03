import { Link } from 'react-router-dom'
import { business } from '../config/business.demo'
import type { ServiceConfig } from '../config/schema'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, Photo } from '../ui/common'

export function ServiceRow({ service: s }: { service: ServiceConfig }) {
  return (
    <Link to={`/reserver?service=${s.id}`} className="svc">
      <Photo imageId={s.coverImageId} />
      <div>
        <div className="svc__name">{s.name}</div>
        <div className="svc__meta">
          <span>{fmt.duration(s.durationMin)}</span>
          {s.deposit > 0 && <span>Acompte {fmt.eur(s.deposit)}</span>}
        </div>
      </div>
      <div className="svc__price">
        {fmt.eur(s.price)}
        <small>prix démo</small>
      </div>
    </Link>
  )
}

const weekdays = [1, 2, 3, 4, 5, 6, 0]

export function HoursCard() {
  const today = new Date().getDay()
  const hours = business.openingHours.value
  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="eyebrow">Horaires</div>
        <span className="badge">Démo</span>
      </div>
      <table className="hours">
        <tbody>
          {weekdays.map((d) => {
            const h = hours[d]
            const name = capitalize(new Date(2026, 10, 1 + ((d + 7) % 7)).toLocaleDateString('fr-FR', { weekday: 'long' }))
            return (
              <tr key={d} className={d === today ? 'is-today' : ''}>
                <td>{name}</td>
                <td>{h ? `${h.open} – ${h.close}` : 'Fermé'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function BackButton({ to, label = 'Retour' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="icon-btn" aria-label={label}>
      <Icon name="arrowLeft" size={18} />
    </Link>
  )
}
