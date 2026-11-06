import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { needsHumanCount } from '../domain'
import { Icon } from '../ui/Icon'
import { proTabs as tabs } from './nav'
import { useDemoState } from '../ui/common'
import './pro.css'
import './ops.css'

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
