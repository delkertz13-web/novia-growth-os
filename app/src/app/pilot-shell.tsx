/**
 * Habillage NOVIA_MODE=pilot : bandeau « Pilote · mode shadow » et écrans d'accès
 * (connexion par passkey, invitation, choix de l'entreprise). Aucun contrôle de démo.
 * N'importe pas le domaine : ces écrans s'affichent AVANT que l'état soit chargé.
 */
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { useState, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { api } from '../pilot/api'
import { pilotSession } from '../pilot/session'
import { chooseBusiness, type Boot } from './pilot'

export function Shell() {
  const s = pilotSession()
  const [busy, setBusy] = useState(false)
  return (
    <>
      <div className="demo-banner" role="status">
        <div className="demo-banner__row">
          <span className="demo-banner__tag">PILOTE</span>
          <span className="demo-banner__text">
            {s?.business.name || s?.business.id} · mode shadow : NOVIA décide, rien n’est envoyé
          </span>
          <button
            className="demo-banner__reset"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
              location.replace('/pro')
            }}
          >
            Déconnexion
          </button>
        </div>
      </div>
      <Outlet />
    </>
  )
}

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '48px 20px', display: 'grid', gap: 16 }}>
      <p className="muted" style={{ letterSpacing: '.12em', fontSize: 12, fontWeight: 600 }}>
        NOVIA PRO · PILOTE
      </p>
      <h1 className="display" style={{ fontSize: 32, margin: 0 }}>
        {title}
      </h1>
      {children}
    </main>
  )
}

const restart = () => location.replace('/pro')

function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      // annulation de la passkey par l'utilisatrice : message simple
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Opération annulée.' : e instanceof Error ? e.message : 'Erreur inattendue.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function Login() {
  const { busy, error, run } = useAction()
  return (
    <Page title="Connexion">
      <p className="muted">Connectez-vous avec la passkey de cet appareil (Face ID, Touch ID ou code). Aucun mot de passe.</p>
      <button
        className="btn btn--primary btn--block"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const { challengeId, options } = await api<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('/api/auth/login/options', { method: 'POST', body: {} })
            const response = await startAuthentication({ optionsJSON: options })
            await api('/api/auth/login/verify', { method: 'POST', body: { challengeId, response } })
            restart()
          })
        }
      >
        Se connecter avec une passkey
      </button>
      {error && <p className="field__error">{error}</p>}
      <p className="muted" style={{ fontSize: 13 }}>
        Premier accès ? Ouvrez le lien d’invitation reçu de NOVIA sur cet appareil.
      </p>
    </Page>
  )
}

function Invitation({ token }: { token: string }) {
  const [name, setName] = useState('')
  const { busy, error, run } = useAction()
  return (
    <Page title="Invitation">
      <p className="muted">Créez la passkey de cet appareil. Elle remplace tout mot de passe ; sur iPhone, elle est synchronisée par le trousseau iCloud.</p>
      <div className="field">
        <label htmlFor="pilot-name">Votre prénom</label>
        <input id="pilot-name" value={name} maxLength={60} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
      </div>
      <button
        className="btn btn--primary btn--block"
        disabled={busy || !name.trim()}
        onClick={() =>
          run(async () => {
            const { challengeId, options, displayName } = await api<{ challengeId: string; displayName: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>(
              '/api/auth/invitation/options',
              { method: 'POST', body: { token, displayName: name } },
            )
            const response = await startRegistration({ optionsJSON: options })
            await api('/api/auth/invitation/verify', { method: 'POST', body: { challengeId, displayName, response } })
            // le jeton d'invitation ne reste pas dans l'historique du navigateur
            history.replaceState(null, '', '/pro')
            restart()
          })
        }
      >
        Créer ma passkey
      </button>
      {error && <p className="field__error">{error}</p>}
    </Page>
  )
}

function Choose({ businesses }: { businesses: { id: string; name: string; role: string }[] }) {
  return (
    <Page title="Établissement">
      {businesses.map((b) => (
        <button
          key={b.id}
          className="btn btn--ghost btn--block"
          onClick={() => {
            chooseBusiness(b.id)
            restart()
          }}
        >
          {b.name || b.id} · {b.role === 'OWNER' ? 'propriétaire' : 'professionnelle'}
        </button>
      ))}
    </Page>
  )
}

/** Écran d'accès quand l'état n'est pas (encore) chargé. */
export function Gate({ boot }: { boot: Boot }) {
  switch (boot.status) {
    case 'signed-out':
      return <Login />
    case 'invitation':
      return <Invitation token={boot.token} />
    case 'choose':
      return <Choose businesses={boot.businesses} />
    case 'no-business':
      return (
        <Page title="Aucun établissement">
          <p className="muted">Ce compte n’est rattaché à aucun établissement. Demandez une invitation à NOVIA.</p>
        </Page>
      )
    case 'error':
      return (
        <Page title="Connexion impossible">
          <p className="muted">{boot.message}</p>
          <button className="btn btn--primary btn--block" onClick={restart}>
            Réessayer
          </button>
        </Page>
      )
    default:
      return null
  }
}
