/**
 * API NOVIA (HTTP, `node:http`, sans framework). Couvre UNIQUEMENT ce dont NOVIA Pro a
 * besoin en pilote : authentification, état de l'entreprise, commandes, événements de test,
 * décisions shadow, audit, export / anonymisation, invitations, profil.
 *
 * Toute route /api/b/:businessId/… vérifie la session ET l'appartenance de l'utilisatrice
 * à cette entreprise, lue en base à chaque requête : le navigateur ne choisit jamais son
 * entreprise. Les opérations passent par l'application (moteur), jamais par du SQL ici.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import type { BusinessProfile } from '../../src/config/profile'
import type { NoviaApp } from '../application/novia'
import { AuthError, SESSION_DAYS, type Auth, type SessionUser } from '../application/auth'
import { BusinessNotFound, type Db } from '../infra/db'
import { ProfileError, listBusinessesOf, saveProfile } from '../repositories/business'
import { InputError, parseCommand, parseTestEvent } from './validate'
import { OnboardingError } from '../../src/pilot/onboarding'
import { PilotError } from '../repositories/pilot'
import { pilotRoutes } from './pilot-routes'
import { systemClock, type ServerClock } from '../infra/shadow-providers'

export interface HttpConfig {
  origin: string
  /** cookies `Secure` (toujours en production ; désactivable en local http) */
  secureCookies: boolean
  /** dossier du front pilote construit (servi sur la même origine) */
  staticDir?: string
  log?: (line: Record<string, unknown>) => void
  /** requêtes d'authentification par minute et par adresse IP (20 par défaut) */
  authPerMinute?: number
  /**
   * Jeton du déclencheur CRON (Scaleway : POST / avec {"token": "..."} chaque minute).
   * Absent : la route n'existe pas. Le minuteur interne reste actif en complément.
   */
  cronToken?: string
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const COOKIE = 'novia_session'
const MAX_BODY = 64 * 1024

/* ---------------- Limitation de débit (en mémoire, une instance) ---------------- */

function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  return (key: string) => {
    const now = Date.now()
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    list.push(now)
    hits.set(key, list)
    if (hits.size > 10_000) hits.clear()
    if (list.length > limit) throw new HttpError(429, 'Trop de requêtes : réessayez dans une minute.')
  }
}

/* ---------------- Utilitaires ---------------- */

async function readJson(req: IncomingMessage, max = MAX_BODY): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > max) throw new HttpError(413, 'Requête trop volumineuse.')
    chunks.push(c as Buffer)
  }
  if (!size) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'JSON invalide.')
  }
}

const cookieOf = (req: IncomingMessage, name: string) =>
  (req.headers.cookie ?? '')
    .split(';')
    .map((p) => p.trim().split('='))
    .find(([k]) => k === name)?.[1]

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

const sameSecret = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

