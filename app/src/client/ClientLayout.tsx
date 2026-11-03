import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { business } from '../config/business.demo'
import './client.css'

export function ClientHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header className={`c-header ${overlay ? 'c-header--overlay' : ''}`}>
      <div className="wrap c-header__row">
        <NavLink to="/" className="brand" aria-label={`${business.name.value} — accueil`}>
          {business.name.value}
        </NavLink>
        <nav className="c-nav" aria-label="Navigation principale">
          <NavLink to="/galerie" className="c-nav__keep">
            Réalisations
          </NavLink>
          <NavLink to="/prestations">Prestations</NavLink>
          <NavLink to="/infos">Infos</NavLink>
          <NavLink to="/reserver" className="btn btn--sm btn--primary c-nav__cta" style={{ color: 'var(--porcelain)' }}>
            Réserver
          </NavLink>
        </nav>
      </div>
    </header>
  )
}

export function ClientLayout() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const isFlow = pathname.startsWith('/reserver')
  return (
    <>
      {!isHome && !isFlow && <ClientHeader />}
      <Outlet />
    </>
  )
}

export function ClientFooter() {
  return (
    <footer className="c-footer">
      <div className="wrap">
        <p style={{ margin: '0 0 6px' }}>
          {business.name.value} — identité de démonstration. Coordonnées, prestations, prix, visuels et avis sont fictifs.
        </p>
        <p style={{ margin: 0 }}>Propulsé par NOVIA · aucune réservation réelle n’est créée.</p>
      </div>
    </footer>
  )
}
