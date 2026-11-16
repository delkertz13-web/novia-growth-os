/** Journal d'audit : QUI, QUOI, QUAND, QUELLE ENTREPRISE, QUELLE ENTITÉ. Jamais de contenu personnel. */
import type { Sql } from '../infra/db'
import type { Actor } from './state'

export async function audit(c: Sql, businessId: string, actor: Actor, action: string, entity: { type: string; id: string } | null, detail: Record<string, unknown> = {}) {
  await c.query(`insert into audit_log (business_id, actor_type, actor_id, action, entity_type, entity_id, detail) values ($1,$2,$3,$4,$5,$6,$7)`, [
    businessId,
    actor.type,
    actor.id,
    action,
    entity?.type ?? null,
    entity?.id ?? null,
    detail,
  ])
}