export function createHttpServer(deps: { app: NoviaApp; auth: Auth; db: Db; config: HttpConfig; clock?: ServerClock; tick?: () => Promise<unknown> }) {
  const { app, auth, db, config } = deps
  const clock = deps.clock ?? systemClock
  const cronLimit = rateLimiter(10, 60_000)
  const log = config.log ?? (() => undefined)
  const authLimit = rateLimiter(config.authPerMinute ?? 20, 60_000)
  const apiLimit = rateLimiter(240, 60_000)

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
    res.end(JSON.stringify(body))
  }
  const sessionCookie = (value: string, maxAge: number) =>
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookies ? '; Secure' : ''}`

  /** Utilisatrice connectée, sinon 401. */
  async function requireUser(req: IncomingMessage): Promise<SessionUser> {
    const user = await auth.sessionUser(cookieOf(req, COOKIE))
    if (!user) throw new HttpError(401, 'Connexion requise.')
    return user
  }
  /** Appartenance à l'entreprise demandée (et rôle), sinon 403 (sans dire si elle existe). */
  function requireMember(user: SessionUser, businessId: string, role?: 'OWNER') {
    const m = user.memberships.find((x) => x.businessId === businessId)
    if (!m || (role && m.role !== role)) throw new HttpError(403, 'Accès refusé.')
    return m
  }

  /** journaux sans identifiant d'entreprise ni de cliente */
  const maskPath = (p: string) => p.replace(/\/(b|customers)\/[^/]+/g, '/$1/:id')

  async function route(req: IncomingMessage, res: ServerResponse, url: URL) {
    const method = req.method ?? 'GET'
    const path = url.pathname
    const ip = req.socket.remoteAddress ?? '?'

    // Déclencheur CRON (sans cookie ni en-tête NOVIA : authentifié par son jeton seul)
    if (path === '/' && method === 'POST' && config.cronToken && deps.tick) {
      cronLimit(ip)
      const body = (await readJson(req, 4096)) as Record<string, unknown>
      if (typeof body.token !== 'string' || !sameSecret(body.token, config.cronToken)) throw new HttpError(403, 'Refusé.')
      await deps.tick()
      return send(res, 200, { ok: true })
    }

    // CSRF : toute écriture exige l'en-tête NOVIA et une origine identique (cookie SameSite=Strict en plus)
    if (method !== 'GET' && method !== 'HEAD') {
      if (req.headers['x-novia'] !== '1') throw new HttpError(403, 'Requête refusée.')
      const origin = req.headers.origin
      if (origin && origin !== config.origin) throw new HttpError(403, 'Origine refusée.')
    }

    if (path === '/api/health') return send(res, 200, { ok: true })

    /* ---------- Authentification ---------- */
    if (path.startsWith('/api/auth/')) {
      authLimit(ip)
      const body = method === 'POST' ? ((await readJson(req)) as Record<string, unknown>) : {}
      if (path === '/api/auth/invitation/options' && method === 'POST') {
        if (typeof body.token !== 'string' || typeof body.displayName !== 'string') throw new InputError('Invitation invalide.')
        return send(res, 200, await auth.registrationOptions(body.token, body.displayName))
      }
      if (path === '/api/auth/invitation/verify' && method === 'POST') {
        if (typeof body.challengeId !== 'string' || typeof body.displayName !== 'string' || typeof body.response !== 'object') throw new InputError('Réponse invalide.')
        const r = await auth.register(body.challengeId, body.displayName, body.response as never)
        return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(r.session, SESSION_DAYS * 86_400) })
      }
      if (path === '/api/auth/login/options' && method === 'POST') return send(res, 200, await auth.loginOptions())
      if (path === '/api/auth/login/verify' && method === 'POST') {
        if (typeof body.challengeId !== 'string' || typeof body.response !== 'object') throw new InputError('Réponse invalide.')
        const r = await auth.login(body.challengeId, body.response as never)
        return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(r.session, SESSION_DAYS * 86_400) })
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        await auth.logout(cookieOf(req, COOKIE))
        return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie('', 0) })
      }
      throw new HttpError(404, 'Introuvable.')
    }

    if (path === '/api/me' && method === 'GET') {
      const user = await requireUser(req)
      return send(res, 200, { user: { id: user.id, displayName: user.displayName }, businesses: await listBusinessesOf(db, user.id) })
    }

    /* ---------- Entreprise ---------- */
    const m = /^\/api\/b\/([a-z0-9-]{3,40})(\/.*)$/.exec(path)
    if (m) {
      const [, businessId, sub] = m
      const user = await requireUser(req)
      apiLimit(user.id)
      const member = requireMember(user, businessId)
      const actor = { type: 'user' as const, id: user.id }

      if (sub === '/state' && method === 'GET') {
        const s = await app.snapshot(businessId)
        return send(res, 200, { ...s, role: member.role, serverTime: new Date().toISOString() })
      }
      if (sub === '/revision' && method === 'GET') return send(res, 200, { revision: await app.revision(businessId) })
      if (sub === '/commands' && method === 'POST') {
        const draft = parseCommand(await readJson(req))
        // provenance posée par le serveur selon le rôle, jamais par le navigateur
        const r = await app.command(businessId, actor, draft, {}, member.role === 'OWNER' ? 'OWNER_MANUAL' : 'PRO_MANUAL')
        return send(res, 200, { result: r.value, revision: r.revision })
      }
      // préparation du pilote, Shadow Control Center, avis, métriques, import
      const handled = await pilotRoutes({
        app,
        businessId,
        sub,
        method,
        url,
        role: member.role,
        userId: user.id,
        now: () => clock.now(),
        body: async (max) => (await readJson(req, max)) as Record<string, unknown>,
        send: (status, body) => send(res, status, body),
        forbid: () => {
          throw new HttpError(403, 'Réservé à la propriétaire.')
        },
      })
      if (handled) return

      // ----- réservé à la propriétaire -----
      if (sub === '/test-events' && method === 'POST') {
        requireMember(user, businessId, 'OWNER')
        const r = await app.ingest(businessId, { type: 'test', id: user.id }, parseTestEvent(await readJson(req)))
        return send(res, 200, { result: r.value, revision: r.revision })
      }
      if (sub === '/audit' && method === 'GET') {
        requireMember(user, businessId, 'OWNER')
        return send(res, 200, { entries: await app.auditLog(businessId, limitOf(url)) })
      }
      if (sub === '/invitations' && method === 'POST') {
        requireMember(user, businessId, 'OWNER')
        const body = (await readJson(req)) as Record<string, unknown>
        const role = body.role === 'OWNER' ? 'OWNER' : 'PRO'
        const t = await auth.createInvitation(businessId, role, typeof body.label === 'string' ? body.label : 'Appareil', `user:${user.id}`)
        return send(res, 200, { url: `${config.origin}/invitation#${t}` })
      }
      if (sub === '/profile' && method === 'PUT') {
        requireMember(user, businessId, 'OWNER')
        const body = (await readJson(req)) as { profile?: BusinessProfile }
        await db.businessTx(businessId, (c) => saveProfile(c, businessId, body.profile as BusinessProfile, actor))
        return send(res, 200, { ok: true })
      }
      const cm = /^\/customers\/([A-Za-z0-9_-]{1,80})\/(export|anonymize)$/.exec(sub)
      if (cm) {
        requireMember(user, businessId, 'OWNER')
        const [, customerId, op] = cm
        if (op === 'export' && method === 'GET') {
          const r = await app.exportCustomerData(businessId, actor, customerId)
          if (!r.value) throw new HttpError(404, 'Cliente introuvable.')
          return send(res, 200, r.value, { 'content-disposition': `attachment; filename="cliente-${customerId}.json"` })
        }
        if (op === 'anonymize' && method === 'POST') {
          const body = (await readJson(req)) as Record<string, unknown>
          if (body.confirm !== customerId) throw new InputError('Confirmation requise (identifiant de la cliente).')
          const r = await app.anonymizeCustomerData(businessId, actor, customerId)
          if (!r.value) throw new HttpError(404, 'Cliente introuvable.')
          return send(res, 200, { ok: true, revision: r.revision })
        }
      }
      throw new HttpError(404, 'Introuvable.')
    }

    if (path.startsWith('/api/')) throw new HttpError(404, 'Introuvable.')
    return serveStatic(res, path)
  }

  /** CSP stricte : seuls les scripts en ligne du build (empreinte SHA-256) sont autorisés */
  const csp = (() => {
    const index = config.staticDir && existsSync(join(config.staticDir, 'index.html')) ? readFileSync(join(config.staticDir, 'index.html'), 'utf8') : ''
    const hashes = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
    return `default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
  })()

  function serveStatic(res: ServerResponse, path: string) {
    if (!config.staticDir) throw new HttpError(404, 'Introuvable.')
    const root = config.staticDir
    const safe = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '')
    let file = join(root, safe)
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
    const ext = extname(file)
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'content-security-policy': csp,
    })
    createReadStream(file).pipe(res)
  }

  return createServer(async (req, res) => {
    const started = Date.now()
    const url = new URL(req.url ?? '/', 'http://localhost')
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('referrer-policy', 'same-origin')
    res.setHeader('x-frame-options', 'DENY')
    if (config.secureCookies) res.setHeader('strict-transport-security', 'max-age=31536000')
    try {
      await route(req, res, url)
    } catch (e) {
      const status =
        e instanceof HttpError ? e.status : e instanceof InputError || e instanceof ProfileError || e instanceof OnboardingError || e instanceof PilotError ? 400 : e instanceof AuthError ? 401 : e instanceof BusinessNotFound ? 404 : 500
      // aucune donnée personnelle ni détail interne dans la réponse ou dans le journal technique
      const message = status === 500 ? 'Erreur interne.' : e instanceof Error ? e.message : 'Erreur.'
      if (status === 500) log({ level: 'error', path: maskPath(url.pathname), error: e instanceof Error ? e.name : 'unknown' })
      if (!res.headersSent) send(res, status, { error: message })
    } finally {
      log({ level: 'info', method: req.method, path: url.pathname.startsWith('/api/') ? maskPath(url.pathname) : 'static', status: res.statusCode, ms: Date.now() - started })
    }
  })
}

const limitOf = (url: URL) => Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100))
