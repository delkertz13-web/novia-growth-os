import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { attendanceState, statusLabels } from '../core/appointmentStatus'
import type { Appointment } from '../core/types'
import { getState, resetDemo, subscribe } from '../providers/mock/store'
import { Icon } from './Icon'

/* ---------------- Hooks ---------------- */

export const useDemoState = () => useSyncExternalStore(subscribe, getState)

/** Horloge partagée : les états « à confirmer » évoluent avec l'heure réelle. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/* ---------------- Formats ---------------- */

export const fmt = {
  time: (d: Date | string) =>
    new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h'),
  dayLong: (d: Date | string) =>
    new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
  dayShort: (d: Date | string) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
  duration: (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}` : `${min} min`),
  eur: (n: number) => `${n.toLocaleString('fr-FR')} €`,
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/* ---------------- Bandeau démo ---------------- */

export function DemoBanner() {
  const { pathname } = useLocation()
  const isPro = pathname.startsWith('/pro')
  const onReset = () => {
    if (window.confirm('Réinitialiser la démonstration ? Toutes les actions effectuées seront effacées.')) resetDemo()
  }
  return (
    <div className="demo-banner" role="note" aria-label="Démonstration NOVIA — données fictives">
      <div className="wrap demo-banner__row">
        <span className="demo-banner__tag">DÉMO</span>
        <span className="demo-banner__text">Démonstration NOVIA — données fictives</span>
        <nav className="demo-banner__switch" aria-label="Changer d’espace">
          <Link to="/" viewTransition className={!isPro ? 'is-active' : ''}>
            Cliente
          </Link>
          <Link to="/pro" viewTransition className={isPro ? 'is-active' : ''}>
            Pro
          </Link>
        </nav>
        <button className="demo-banner__reset" onClick={onReset} aria-label="Réinitialiser la démo" title="Réinitialiser la démo">
          <Icon name="refresh" size={16} />
        </button>
      </div>
    </div>
  )
}

/* ---------------- Badges ---------------- */

export const MockBadge = ({ label = 'Mock' }: { label?: string }) => <span className="badge badge--mock">{label}</span>
export const SimBadge = ({ label = 'Simulation' }: { label?: string }) => <span className="badge badge--sim">{label}</span>

export function StatusPill({ appointment, now, compact }: { appointment: Appointment; now: Date; compact?: boolean }) {
  const state = attendanceState(appointment, now)
  if (state === 'unknown') return <span className="pill pill--unknown">{compact ? 'À confirmer' : 'Présence à confirmer'}</span>
  if (state === 'in_progress') return <span className="pill pill--confirmed">En cours</span>
  return <span className={`pill pill--${appointment.status}`}>{statusLabels[appointment.status]}</span>
}

/* ---------------- Photo ---------------- */

export { Photo } from './Photo'

/* ---------------- Feuille ---------------- */

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" />
        {children}
      </div>
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <Icon name="info" size={16} />
      <div>{children}</div>
    </div>
  )
}

/** Remonte en haut de page à chaque navigation. */
export function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}
