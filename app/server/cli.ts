/**
 * Exploitation (à lancer par l'exploitant, jamais exposé par l'API) :
 *
 *   node dist-server/cli.js migrate
 *   node dist-server/cli.js create-business --id pilot-001 --timezone Europe/Paris
 *   node dist-server/cli.js invite --business pilot-001 --role OWNER --label "iPhone"
 *   node dist-server/cli.js set-profile --business pilot-001 --file profile.json
 */
import { readFileSync } from 'node:fs'
import { createAuth } from './application/auth'
import { readConfig } from './config'
import { createDb } from './infra/db'
import { migrate } from './infra/migrate'
import { systemClock } from './infra/shadow-providers'
import { createBusiness, saveProfile } from './repositories/business'

const [cmd, ...rest] = process.argv.slice(2)
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const operator = { type: 'system' as const, id: process.env.USER ?? 'operator' }

async function main() {
  const config = readConfig()
  if (cmd === 'migrate') {
    const done = await migrate(config.migrationDatabaseUrl, console.log)
    console.log(done.length ? `${done.length} migration(s) appliquée(s)` : 'Base à jour.')
    return
  }
  const db = createDb(config.databaseUrl)
  try {
    if (cmd === 'create-business') {
      const id = arg('id')
      const timezone = arg('timezone') ?? 'Europe/Paris'
      if (!id) throw new Error('--id requis')
      await createBusiness(db, { id, timezone }, operator)
      console.log(`Entreprise ${id} créée (profil entièrement « unknown », mode shadow).`)
    } else if (cmd === 'invite') {
      const business = arg('business')
      if (!business) throw new Error('--business requis')
      const auth = createAuth(db, { rpId: config.rpId, rpName: 'NOVIA Pro', origin: config.origin }, systemClock)
      const t = await auth.createInvitation(business, arg('role') === 'PRO' ? 'PRO' : 'OWNER', arg('label') ?? 'Invitation', `system:${operator.id}`)
      console.log(`Lien à usage unique (72 h), à remettre en main propre :\n${config.origin}/invitation#${t}`)
    } else if (cmd === 'set-profile') {
      const business = arg('business')
      const file = arg('file')
      if (!business || !file) throw new Error('--business et --file requis')
      const profile = JSON.parse(readFileSync(file, 'utf8'))
      await db.businessTx(business, (c) => saveProfile(c, business, profile, operator))
      console.log('Profil enregistré.')
    } else {
      console.log('Commandes : migrate | create-business | invite | set-profile')
    }
  } finally {
    await db.close()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
