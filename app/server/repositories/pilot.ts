/**
 * Préparation du pilote (P3) : fiche de préparation, modèles de messages, FAQ approuvée,
 * avis sur les décisions shadow. Toujours dans la transaction de L'entreprise (RLS).
 *
 * Seuls les modèles et réponses APPROUVÉS de cette entreprise alimentent le moteur
 * (`mergeApproved`) : un texte de démonstration ou un brouillon n'y entre jamais.
 */
import type { ApprovedAnswer, BusinessProfile, TemplateId } from '../../src/config/profile'
import { normalize } from '../../src/core/triage'
import { validateFact, type Facts } from '../../src/pilot/onboarding'
import type { Sql } from '../infra/db'
import { audit } from './audit'
import type { Actor } from './state'

export class PilotError extends Error {}

const who = (a: Actor) => `${a.type}:${a.id}`

/* ---------- Fiche de préparation ---------- */

export async function loadFacts(c: Sql, businessId: string): Promise<Facts> {
  const r = await c.query('select facts from business_onboarding where business_id = $1', [businessId])
  return (r.rows[0]?.facts as Facts) ?? {}
}

/** Enregistre UN fait (brouillon permanent : on peut quitter et reprendre). */
export async function saveFact(c: Sql, businessId: string, key: string, input: unknown, actor: Actor, at: Date) {
  const f = { ...validateFact(key, input), updatedAt: at.toISOString(), updatedBy: who(actor) }
  await c.query(
    `insert into business_onboarding (business_id, facts, updated_at, updated_by) values ($1, jsonb_build_object($2::text, $3::jsonb), $4, $5)
     on conflict (business_id) do update set facts = business_onboarding.facts || jsonb_build_object($2::text, $3::jsonb), updated_at = $4, updated_by = $5`,
    [businessId, key, JSON.stringify(f), at, who(actor)],
  )
  // l'audit garde QUEL fait a changé de statut, jamais son contenu
  await audit(c, businessId, actor, 'onboarding.fact', { type: 'fact', id: key }, { status: f.status })
  return f
}

/* ---------- Modèles de messages ---------- */

export const TEMPLATE_META: Record<TemplateId, { workflow: string; purpose: 'transactional' | 'marketing'; label: string; variables: string[] }> = {
  'W02.confirmation': { workflow: 'W02', purpose: 'transactional', label: 'Confirmation de RDV', variables: ['business', 'firstName', 'service', 'when'] },
  'W02.reschedule': { workflow: 'W02', purpose: 'transactional', label: 'RDV déplacé', variables: ['business', 'firstName', 'service', 'when', 'reminders'] },
  'W02.reminder': { workflow: 'W02', purpose: 'transactional', label: 'Rappel de RDV', variables: ['business', 'firstName', 'service', 'when'] },
  // relances liées au RDV de la cliente : bloquées par une opposition (STOP), jamais envoyées sans consentement aux messages
  'W03.recovery': { workflow: 'W03', purpose: 'transactional', label: 'Relance après annulation', variables: ['business', 'firstName'] },
  'W04.recovery': { workflow: 'W04', purpose: 'transactional', label: 'Relance après absence', variables: ['business', 'firstName'] },
}
export const TEMPLATE_KEYS = Object.keys(TEMPLATE_META) as TemplateId[]

export interface TemplateRow {
  key: TemplateId
  version: number
  workflow: string
  channel: 'sms'
  purpose: string
  body: string
  status: 'DRAFT' | 'APPROVED' | 'ARCHIVED'
  author: string
  createdAt: string
  approvedBy?: string
  approvedAt?: string
}

const templateOf = (r: Record<string, unknown>): TemplateRow => ({
  key: r.template_key as TemplateId,
  version: Number(r.version),
  workflow: r.workflow as string,
  channel: 'sms',
  purpose: r.purpose as string,
  body: r.body as string,
  status: r.status as TemplateRow['status'],
  author: r.author as string,
  createdAt: new Date(r.created_at as string).toISOString(),
  ...(r.approved_by ? { approvedBy: r.approved_by as string, approvedAt: new Date(r.approved_at as string).toISOString() } : {}),
})

export async function listTemplates(c: Sql, businessId: string) {
  return (await c.query('select * from message_templates where business_id = $1 order by template_key, version desc', [businessId])).rows.map(templateOf)
}

