/** Une base par fichier de test, clonée du modèle migré. */
import { randomBytes } from 'node:crypto'
import { inject } from 'vitest'
import pg from 'pg'

export const hasPg = () => !!inject('pgAdminUrl')

const urlFor = (admin: string, db: string, user = 'postgres') => admin.replace(/\/\/[^@]*@/, `//${user}@`).replace(/\/[^/]*$/, `/${db}`)

export async function createTestDatabase(opts: { empty?: boolean } = {}) {
  const adminUrl = inject('pgAdminUrl')
  const name = `novia_t_${randomBytes(5).toString('hex')}`
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(opts.empty ? `create database ${name}` : `create database ${name} template ${inject('pgTemplate')}`)
  await admin.end()
  return {
    name,
    /** propriétaire (migrations, exploitation) */
    ownerUrl: urlFor(adminUrl, name),
    /** rôle applicatif : sécurité au niveau des lignes appliquée */
    appUrl: urlFor(adminUrl, name, 'novia_app_login'),
    async drop() {
      const a = new pg.Client({ connectionString: adminUrl })
      await a.connect()
      await a.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [name])
      await a.query(`drop database if exists ${name}`)
      await a.end()
    },
  }
}
