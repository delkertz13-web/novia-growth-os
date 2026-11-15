/**
 * Preuve de restauration : une base est reconstruite par les MIGRATIONS puis la
 * restauration des DONNÉES (procédure de server/ops/backup.sh et restore.sh), et
 * l'application y retrouve exactement le même état.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { inject } from 'vitest'
import { createNoviaApp } from '../application/novia'
import { createDb } from '../infra/db'
import { migrate } from '../infra/migrate'
import { contact, pro, setup, T0 } from './fixtures'
import { createTestDatabase, hasPg } from './pg'

const bin = () => inject('pgBin')

describe.skipIf(!hasPg() || !bin())('sauvegarde et restauration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'novia-backup-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('base vide → migrations → données restaurées : même état, mêmes échéances, même historique', async () => {
    const t = await setup()
    const target = await createTestDatabase({ empty: true })
    try {
      await t.app.command('salon-a', pro, { type: 'BookingCreated', serviceId: 'pose', start: new Date(T0.getTime() + 26 * 3_600_000).toISOString(), contact: contact(1), leadSource: 'manual', origin: 'pro' })
      const before = await t.app.snapshot('salon-a')
      const file = join(dir, 'novia.sql')
      // pg_dump : données seules (le schéma vient des migrations)
      execFileSync(join(bin(), 'pg_dump'), ['--data-only', '--no-owner', '--no-privileges', '--disable-triggers', '--exclude-table=novia_schema_migrations', '--exclude-table=sessions', '--exclude-table=auth_challenges', `--dbname=${t.database.ownerUrl}`, `--file=${file}`])

      await migrate(target.ownerUrl)
      execFileSync(join(bin(), 'psql'), ['--set=ON_ERROR_STOP=1', '--single-transaction', '--quiet', `--dbname=${target.ownerUrl}`, `--file=${file}`])

      const db2 = createDb(target.appUrl)
      try {
        const app2 = createNoviaApp({ db: db2, clock: t.clock })
        const after = await app2.snapshot('salon-a')
        expect(after.revision).toBe(before.revision)
        expect(after.state).toEqual(before.state)
        expect(after.profile).toEqual(before.profile)
        expect(await app2.auditLog('salon-a')).toEqual(await t.app.auditLog('salon-a'))
        const jobs = (d: typeof db2) => d.businessTx('salon-a', (c) => c.query(`select key, status, due_at from scheduled_jobs order by key`)).then((r) => r.rows)
        expect(await jobs(db2)).toEqual(await jobs(t.db))
        // la base restaurée continue de fonctionner (séquences d'identifiants comprises)
        const r = await app2.command('salon-a', pro, { type: 'BookingCreated', serviceId: 'pose', start: new Date(T0.getTime() + 50 * 3_600_000).toISOString(), contact: contact(2), leadSource: 'manual', origin: 'pro' })
        expect(r.value.ok).toBe(true)
      } finally {
        await db2.close()
      }
    } finally {
      await t.close()
      await target.drop()
    }
  })
})
