/**
 * Démarre un VRAI PostgreSQL jetable pour les tests serveur (aucun mock de base) :
 * cluster temporaire, port libre, détruit à la fin. `NOVIA_TEST_PG_URL` permet d'utiliser
 * un serveur existant (superutilisateur). Sans PostgreSQL disponible, les tests serveur
 * sont marqués « ignorés » et le disent.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import type { TestProject } from 'vitest/node'
import pg from 'pg'
import { migrate } from '../infra/migrate'

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string
    pgTemplate: string
  }
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port
      s.close(() => resolve(port))
    })
  })

function pgBin(): string | undefined {
  const root = '/usr/lib/postgresql'
  if (!existsSync(root)) return undefined
  const v = readdirSync(root).sort().at(-1)
  return v ? join(root, v, 'bin') : undefined
}

export default async function setup(project: TestProject) {
  let adminUrl = process.env.NOVIA_TEST_PG_URL ?? ''
  let stop = () => {}
  if (!adminUrl) {
    const bin = pgBin()
    if (!bin) {
      project.provide('pgAdminUrl', '')
      project.provide('pgTemplate', '')
      return
    }
    const dir = mkdtempSync(join(tmpdir(), 'novia-pg-'))
    chmodSync(dir, 0o777)
    const asRoot = process.getuid?.() === 0
    const run = (cmd: string, args: string[]) =>
      asRoot ? execFileSync('runuser', ['-u', 'postgres', '--', join(bin, cmd), ...args], { stdio: 'pipe' }) : execFileSync(join(bin, cmd), args, { stdio: 'pipe' })
    if (asRoot) execFileSync('chown', ['postgres', dir])
    const data = join(dir, 'data')
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-sync', '-E', 'UTF8'])
    const port = await freePort()
    run('pg_ctl', ['-D', data, '-l', join(dir, 'log'), '-o', `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off`, '-w', 'start'])
    adminUrl = `postgres://postgres@127.0.0.1:${port}/postgres`
    stop = () => {
      spawnSync(asRoot ? 'runuser' : join(bin, 'pg_ctl'), asRoot ? ['-u', 'postgres', '--', join(bin, 'pg_ctl'), '-D', data, '-m', 'immediate', 'stop'] : ['-D', data, '-m', 'immediate', 'stop'])
      rmSync(dir, { recursive: true, force: true })
    }
  }
  // base modèle migrée une fois ; chaque fichier de test clone la sienne
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  const template = `novia_tpl_${process.pid}`
  await admin.query(`drop database if exists ${template}`)
  await admin.query(`create database ${template}`)
  await migrate(adminUrl.replace(/\/[^/]*$/, `/${template}`))
  await admin.query(`do $$ begin if not exists (select from pg_roles where rolname = 'novia_app_login') then create role novia_app_login login; end if; end $$`)
  await admin.query('grant novia_app to novia_app_login')
  await admin.end()
  project.provide('pgAdminUrl', adminUrl)
  project.provide('pgTemplate', template)
  return async () => {
    const a = new pg.Client({ connectionString: adminUrl })
    await a.connect().catch(() => undefined)
    await a.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname like 'novia_%' and pid <> pg_backend_pid()`).catch(() => undefined)
    await a.end().catch(() => undefined)
    stop()
  }
}
