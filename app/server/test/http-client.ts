/** Client HTTP de test : un « appareil » = un pot de cookies. */
import type { AddressInfo } from 'node:net'
import { createNoviaApp } from '../application/novia'
import { createAuth } from '../application/auth'
import { createHttpServer } from '../http/server'
import { createAuthenticator } from './authenticator'
import type { setup } from './fixtures'

export const ORIGIN = 'https://pilote.novia.test'
export const RP_ID = 'pilote.novia.test'

export async function startServer(t: Awaited<ReturnType<typeof setup>>) {
  const app = createNoviaApp({ db: t.db, clock: t.clock })
  const auth = createAuth(t.db, { rpId: RP_ID, rpName: 'NOVIA Pro', origin: ORIGIN }, t.clock)
  const server = createHttpServer({ app, auth, db: t.db, config: { origin: ORIGIN, secureCookies: false, authPerMinute: 1000 } })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { app, auth, base, close: () => new Promise<void>((r) => server.close(() => r())) }
}

/** `authenticator` : passer celui d'un autre appareil = passkey synchronisée (même clé). */
export function device(base: string, authenticator = createAuthenticator(ORIGIN, RP_ID)) {
  let cookie = ''
  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-novia': '1', ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const json = await res.json().catch(() => ({}))
    return { status: res.status, body: json as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  return {
    call,
    get cookie() {
      return cookie
    },
    authenticator,
    /** accepte une invitation : crée la passkey et ouvre la session */
    async acceptInvitation(token: string, displayName = 'Pro test') {
      const o = await call('POST', '/api/auth/invitation/options', { token, displayName })
      if (o.status !== 200) return o
      return call('POST', '/api/auth/invitation/verify', { challengeId: o.body.challengeId, displayName, response: authenticator.register(o.body.options) })
    },
    async login() {
      const o = await call('POST', '/api/auth/login/options', {})
      return call('POST', '/api/auth/login/verify', { challengeId: o.body.challengeId, response: authenticator.login(o.body.options) })
    },
  }
}
