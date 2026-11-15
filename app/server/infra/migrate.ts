/**
 * Migrations versionnées : une base VIDE devient une base NOVIA valide, sans aucune
 * manipulation manuelle. Chaque fichier s'applique une fois, dans sa transaction ; son
 * empreinte est vérifiée (une migration déjà appliquée ne doit jamais changer).
 */
import { createHash } from 'node:crypto'
import pg from 'pg'
import m0001 from '../migrations/0001_schema.sql?raw'
import m0002 from '../migrations/0002_isolation.sql?raw'

export const migrations: { version: string; sql: string }[] = [
  { version: '0001_schema', sql: m0001 },
  { version: '0002_isolation', sql: m0002 },
]

const LOCK = 47_2001

export async function migrate(connectionString: string, log: (m: string) => void = () => undefined) {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK])
    await client.query(`create table if not exists novia_schema_migrations (
      version text primary key, checksum text not null, applied_at timestamptz not null default now())`)
    const applied = new Map((await client.query('select version, checksum from novia_schema_migrations')).rows.map((r) => [r.version, r.checksum]))
    const done: string[] = []
    for (const m of migrations) {
      const checksum = createHash('sha256').update(m.sql).digest('hex')
      if (applied.has(m.version)) {
        if (applied.get(m.version) !== checksum) throw new Error(`Migration ${m.version} modifiée après application : refus.`)
        continue
      }
      await client.query('begin')
      try {
        await client.query(m.sql)
        await client.query('insert into novia_schema_migrations (version, checksum) values ($1, $2)', [m.version, checksum])
        await client.query('commit')
      } catch (e) {
        await client.query('rollback')
        throw e
      }
      done.push(m.version)
      log(`migration ${m.version} appliquée`)
    }
    return done
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK]).catch(() => undefined)
    await client.end()
  }
}
