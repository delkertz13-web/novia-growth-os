/**
 * Entreprises et profils. Un profil pilote ne contient QUE des valeurs `unknown`,
 * `estimated` ou `verified` : une valeur de démonstration est refusée (elle ne doit jamais
 * piloter une automatisation réelle, même en shadow). Une valeur estimée n'est jamais
 * traitée comme vérifiée par le moteur.
 */
import type { BusinessProfile } from '../../src/config/profile'
import type { DataStatus } from '../../src/config/schema'
import { isValidTimeZone } from '../../src/core/time'
import { createPilotProfile } from '../../src/pilot/profile'
import type { Db, Sql } from '../infra/db'
import type { Actor } from './state'
import { insertInitialSettings } from './state'
import { audit } from './audit'
import { mergeApproved } from './pilot'

export class ProfileError extends Error {}

/** Toutes les valeurs de statut d'un profil, où qu'elles soient. */
function statuses(o: unknown, out: { path: string; status: unknown }[] = [], path = ''): { path: string; status: unknown }[] {
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'status') out.push({ path, status: v })
      else statuses(v, out, path ? `${path}.${k}` : k)
    }
  }
  return out
}

export function validatePilotProfile(p: BusinessProfile, businessId: string) {
  if (!p || typeof p !== 'object') throw new ProfileError('Profil invalide.')
  if (p.businessId !== businessId) throw new ProfileError('Le profil désigne une autre entreprise.')
  if (!isValidTimeZone(p.identity?.timezone?.value)) throw new ProfileError('Fuseau horaire invalide.')
  const allowed: DataStatus[] = ['unknown', 'estimated', 'verified']
  const bad = statuses(p).filter((s) => !allowed.includes(s.status as DataStatus))
  if (bad.length) throw new ProfileError(`Statut refusé (pilote : inconnu, estimé ou vérifié uniquement) : ${bad.map((b) => b.path).join(', ')}`)
  // forme minimale attendue par le moteur
  const template = createPilotProfile(businessId, p.identity.timezone.value)
  for (const k of Object.keys(template) as (keyof BusinessProfile)[]) if (!(k in p)) throw new ProfileError(`Champ manquant : ${k}`)
  for (const k of Object.keys(template.templates)) if (!(k in p.templates)) throw new ProfileError(`Modèle manquant : ${k}`)
  if (!Array.isArray(p.services.items)) throw new ProfileError('Prestations invalides.')
  return p
}

/** Crée une entreprise PILOTE : profil entièrement « unknown », automatisations coupées. */
export async function createBusiness(db: Db, input: { id: string; timezone: string; name?: string }, actor: Actor) {
  if (!isValidTimeZone(input.timezone)) throw new ProfileError('Fuseau horaire invalide.')
  const profile = createPilotProfile(input.id, input.timezone)
  await db.tx(async (c) => {
    await c.query('insert into businesses (id, name, timezone) values ($1, $2, $3)', [input.id, input.name ?? '', input.timezone])
    await c.query(`select set_config('novia.business_id', $1, true)`, [input.id])
    await c.query('insert into business_profiles (business_id, profile, updated_by) values ($1, $2, $3)', [input.id, profile, `${actor.type}:${actor.id}`])
    await insertInitialSettings(c, input.id, profile.defaultSettings, { active: false, mode: 'missed' })
    await audit(c, input.id, actor, 'business.created', { type: 'business', id: input.id }, { timezone: input.timezone })
  })
  return profile
}

/** Profil tel qu'enregistré (édition par la fiche de préparation). */
export async function loadStoredProfile(c: Sql, businessId: string): Promise<BusinessProfile> {
  const r = await c.query('select profile from business_profiles where business_id = $1', [businessId])
  if (!r.rowCount) throw new ProfileError('Profil introuvable.')
  const p = r.rows[0].profile as BusinessProfile
  // profils créés avant P3 : agenda inconnu (donc aucune disponibilité affichée)
  return p.schedule ? p : { ...p, schedule: { authority: { value: 'planity', status: 'unknown' }, externalReminders: { value: false, status: 'unknown' } } }
}

/** Profil que lit le MOTEUR : modèles et FAQ = ceux APPROUVÉS de l'entreprise, rien d'autre. */
export async function loadProfile(c: Sql, businessId: string): Promise<BusinessProfile> {
  return mergeApproved(c, businessId, await loadStoredProfile(c, businessId))
}

export async function saveProfile(c: Sql, businessId: string, profile: BusinessProfile, actor: Actor) {
  validatePilotProfile(profile, businessId)
  await c.query('update business_profiles set profile = $2, updated_at = now(), updated_by = $3 where business_id = $1', [businessId, profile, `${actor.type}:${actor.id}`])
  await c.query('update businesses set name = $2, timezone = $3 where id = $1', [businessId, profile.identity.name.value, profile.identity.timezone.value])
  // l'audit trace QUELLES valeurs ont changé de statut, jamais leur contenu
  const verified = statuses(profile).filter((s) => s.status === 'verified').map((s) => s.path)
  const estimated = statuses(profile).filter((s) => s.status === 'estimated').map((s) => s.path)
  await audit(c, businessId, actor, 'profile.updated', { type: 'business', id: businessId }, { verified, estimated })
}

export async function listBusinessesOf(db: Db, userId: string) {
  return (
    await db.pool.query('select b.id, b.name, m.role from memberships m join businesses b on b.id = m.business_id where m.user_id = $1 order by b.id', [userId])
  ).rows as { id: string; name: string; role: 'OWNER' | 'PRO' }[]
}
