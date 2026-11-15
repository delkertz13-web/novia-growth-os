/**
 * Serveur NOVIA Pilot : API + front pilote + ordonnanceur, dans UN processus (pilote :
 * une seule instance suffit ; les échéances vivent en base, un redémarrage ne perd rien).
 */
import { createNoviaApp } from './application/novia'
import { createAuth } from './application/auth'
import { readConfig } from './config'
import { createDb } from './infra/db'
import { systemClock } from './infra/shadow-providers'
import { createHttpServer } from './http/server'

const config = readConfig()
const db = createDb(config.databaseUrl, { max: 10 })
const app = createNoviaApp({ db, clock: systemClock })
const auth = createAuth(db, { rpId: config.rpId, rpName: 'NOVIA Pro', origin: config.origin }, systemClock)
const log = (line: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), ...line }))
const server = createHttpServer({ app, auth, db, config: { origin: config.origin, secureCookies: config.secureCookies, staticDir: config.staticDir, log } })

server.listen(config.port, () => log({ level: 'info', msg: `NOVIA Pilot écoute sur ${config.port} (mode shadow, aucun envoi réel)` }))

/** Ordonnanceur : toutes les 30 s, échéances dues puis files d'envoi en retard. */
let busy = false
const tick = async () => {
  if (busy) return
  busy = true
  try {
    const jobs = await app.runDueJobs()
    const outboxes = await app.flushAllOutboxes()
    if (jobs || outboxes) log({ level: 'info', msg: 'scheduler', jobs, outboxes })
  } catch (e) {
    log({ level: 'error', msg: 'scheduler', error: e instanceof Error ? e.name : 'unknown' })
  } finally {
    busy = false
  }
}
const timer = setInterval(tick, 30_000)
void tick()

for (const sig of ['SIGTERM', 'SIGINT'] as const)
  process.on(sig, () => {
    clearInterval(timer)
    server.close(() => void db.close().then(() => process.exit(0)))
  })
