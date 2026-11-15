import { afterAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { migrate, migrations } from '../infra/migrate'
import { createTestDatabase, hasPg } from './pg'

describe.skipIf(!hasPg())('migrations', () => {
  const dbs: { drop(): Promise<void> }[] = []
  afterAll(async () => {
    for (const d of dbs) await d.drop()
  })

  it('une base VIDE devient une base NOVIA valide ; relancer ne fait rien', async () => {
    const db = await createTestDatabase({ empty: true })
    dbs.push(db)
    expect(await migrate(db.ownerUrl)).toEqual(migrations.map((m) => m.version))
    expect(await migrate(db.ownerUrl)).toEqual([])
    const c = new pg.Client({ connectionString: db.ownerUrl })
    await c.connect()
    const tables = (await c.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename)
    for (const t of ['businesses', 'business_profiles', 'customers', 'appointments', 'consent_records', 'sequences', 'sequence_actions', 'conversations', 'messages', 'human_takeovers', 'opportunities', 'payments', 'external_refs', 'audit_log', 'shadow_decisions', 'inbox_events', 'outbox_messages', 'scheduled_jobs'])
      expect(tables).toContain(t)
    const rls = (await c.query(`select relname from pg_class where relrowsecurity and relforcerowsecurity and relkind = 'r' order by 1`)).rows.map((r) => r.relname)
    expect(rls).toContain('customers')
    expect(rls).not.toContain('businesses')
    await c.end()
  })

  it('une migration déjà appliquée ne peut pas être modifiée', async () => {
    const db = await createTestDatabase()
    dbs.push(db)
    const c = new pg.Client({ connectionString: db.ownerUrl })
    await c.connect()
    await c.query(`update novia_schema_migrations set checksum = 'x' where version = '0001_schema'`)
    await c.end()
    await expect(migrate(db.ownerUrl)).rejects.toThrow(/modifiée/)
  })
})
