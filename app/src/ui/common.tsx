import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { galleryById, galleryCategories, lengthLabels, shapeLabels } from '../config/content.demo'
import type { GalleryItem } from '../config/schema'
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
    if (window.confirm('Réinitialiser la démonstration ? Toutes les actions effectuées seront effacées.')) resetDemo()
  }
  return (
    <div className="demo-banner" role="note" aria-label="Démonstration NOVIA — données fictives">
      <div className="wrap demo-banner__row">
        <span className="demo-banner__tag">DÉMO</span>
        <span className="demo-banner__text">Démonstration NOVIA — données fictives</span>
        <nav className="demo-banner__switch" aria-label="Changer d’espace">
          <Link to="/" className={!isPro ? 'is-active' : ''}>
            Cliente
          </Link>
          <Link to="/pro" className={isPro ? 'is-active' : ''}>
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

export function StatusPill({ appointment, now }: { appointment: Appointment; now: Date }) {
  const state = attendanceState(appointment, now)
  if (state === 'unknown') return <span className="pill pill--unknown">Présence à confirmer</span>
  if (state === 'in_progress') return <span className="pill pill--confirmed">En cours</span>
  return <span className={`pill pill--${appointment.status}`}>{statusLabels[appointment.status]}</span>
}

/* ---------------- Photo / placeholder ---------------- */

const categoryLabel = (id: GalleryItem['category']) => galleryCategories.find((c) => c.id === id)?.label ?? ''

/**
 * Visuel réel si `src` est renseigné dans la configuration,
 * sinon emplacement temporaire clairement identifié.
 */
export function Photo({
  item,
  imageId,
  className = '',
  eager,
  sizes,
}: {
  item?: GalleryItem
  imageId?: string
  className?: string
  eager?: boolean
  sizes?: string
}) {
  const g = item ?? (imageId ? galleryById(imageId) : undefined)
  if (g?.src) {
    return (
      <div className={`photo ${className}`}>
        <img src={g.src} alt={g.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" sizes={sizes} />
      </div>
    )
  }
  return (
    <div className={`photo photo--ph ${className}`} role="img" aria-label={g ? `Emplacement photo : ${g.alt}` : 'Emplacement photo'}>
      <Icon name="camera" size={26} className="photo__ph-icon" />
      {g && (
        <div className="photo__ph-label">
          <span>
            Visuel à fournir · {categoryLabel(g.category)} · {shapeLabels[g.shape]} {lengthLabels[g.length].toLowerCase()}
          </span>
        </div>
      )}
    </div>
  )
}

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
