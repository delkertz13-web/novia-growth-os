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
/**
 * Ordonnanceur : échéances dues puis files d'envoi en retard. Deux déclencheurs, sans risque
 * de double traitement (les échéances vivent en base) :
 * - un minuteur interne toutes les 30 s (suffit si le processus reste actif) ;
 * - le déclencheur CRON de l'hébergeur (POST / + jeton), car un conteneur serverless peut
 *   être suspendu entre deux requêtes : le CRON garantit au moins un passage par minute.
 */
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
const server = createHttpServer({
  app,
  auth,
  db,
  clock: systemClock,
  tick,
  config: { origin: config.origin, secureCookies: config.secureCookies, staticDir: config.staticDir, log, cronToken: config.cronToken },
})
server.listen(config.port, () => log({ level: 'info', msg: `NOVIA Pilot écoute sur ${config.port} (mode shadow, aucun envoi réel)` }))

const timer = setInterval(tick, 30_000)
void tick()

for (const sig of ['SIGTERM', 'SIGINT'] as const)
  process.on(sig, () => {
    clearInterval(timer)
    server.close(() => void db.close().then(() => process.exit(0)))
  })
