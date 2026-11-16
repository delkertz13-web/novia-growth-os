/** Petits composants partagés des écrans de préparation du pilote. */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Icon } from '../../ui/Icon'
import { PILOT_STATUSES, statusText, type PilotStatus } from '../onboarding'
import { pilotApi } from '../client'
import './pilot.css'

export const isOwner = () => pilotApi.role() === 'OWNER'

const links: [string, string][] = [
  ['/pro/pilote', 'Pilote'],
  ['/pro/pilote/preparation', 'Préparation'],
  ['/pro/pilote/readiness', 'Readiness'],
  ['/pro/pilote/messages', 'Messages'],
  ['/pro/pilote/faq', 'FAQ'],
  ['/pro/pilote/shadow', 'Shadow'],
  ['/pro/pilote/saisie', 'Saisie'],
  ['/pro/pilote/import', 'Import'],
  ['/pro/pilote/resume', 'Résumé'],
]

export function PilotPage({ title, eyebrow = 'Pilote · préparation', children, back = '/pro/novia' }: { title: string; eyebrow?: string; children: ReactNode; back?: string }) {
  return (
    <main className="wrap page pl">
      <header className="p-head">
        <Link to={back} className="icon-btn pl-noprint" aria-label="Retour">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <div>
          <div className="p-head__date">{eyebrow}</div>
          <h1 className="display">{title}</h1>
        </div>
      </header>
      <nav className="pl-nav pl-noprint" aria-label="Préparation du pilote">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => `chip chip--sm ${isActive ? 'is-active' : ''}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      {children}
    </main>
  )
}

export function StatusTag({ status }: { status: string }) {
  const text = (statusText as Record<string, string>)[status] ?? status
  return <span className={`pl-tag pl-tag--${status}`}>{text}</span>
}

/** Inconnu / Estimé / Vérifié : toujours visible, jamais implicite. */
export function StatusPicker({ value, onChange, disabled, label }: { value: PilotStatus; onChange: (s: PilotStatus) => void; disabled?: boolean; label: string }) {
  return (
    <div className="pl-status" role="group" aria-label={`Statut : ${label}`}>
      {PILOT_STATUSES.map((s) => (
        <button key={s} type="button" className={`is-${s}`} aria-pressed={value === s} disabled={disabled} onClick={() => onChange(s)}>
          {statusText[s]}
        </button>
      ))}
    </div>
  )
}

/** Chargement d'une ressource de l'API, avec relecture. */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    try {
      setData(await load())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.')
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, error, reload }
}

/** Action d'enregistrement : occupé, message d'erreur ou de succès. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = async <T,>(work: () => Promise<T>, okText: string | ((v: T) => string) = 'Enregistré.') => {
    setBusy(true)
    setMsg(null)
    try {
      const v = await work()
      setMsg({ ok: true, text: typeof okText === 'function' ? okText(v) : okText })
      return true
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Erreur inattendue.' })
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, msg, run, setMsg }
}

export function ActionMsg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return (
    <p className={`pl-msg ${msg.ok ? 'pl-msg--ok' : 'pl-msg--error'}`} role={msg.ok ? 'status' : 'alert'}>
      {msg.text}
    </p>
  )
}

export function OwnerOnly() {
  return <p className="pl-msg">Lecture seule : seule la propriétaire du compte modifie ces informations.</p>
}

export function Loading({ error }: { error: string }) {
  return error ? <p className="pl-msg pl-msg--error">{error}</p> : <p className="pl-msg">Chargement…</p>
}
