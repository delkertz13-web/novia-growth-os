import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { attendanceState, statusLabels } from '../core/appointmentStatus'
import * as time from '../core/time'
import type { Appointment } from '../core/types'
import { novia } from '../domain'
import { Icon } from './Icon'

/* ---------------- Hooks ---------------- */

/** Instantané métier courant, relu à chaque changement (via le domaine NOVIA). */
export const useDemoState = () => useSyncExternalStore(novia.subscribe, novia.snapshot)

/**
 * « Maintenant » selon l'horloge NOVIA. En démo, l'heure de référence ne bouge pas :
 * aucun minuteur. Avec une horloge système, relue toutes les 30 s.
 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => novia.now())
  useEffect(() => {
    if (novia.clockMode === 'demo') return
    const t = setInterval(() => setNow(novia.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/* ---------------- Formats ---------------- */

/** Toutes les dates s'affichent et se comparent dans le fuseau du SALON, jamais celui de l'appareil. */
const tz = novia.timeZone

export const fmt = {
  time: (d: Date | string) => time.formatIn(d, tz, { hour: '2-digit', minute: '2-digit' }).replace(':', 'h'),
  dayLong: (d: Date | string) => time.formatIn(d, tz, { weekday: 'long', day: 'numeric', month: 'long' }),
  dayShort: (d: Date | string) => time.formatIn(d, tz, { weekday: 'short', day: 'numeric', month: 'short' }),
  /** formatage libre, toujours dans le fuseau du salon */
  date: (d: Date | string, options: Intl.DateTimeFormatOptions) => time.formatIn(d, tz, options),
  duration: (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}` : `${min} min`),
  eur: (n: number) => `${n.toLocaleString('fr-FR')} €`,
}

/** Calendrier du salon pour l'interface (jour, heure murale, jours suivants). */
export const salon = {
  sameDay: (a: Date, b: Date) => time.sameDay(a, b, tz),
  startOfDay: (d: Date) => time.startOfDay(d, tz),
  addDays: (d: Date, n: number) => time.addDays(d, n, tz),
  wall: (d: Date) => time.wall(d, tz),
  dayKey: (d: Date) => time.dayKey(d, tz),
  daysBetween: (a: Date, b: Date) => time.daysBetween(a, b, tz),
  monthOf: (d: Date) => time.monthOf(d, tz),
  parseDayKey: (key: string) => time.parseWall(key, tz),
}

export const sameDay = salon.sameDay

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/* ---------------- Bandeau démo : voir ./demo.tsx ---------------- */


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
