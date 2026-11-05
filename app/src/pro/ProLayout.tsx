import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { needsHumanCount } from '../domain'
import { Icon, type IconName } from '../ui/Icon'
import { useDemoState } from '../ui/common'
import './pro.css'
import './ops.css'

/**
 * Cinq destinations du quotidien. Voice, Revenue et Réglages vivent dans l'espace NOVIA
 * (et Réglages aussi derrière l'avatar) : jamais huit icônes en bas de l'écran.
 */
const tabs: { to: string; label: string; icon: IconName; end?: boolean; also?: string[] }[] = [
  { to: '/pro', label: 'Accueil', icon: 'home', end: true },
  { to: '/pro/agenda', label: 'Agenda', icon: 'calendar', also: ['/pro/rdv'] },
  { to: '/pro/clientes', label: 'Clientes', icon: 'user', also: ['/pro/cliente'] },
  { to: '/pro/messages', label: 'Messages', icon: 'message' },
  { to: '/pro/novia', label: 'NOVIA', icon: 'sparkle', also: ['/pro/voice', '/pro/revenue', '/pro/reglages'] },
]

export function ProLayout() {
  const { pathname } = useLocation()
  const st = useDemoState()
  const waiting = needsHumanCount(st)
  return (
    <div className="pro">
      <Outlet />
      <nav className="tabbar" aria-label="Navigation professionnelle">
        {tabs.map((t) => {
          const extra = t.also?.some((p) => pathname.startsWith(p))
          return (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive || extra ? 'active' : '')}>
              <span className="tabbar__icon">
                <Icon name={t.icon} size={20} />
                {t.to === '/pro/messages' && waiting > 0 && (
                  <span className="tabbar__badge" aria-label={`${waiting} conversation${waiting > 1 ? 's' : ''} à traiter`}>
                    {waiting}
                  </span>
                )}
              </span>
              {t.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
