import { NavLink, Outlet } from 'react-router-dom'
import { Icon, type IconName } from '../ui/Icon'
import './pro.css'

const tabs: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/pro', label: 'Accueil', icon: 'home', end: true },
  { to: '/pro/agenda', label: 'Agenda', icon: 'calendar' },
  { to: '/pro/novia', label: 'NOVIA', icon: 'sparkle' },
  { to: '/pro/revenue', label: 'Revenue', icon: 'chart' },
]

export function ProLayout() {
  return (
    <div className="pro">
      <Outlet />
      <nav className="tabbar" aria-label="Navigation professionnelle">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <Icon name={t.icon} size={20} />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
