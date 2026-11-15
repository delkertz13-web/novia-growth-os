/**
 * Échéances persistantes (`scheduled_jobs`). La table est tenue à jour depuis l'état après
 * chaque transaction (engine/schedule.ts) : création, report, annulation d'une échéance
 * devenue sans objet, réarmement d'une séquence reprise. Un redémarrage ne perd rien.
 */
import type { DueJob } from '../../src/engine/schedule'
import type { Sql } from '../infra/db'

export async function syncJobs(c: Sql, businessId: string, expected: DueJob[]) {
  const rows = (await c.query(`select key, status, due_at from scheduled_jobs where business_id = $1 and status in ('pending', 'cancelled')`, [businessId])).rows
  const current = new Map(rows.map((r) => [r.key as string, r]))
  const wanted = new Map(expected.map((j) => [j.key, j]))
  for (const j of expected) {
    const payload = j.kind === 'ReminderDue' ? { appointmentId: j.appointmentId, hoursBefore: j.hoursBefore } : { runId: j.runId }
    const cur = current.get(j.key)
    if (!cur) {
      // une échéance déjà exécutée (done) n'est jamais recréée
      await c.query(
        `insert into scheduled_jobs (business_id, key, kind, payload, due_at, status) values ($1,$2,$3,$4,$5,'pending') on conflict (business_id, key) do nothing`,
        [businessId, j.key, j.kind, payload, j.dueAt],
      )
    } else if (cur.status === 'cancelled' || new Date(cur.due_at).getTime() !== j.dueAt.getTime()) {
      // réarmée (séquence reprise, RDV rétabli) ou reportée
      await c.query(`update scheduled_jobs set status = 'pending', due_at = $3, updated_at = now() where business_id = $1 and key = $2`, [businessId, j.key, j.dueAt])
    }
  }
  for (const [key, r] of current)
    if (r.status === 'pending' && !wanted.has(key))
      // devenue sans objet (RDV annulé ou reporté, séquence arrêtée ou en pause)
      await c.query(`update scheduled_jobs set status = 'cancelled', updated_at = now() where business_id = $1 and key = $2`, [businessId, key])
}
