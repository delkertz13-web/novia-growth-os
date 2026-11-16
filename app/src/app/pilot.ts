/**
 * Composition NOVIA_MODE=pilot (P2) : le navigateur est un CLIENT de l'API NOVIA.
 *
 * - le serveur (PostgreSQL) est la source de vérité : clientes, RDV, consentement,
 *   séquences, décisions ; le navigateur n'en garde qu'une copie d'affichage en mémoire ;
 * - connexion par passkey (cookie de session HttpOnly), entreprise imposée par le serveur ;
 * - exécution SHADOW côté serveur : NOVIA décide et n'envoie rien ;
 * - aucun provider dans le navigateur : ni SMS, ni appel, ni paiement.
 *
 * `novia` n'existe qu'après `bootstrap()` (main.tsx charge les écrans ensuite).
 * N'importe RIEN de src/demo (vérifié par architecture.test.ts).
 */
import { createNovia, type Novia, type PaymentWording } from '../domain/intents'
import { api, ApiError, type Me } from '../pilot/api'
import { createRemoteEngine, type PilotSnapshot, type PilotTransport } from '../pilot/remote'
import { setPilotSession } from '../pilot/session'

export const mode = 'pilot' as const

export let novia: Novia = undefined as unknown as Novia

/** Paiement DÉCLARÉ par la professionnelle : NOVIA n'encaisse rien et ne vérifie rien. */
export const paymentWording: PaymentWording = {
  action: 'Déclarer payé → CA confirmé',
  actionShort: 'Déclarer payé',
  done: 'Déclaré payé : CA confirmé.',
  note: 'Vous déclarez avoir été payée. NOVIA n’encaisse rien et ne vérifie aucun paiement.',
  kpiFootnote: 'Aucun montant n’est encaissé par NOVIA : le CA confirmé repose sur vos déclarations de paiement.',
}

export type Boot =
  | { status: 'ready' }
  | { status: 'signed-out' }
  | { status: 'invitation'; token: string }
  | { status: 'choose'; businesses: Me['businesses'] }
  | { status: 'no-business' }
  | { status: 'error'; message: string }

/** Préférence d'affichage (non métier) : l'entreprise choisie sur cet appareil. */
const CHOICE = 'novia-pilot-business'
const POLL_MS = 20_000

export function httpTransport(businessId: string): PilotTransport {
  const base = `/api/b/${encodeURIComponent(businessId)}`
  return {
    state: () => api<PilotSnapshot>(`${base}/state`),
    revision: async () => (await api<{ revision: number }>(`${base}/revision`)).revision,
    command: (draft) => api(`${base}/commands`, { method: 'POST', body: draft }),
  }
}

export function chooseBusiness(id: string) {
  try {
    localStorage.setItem(CHOICE, id)
  } catch {
    /* préférence facultative */
  }
}

export async function bootstrap(): Promise<Boot> {
  if (location.pathname === '/invitation') {
    const token = location.hash.slice(1)
    if (token) return { status: 'invitation', token }
  }
  try {
    const me = await api<Me>('/api/me')
    if (!me.businesses.length) return { status: 'no-business' }
    let chosen: string | null = null
    try {
      chosen = localStorage.getItem(CHOICE)
    } catch {
      /* ignore */
    }
    const business = me.businesses.find((b) => b.id === chosen) ?? (me.businesses.length === 1 ? me.businesses[0] : undefined)
    if (!business) return { status: 'choose', businesses: me.businesses }

    const transport = httpTransport(business.id)
    const remote = createRemoteEngine(await transport.state(), transport)
    novia = createNovia(remote.engine)
    setPilotSession({ user: me.user, business, businesses: me.businesses, sync: () => remote.sync().then(() => undefined) })

    // multi-appareils : relecture régulière et au retour sur l'onglet
    const sync = () => void remote.sync().catch(() => undefined)
    setInterval(() => document.visibilityState === 'visible' && sync(), POLL_MS)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync())
    window.addEventListener('focus', sync)
    return { status: 'ready' }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { status: 'signed-out' }
    return { status: 'error', message: e instanceof Error ? e.message : 'Erreur inattendue.' }
  }
}