/** Variables inconnues refusées : un texte approuvé ne laisse jamais « {xyz} » à la cliente. */
function checkTemplate(key: TemplateId, body: string) {
  if (!TEMPLATE_KEYS.includes(key)) throw new PilotError('Message inconnu.')
  if (typeof body !== 'string' || !body.trim() || body.length > 640) throw new PilotError('Texte vide ou trop long (640 caractères au plus).')
  const unknownVars = [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((v) => !TEMPLATE_META[key].variables.includes(v))
  if (unknownVars.length) throw new PilotError(`Variable inconnue : {${unknownVars.join('}, {')}}. Disponibles : {${TEMPLATE_META[key].variables.join('}, {')}}.`)
}

export async function createTemplateDraft(c: Sql, businessId: string, key: TemplateId, body: string, actor: Actor, at: Date) {
  checkTemplate(key, body)
  const v = await c.query('select coalesce(max(version), 0) + 1 as v from message_templates where business_id = $1 and template_key = $2', [businessId, key])
  const version = Number(v.rows[0].v)
  const m = TEMPLATE_META[key]
  await c.query(
    `insert into message_templates (business_id, template_key, version, workflow, channel, purpose, body, status, author, created_at)
     values ($1,$2,$3,$4,'sms',$5,$6,'DRAFT',$7,$8)`,
    [businessId, key, version, m.workflow, m.purpose, body.trim(), who(actor), at],
  )
  await audit(c, businessId, actor, 'template.drafted', { type: 'template', id: `${key}#${version}` })
  return version
}

/** Approuver une version : l'ancienne version approuvée est archivée (une seule active). */
export async function approveTemplate(c: Sql, businessId: string, key: TemplateId, version: number, actor: Actor, at: Date) {
  const r = await c.query('select status from message_templates where business_id = $1 and template_key = $2 and version = $3 for update', [businessId, key, version])
  if (!r.rowCount) throw new PilotError('Version introuvable.')
  if (r.rows[0].status !== 'DRAFT') throw new PilotError('Seul un brouillon peut être approuvé.')
  await c.query(`update message_templates set status = 'ARCHIVED' where business_id = $1 and template_key = $2 and status = 'APPROVED'`, [businessId, key])
  await c.query(`update message_templates set status = 'APPROVED', approved_by = $4, approved_at = $5 where business_id = $1 and template_key = $2 and version = $3`, [
    businessId,
    key,
    version,
    who(actor),
    at,
  ])
  await audit(c, businessId, actor, 'template.approved', { type: 'template', id: `${key}#${version}` })
}

export async function archiveTemplate(c: Sql, businessId: string, key: TemplateId, version: number, actor: Actor) {
  const r = await c.query(`update message_templates set status = 'ARCHIVED' where business_id = $1 and template_key = $2 and version = $3 and status <> 'ARCHIVED'`, [businessId, key, version])
  if (!r.rowCount) throw new PilotError('Version introuvable ou déjà archivée.')
  await audit(c, businessId, actor, 'template.archived', { type: 'template', id: `${key}#${version}` })
}

/* ---------- FAQ approuvée ---------- */

export interface FaqRow {
  id: string
  intent: string
  keywords: string[]
  answer: string
  status: 'DRAFT' | 'APPROVED' | 'ARCHIVED'
  author: string
  createdAt: string
  approvedBy?: string
  approvedAt?: string
}

const faqOf = (r: Record<string, unknown>): FaqRow => ({
  id: r.id as string,
  intent: r.intent as string,
  keywords: r.keywords as string[],
  answer: r.answer as string,
  status: r.status as FaqRow['status'],
  author: r.author as string,
  createdAt: new Date(r.created_at as string).toISOString(),
  ...(r.approved_by ? { approvedBy: r.approved_by as string, approvedAt: new Date(r.approved_at as string).toISOString() } : {}),
})

export async function listFaq(c: Sql, businessId: string) {
  return (await c.query(`select * from faq_entries where business_id = $1 order by status, intent`, [businessId])).rows.map(faqOf)
}

/** Mots-clés normalisés (minuscules, sans accents) : c'est ainsi que NOVIA reconnaît une question. */
function cleanKeywords(k: unknown): string[] {
  if (!Array.isArray(k) || !k.length || k.length > 15) throw new PilotError('Indiquez de 1 à 15 mots-clés.')
  const out = [...new Set(k.map((x) => (typeof x === 'string' ? normalize(x).trim() : '')).filter((x) => x.length >= 3 && x.length <= 40))]
  if (!out.length) throw new PilotError('Mots-clés trop courts (3 lettres au moins).')
  return out
}

export async function saveFaqDraft(c: Sql, businessId: string, input: { id?: string; intent: unknown; keywords: unknown; answer: unknown }, actor: Actor, at: Date) {
  if (typeof input.intent !== 'string' || !input.intent.trim() || input.intent.length > 120) throw new PilotError('Question invalide.')
  if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 640) throw new PilotError('Réponse vide ou trop longue.')
  const keywords = cleanKeywords(input.keywords)
  if (input.id) {
    const r = await c.query(
      `update faq_entries set intent = $3, keywords = $4, answer = $5 where business_id = $1 and id = $2 and status = 'DRAFT'`,
      [businessId, input.id, input.intent.trim(), JSON.stringify(keywords), input.answer.trim()],
    )
    if (!r.rowCount) throw new PilotError('Seul un brouillon peut être modifié. Archivez la réponse approuvée puis créez-en une nouvelle.')
    await audit(c, businessId, actor, 'faq.drafted', { type: 'faq', id: input.id })
    return input.id
  }
  const id = `faq-${at.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  await c.query(`insert into faq_entries (business_id, id, intent, keywords, answer, status, author, created_at) values ($1,$2,$3,$4,$5,'DRAFT',$6,$7)`, [
    businessId,
    id,
    input.intent.trim(),
    JSON.stringify(keywords),
    input.answer.trim(),
    who(actor),
    at,
  ])
  await audit(c, businessId, actor, 'faq.drafted', { type: 'faq', id })
  return id
}

export async function setFaqStatus(c: Sql, businessId: string, id: string, status: 'APPROVED' | 'ARCHIVED', actor: Actor, at: Date) {
  const from = status === 'APPROVED' ? `status = 'DRAFT'` : `status <> 'ARCHIVED'`
  const r = await c.query(
    `update faq_entries set status = $3${status === 'APPROVED' ? ', approved_by = $4, approved_at = $5' : ''} where business_id = $1 and id = $2 and ${from}`,
    status === 'APPROVED' ? [businessId, id, status, who(actor), at] : [businessId, id, status],
  )
  if (!r.rowCount) throw new PilotError(status === 'APPROVED' ? 'Seul un brouillon peut être approuvé.' : 'Réponse introuvable ou déjà archivée.')
  await audit(c, businessId, actor, status === 'APPROVED' ? 'faq.approved' : 'faq.archived', { type: 'faq', id })
}

/**
 * Le profil que lit le moteur : textes et réponses APPROUVÉS de cette entreprise, rien
 * d'autre. Aucun approuvé → « inconnu » (le moteur bloque, la question part à un humain).
 */
export async function mergeApproved(c: Sql, businessId: string, p: BusinessProfile): Promise<BusinessProfile> {
  const t = await c.query(`select template_key, body from message_templates where business_id = $1 and status = 'APPROVED'`, [businessId])
  const approved = new Map(t.rows.map((r) => [r.template_key as TemplateId, r.body as string]))
  const templates = Object.fromEntries(
    TEMPLATE_KEYS.map((k) => [k, approved.has(k) ? { value: approved.get(k)!, status: 'verified' as const } : { value: '', status: 'unknown' as const }]),
  ) as BusinessProfile['templates']
  const f = await c.query(`select id, intent, keywords, answer from faq_entries where business_id = $1 and status = 'APPROVED' order by id`, [businessId])
  const answers: ApprovedAnswer[] = f.rows.map((r) => ({ id: r.id, topic: r.intent, keywords: r.keywords, answer: r.answer }))
  return { ...p, templates, approvedAnswers: { value: answers, status: answers.length ? 'verified' : 'unknown' } }
}

/* ---------- Avis sur les décisions shadow ---------- */

export const VERDICTS = ['AGREE', 'DISAGREE', 'UNSURE'] as const

export async function saveFeedback(c: Sql, businessId: string, decisionId: number, userId: string, verdict: unknown, comment: unknown, at: Date) {
  if (!VERDICTS.includes(verdict as (typeof VERDICTS)[number])) throw new PilotError('Avis invalide.')
  if (comment !== undefined && comment !== null && (typeof comment !== 'string' || comment.length > 500)) throw new PilotError('Commentaire trop long (500 caractères au plus).')
  const d = await c.query('select 1 from shadow_decisions where business_id = $1 and id = $2', [businessId, decisionId])
  if (!d.rowCount) throw new PilotError('Décision introuvable.')
  await c.query(
    `insert into shadow_feedback (business_id, decision_id, user_id, verdict, comment, at) values ($1,$2,$3,$4,$5,$6)
     on conflict (business_id, decision_id, user_id) do update set verdict = $4, comment = $5, at = $6`,
    [businessId, decisionId, userId, verdict, (comment as string | undefined)?.trim() || null, at],
  )
  // le retour sert à apprendre : il ne modifie AUCUNE règle (audit sans le commentaire)
  await audit(c, businessId, { type: 'user', id: userId }, 'shadow.feedback', { type: 'decision', id: String(decisionId) }, { verdict })
}
