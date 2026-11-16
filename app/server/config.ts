/**
 * Configuration du serveur, lue dans l'environnement (secrets côté serveur uniquement :
 * rien de tout cela n'est jamais envoyé au navigateur).
 *
 *   DATABASE_URL            connexion du rôle APPLICATIF (membre de novia_app, sans BYPASSRLS)
 *   MIGRATION_DATABASE_URL  connexion du propriétaire du schéma (migrations, exploitation)
 *   NOVIA_ORIGIN            origine publique, ex. https://pilote.novia.example
 *   NOVIA_RP_ID             domaine des passkeys (par défaut : l'hôte de NOVIA_ORIGIN)
 *   PORT                    port HTTP (8080)
 *   NOVIA_STATIC_DIR        front pilote construit (dist-pilot)
 */
export interface ServerConfig {
  databaseUrl: string
  migrationDatabaseUrl: string
  origin: string
  rpId: string
  port: number
  staticDir?: string
  secureCookies: boolean
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const need = (k: string) => {
    const v = env[k]
    if (!v) throw new Error(`Variable d’environnement manquante : ${k}`)
    return v
  }
  const origin = need('NOVIA_ORIGIN').replace(/\/$/, '')
  const u = new URL(origin)
  return {
    databaseUrl: need('DATABASE_URL'),
    migrationDatabaseUrl: env.MIGRATION_DATABASE_URL ?? need('DATABASE_URL'),
    origin,
    rpId: env.NOVIA_RP_ID ?? u.hostname,
    port: Number(env.PORT ?? 8080),
    staticDir: env.NOVIA_STATIC_DIR,
    secureCookies: u.protocol === 'https:',
  }
}
