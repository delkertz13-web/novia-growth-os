/**
 * Garde-fous P2 : AUCUN transport sortant. Le serveur pilote n'enregistre aucun fournisseur
 * réel, n'ouvre aucune connexion sortante (hors PostgreSQL), et la base elle-même refuse
 * tout statut « envoyé » et tout mode d'exécution autre que shadow.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createShadowProviders, NO_TRANSPORT } from '../infra/shadow-providers'

const root = join(__dirname, '..')
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
/** code exécuté en production (hors tests) */
const runtime = walk(root)
  .filter((f) => /\.(ts|sql)$/.test(f) && !f.includes(`${'/'}test${'/'}`))
  .map((f) => ({ file: relative(root, f), src: readFileSync(f, 'utf8') }))

describe('P2 — aucun transport sortant', () => {
  it('seuls l’horloge et une messagerie qui REFUSE sont enregistrées (ni CRM, ni Voice, ni paiement, ni agenda)', async () => {
    const p = createShadowProviders({ now: () => new Date(0) })
    expect(Object.keys(p).sort()).toEqual(['clock', 'messaging'])
    expect(p.messaging!.name).toBe(NO_TRANSPORT)
    const r = await p.messaging!.send({} as never)
    expect(r).toMatchObject({ ok: false, error: { code: 'rejected', retryable: false } })
  })

  it('le serveur n’importe aucun provider concret (Mock, GHL, futurs) ni la démonstration', () => {
    const bad = runtime.filter(({ src }) => /from ['"][^'"]*src\/(providers\/(mock|ghl|future)|demo)(\/|['"])/.test(src))
    expect(bad.map((x) => x.file)).toEqual([])
  })

  it('aucun appel réseau sortant dans le code serveur (fetch, http(s).request, sockets, SDK de fournisseur)', () => {
    const outbound = /\bfetch\s*\(|https?\.request\s*\(|https?\.get\s*\(|from ['"]node:https['"]|from ['"](axios|got|undici|node-fetch|twilio|stripe|@aws-sdk[^'"]*|@scaleway[^'"]*)['"]|net\.connect|tls\.connect/
    expect(runtime.filter(({ src }) => outbound.test(src)).map((x) => x.file)).toEqual([])
  })

  it('aucune adresse ni clé de fournisseur réel (GHL, Twilio, Stripe, Voice) dans le serveur', () => {
    const real = /gohighlevel|leadconnector|twilio|stripe|vapi\.ai|retellai|sk_live|AC[0-9a-f]{32}/i
    expect(runtime.filter(({ src }) => real.test(src)).map((x) => x.file)).toEqual([])
  })

  it('le schéma verrouille le mode shadow et interdit tout statut « envoyé »', () => {
    const schema = runtime.filter((x) => x.file.startsWith('migrations/')).map((x) => x.src).join('\n')
    expect(schema).toMatch(/execution_mode text not null default 'shadow' check \(execution_mode = 'shadow'\)/)
    expect(schema).toMatch(/kind text not null check \(kind = 'declared'\)/)
  })

  it('les dépendances serveur ne contiennent aucun SDK de messagerie, de téléphonie ou de paiement', () => {
    const pkg = JSON.parse(readFileSync(join(root, '..', 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter((d) => /twilio|stripe|vonage|plivo|sendgrid|mailgun|highlevel|leadconnector|vapi|retell|scaleway|aws-sdk/i.test(d))).toEqual([])
  })
})
