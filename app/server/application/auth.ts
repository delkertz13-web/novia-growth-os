/**
 * Authentification de la professionnelle : PASSKEYS (WebAuthn), sans mot de passe, sans
 * e-mail ni SMS (aucun fournisseur externe), résistantes à l'hameçonnage. Une passkey
 * créée sur iPhone est synchronisée par le trousseau iCloud sur ses autres appareils.
 *
 * Entrée : une INVITATION à usage unique (lien remis à la main par l'exploitant, ou créé
 * par la propriétaire depuis un appareil déjà connecté). L'invitation fixe l'entreprise et
 * le rôle : le navigateur ne choisit jamais son entreprise.
 *
 * Session : jeton aléatoire de 256 bits dans un cookie HttpOnly / Secure / SameSite=Strict ;
 * seule son empreinte SHA-256 est en base. Expiration : 30 jours.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import type { Db } from '../infra/db'
import { audit } from '../repositories/audit'

export const SESSION_DAYS = 30
const CHALLENGE_MS = 5 * 60_000
const INVITATION_HOURS = 72

export interface AuthConfig {
  rpId: string
  rpName: string
  origin: string
}

export class AuthError extends Error {}

const sha = (token: string) => createHash('sha256').update(token).digest()
const token = () => randomBytes(32).toString('base64url')

export interface SessionUser {
  id: string
  displayName: string
  memberships: { businessId: string; role: 'OWNER' | 'PRO' }[]
}

export function createAuth(db: Db, cfg: AuthConfig, clock: { now(): Date }) {
  const now = () => clock.now()

  /** Invitation à usage unique (le jeton n'est montré qu'une fois). */
  async function createInvitation(businessId: string, role: 'OWNER' | 'PRO', label: string, createdBy: string) {
    const t = token()
    await db.tx(async (c) => {
      const b = await c.query('select 1 from businesses where id = $1', [businessId])
      if (!b.rowCount) throw new AuthError('Entreprise inconnue.')
      await c.query('insert into invitations (token_hash, business_id, role, label, created_by, expires_at) values ($1,$2,$3,$4,$5,$6)', [
        sha(t),
        businessId,
        role,
        label.slice(0, 80),
        createdBy,
        new Date(now().getTime() + INVITATION_HOURS * 3_600_000),
      ])
      await c.query(`select set_config('novia.business_id', $1, true)`, [businessId])
      await audit(c, businessId, { type: createdBy.startsWith('user:') ? 'user' : 'system', id: createdBy }, 'invitation.created', null, { role })
    })
    return t
  }

  async function validInvitation(invitationToken: string) {
    const r = await db.pool.query('select * from invitations where token_hash = $1', [sha(invitationToken)])
    const inv = r.rows[0]
    if (!inv || inv.used_at || new Date(inv.expires_at).getTime() < now().getTime()) throw new AuthError('Invitation invalide ou expirée.')
    return inv
  }

  async function registrationOptions(invitationToken: string, displayName: string) {
    const inv = await validInvitation(invitationToken)
    const name = displayName.trim().slice(0, 60) || 'Professionnelle'
    const options = await generateRegistrationOptions({
      rpName: cfg.rpName,
      rpID: cfg.rpId,
      userName: name,
      userDisplayName: name,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    })
    const id = randomUUID()
    await db.pool.query('insert into auth_challenges (id, challenge, purpose, invitation_hash, expires_at) values ($1,$2,$3,$4,$5)', [
      id,
      options.challenge,
      'register',
      inv.token_hash,
      new Date(now().getTime() + CHALLENGE_MS),
    ])
    return { challengeId: id, options, displayName: name }
  }

  async function takeChallenge(id: string, purpose: 'register' | 'login') {
    const r = await db.pool.query('delete from auth_challenges where id = $1 and purpose = $2 returning *', [id, purpose])
    const ch = r.rows[0]
    if (!ch || new Date(ch.expires_at).getTime() < now().getTime()) throw new AuthError('Défi expiré : recommencez.')
    return ch
  }

  async function newSession(c: { query: Db['pool']['query'] }, userId: string) {
    const t = token()
    await c.query('insert into sessions (token_hash, user_id, expires_at) values ($1,$2,$3)', [sha(t), userId, new Date(now().getTime() + SESSION_DAYS * 86_400_000)])
    return t
  }

  async function register(challengeId: string, displayName: string, response: RegistrationResponseJSON) {
    const ch = await takeChallenge(challengeId, 'register')
    const v = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: cfg.origin, expectedRPID: cfg.rpId, requireUserVerification: false }).catch(() => {
      throw new AuthError('Passkey refusée.')
    })
    if (!v.verified) throw new AuthError('Passkey refusée.')
    const cred = v.registrationInfo.credential
    return db.tx(async (c) => {
      // l'invitation est consommée dans la même transaction (usage unique, même en concurrence)
      const inv = (await c.query('update invitations set used_at = now() where token_hash = $1 and used_at is null and expires_at > $2 returning *', [ch.invitation_hash, now()])).rows[0]
      if (!inv) throw new AuthError('Invitation invalide ou expirée.')
      const userId = randomUUID()
      await c.query('insert into users (id, display_name) values ($1,$2)', [userId, displayName.trim().slice(0, 60) || 'Professionnelle'])
      await c.query('update invitations set used_by = $2 where token_hash = $1', [ch.invitation_hash, userId])
      await c.query('insert into memberships (user_id, business_id, role) values ($1,$2,$3)', [userId, inv.business_id, inv.role])
      await c.query('insert into webauthn_credentials (id, user_id, public_key, counter, transports) values ($1,$2,$3,$4,$5)', [
        cred.id,
        userId,
        Buffer.from(cred.publicKey),
        cred.counter,
        cred.transports ?? [],
      ])
      await c.query(`select set_config('novia.business_id', $1, true)`, [inv.business_id])
      await audit(c, inv.business_id, { type: 'user', id: userId }, 'auth.registered', { type: 'user', id: userId }, { role: inv.role })
      return { userId, session: await newSession(c, userId) }
    })
  }

  async function loginOptions() {
    const options = await generateAuthenticationOptions({ rpID: cfg.rpId, userVerification: 'preferred', allowCredentials: [] })
    const id = randomUUID()
    await db.pool.query('insert into auth_challenges (id, challenge, purpose, expires_at) values ($1,$2,$3,$4)', [id, options.challenge, 'login', new Date(now().getTime() + CHALLENGE_MS)])
    return { challengeId: id, options }
  }

  async function login(challengeId: string, response: AuthenticationResponseJSON) {
    const ch = await takeChallenge(challengeId, 'login')
    const cred = (await db.pool.query('select * from webauthn_credentials where id = $1', [response.id])).rows[0]
    if (!cred) throw new AuthError('Passkey inconnue.')
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpId,
      requireUserVerification: false,
      credential: { id: cred.id, publicKey: new Uint8Array(cred.public_key), counter: Number(cred.counter), transports: cred.transports as AuthenticatorTransport[] },
    }).catch(() => {
      throw new AuthError('Passkey refusée.')
    })
    if (!v.verified) throw new AuthError('Passkey refusée.')
    return db.tx(async (c) => {
      await c.query('update webauthn_credentials set counter = $2, last_used_at = now() where id = $1', [cred.id, v.authenticationInfo.newCounter])
      return { userId: cred.user_id as string, session: await newSession(c, cred.user_id) }
    })
  }

  /** Session valide → utilisatrice et ses entreprises (lues en base à CHAQUE requête). */
  async function sessionUser(sessionToken: string | undefined): Promise<SessionUser | undefined> {
    if (!sessionToken || sessionToken.length > 100) return undefined
    const r = await db.pool.query(
      `select u.id, u.display_name from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > $2`,
      [sha(sessionToken), now()],
    )
    const u = r.rows[0]
    if (!u) return undefined
    const m = await db.pool.query('select business_id, role from memberships where user_id = $1', [u.id])
    return { id: u.id, displayName: u.display_name, memberships: m.rows.map((x) => ({ businessId: x.business_id, role: x.role })) }
  }

  async function logout(sessionToken: string | undefined) {
    if (sessionToken) await db.pool.query('delete from sessions where token_hash = $1', [sha(sessionToken)])
  }

  return { createInvitation, registrationOptions, register, loginOptions, login, sessionUser, logout }
}

export type Auth = ReturnType<typeof createAuth>
