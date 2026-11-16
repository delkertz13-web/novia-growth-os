/**
 * Routes de préparation du pilote (P3), sous /api/b/:id/… — appartenance déjà vérifiée.
 *
 * Lecture : OWNER et PRO. Écriture de la préparation (profil, fiche, approbations, import) :
 * OWNER. Brouillons de textes / FAQ et avis sur les décisions : OWNER et PRO.
 * Aucune de ces routes ne déclenche un envoi : NOVIA reste en shadow.
 */
import type { TemplateId } from '../../src/config/profile'
import { applyProfileSection, FACT_KEYS, PROFILE_SECTIONS, type ProfileSection } from '../../src/pilot/onboarding'
import { MAX_IMPORT_ROWS, type ImportRow } from '../../src/pilot/import'
import type { DecisionFilter, NoviaApp } from '../application/novia'
import { loadProfile, loadStoredProfile, saveProfile } from '../repositories/business'
import {
  approveTemplate,
  archiveTemplate,
  createTemplateDraft,
  listFaq,
  listTemplates,
  loadFacts,
  PilotError,
  saveFact,
  saveFaqDraft,
  saveFeedback,
  setFaqStatus,
  TEMPLATE_KEYS,
  TEMPLATE_META,
} from '../repositories/pilot'
import { InputError } from './validate'

export interface PilotRouteContext {
  app: NoviaApp
  businessId: string
  sub: string
  method: string
  url: URL
  role: 'OWNER' | 'PRO'
  userId: string
  now: () => Date
  body: (maxBytes?: number) => Promise<Record<string, unknown>>
  send: (status: number, body: unknown) => void
  forbid: () => never
}

const WORKFLOWS = ['W02', 'W03', 'W04', 'SmartFill', 'FAQ']
const ID = /^[A-Za-z0-9_-]{1,80}$/

/** true si la route a été traitée */
export async function pilotRoutes(x: PilotRouteContext): Promise<boolean> {
  const { app, businessId: b, sub, method, role } = x
  const actor = { type: 'user' as const, id: x.userId }
  const owner = () => role === 'OWNER' || x.forbid()

  /* ---------- Fiche de préparation (lecture : tout le monde) ---------- */
  if (sub === '/onboarding' && method === 'GET') {
    return x.send(200, await readOnboarding(app, b)), true
  }
  const fact = /^\/onboarding\/facts\/([a-zA-Z.]{1,60})$/.exec(sub)
  if (fact && method === 'PUT') {
    owner()
    if (!FACT_KEYS.has(fact[1])) throw new InputError('Information inconnue de la checklist.')
    const body = await x.body()
    const saved = await app.pilotChange(b, (c) => saveFact(c, b, fact[1], body, actor, x.now()))
    return x.send(200, { fact: saved }), true
  }
  const section = /^\/profile\/([a-zA-Z]{1,20})$/.exec(sub)
  if (section && method === 'PUT') {
    owner()
    if (!PROFILE_SECTIONS.includes(section[1] as ProfileSection)) throw new InputError('Section inconnue.')
    const body = await x.body()
    await app.pilotChange(b, async (c) => {
      const p = await loadStoredProfile(c, b)
      await saveProfile(c, b, applyProfileSection(p, section[1] as ProfileSection, body.value), actor)
    })
    return x.send(200, { ok: true }), true
  }

  /* ---------- Modèles de messages ---------- */
  if (sub === '/templates' && method === 'POST') {
    const body = await x.body()
    if (!TEMPLATE_KEYS.includes(body.key as TemplateId)) throw new InputError('Message inconnu.')
    const version = await app.pilotChange(b, (c) => createTemplateDraft(c, b, body.key as TemplateId, body.body as string, actor, x.now()))
    return x.send(200, { version }), true
  }
  const tpl = /^\/templates\/(W0[234]\.[a-z]+)\/(\d{1,6})\/(approve|archive)$/.exec(sub)
  if (tpl && method === 'POST') {
    owner()
    const [, key, v, op] = tpl
    if (!TEMPLATE_KEYS.includes(key as TemplateId)) throw new InputError('Message inconnu.')
    await app.pilotChange(b, (c) => (op === 'approve' ? approveTemplate(c, b, key as TemplateId, Number(v), actor, x.now()) : archiveTemplate(c, b, key as TemplateId, Number(v), actor)))
    return x.send(200, { ok: true }), true
  }

  /* ---------- FAQ ---------- */
  if (sub === '/faq' && method === 'POST') {
    const body = await x.body()
    if (body.id !== undefined && (typeof body.id !== 'string' || !ID.test(body.id))) throw new InputError('Réponse inconnue.')
    const id = await app.pilotChange(b, (c) =>
      saveFaqDraft(c, b, { id: body.id as string | undefined, intent: body.intent, keywords: body.keywords, answer: body.answer }, actor, x.now()),
    )
    return x.send(200, { id }), true
  }
  const faq = /^\/faq\/([A-Za-z0-9_-]{1,80})\/(approve|archive)$/.exec(sub)
  if (faq && method === 'POST') {
    owner()
    await app.pilotChange(b, (c) => setFaqStatus(c, b, faq[1], faq[2] === 'approve' ? 'APPROVED' : 'ARCHIVED', actor, x.now()))
    return x.send(200, { ok: true }), true
  }

  /* ---------- Shadow Control Center ---------- */
  if (sub === '/shadow-decisions' && method === 'GET') {
    const q = x.url.searchParams
    const filter: DecisionFilter = {}
    const customer = q.get('customer')
    if (customer) {
      if (!ID.test(customer)) throw new InputError('Filtre invalide.')
      filter.customerId = customer
    }
    const wf = q.get('workflow')
    if (wf) {
      if (!WORKFLOWS.includes(wf)) throw new InputError('Filtre invalide.')
      filter.workflow = wf
    }
    const result = q.get('result')
    if (result) {
      if (result !== 'WOULD_EXECUTE' && result !== 'BLOCKED') throw new InputError('Filtre invalide.')
      filter.result = result
    }
    for (const k of ['from', 'to'] as const) {
      const v = q.get(k)
      if (v) {
        const d = new Date(v)
        if (Number.isNaN(d.getTime())) throw new InputError('Date invalide.')
        filter[k] = d.toISOString()
      }
    }
    const limit = Math.min(500, Math.max(1, Number(q.get('limit') ?? 200) || 200))
    return x.send(200, { decisions: await app.shadowDecisions(b, limit, filter) }), true
  }
  const fb = /^\/shadow-decisions\/(\d{1,15})\/feedback$/.exec(sub)
  if (fb && method === 'POST') {
    const body = await x.body()
    await app.pilotChange(b, (c) => saveFeedback(c, b, Number(fb[1]), x.userId, body.verdict, body.comment, x.now()))
    return x.send(200, { ok: true }), true
  }
  if (sub === '/pilot-metrics' && method === 'GET') return x.send(200, await app.pilotMetrics(b)), true

  /* ---------- Import CSV (aperçu puis import) ---------- */
  if (sub === '/import/customers' && method === 'POST') {
    owner()
    const body = await x.body(1024 * 1024)
    const source = body.source
    if (source !== 'IMPORT' && source !== 'PLANITY_EXPORT') throw new InputError('Provenance à déclarer : fichier quelconque ou export Planity.')
    if (!Array.isArray(body.rows) || body.rows.length > MAX_IMPORT_ROWS) throw new InputError(`De 1 à ${MAX_IMPORT_ROWS} lignes.`)
    const rows = body.rows.map((r: unknown, i: number) => {
      // { line, row: { firstName, lastName, phone, email } } (forme envoyée par l'écran d'import)
      const o = (r ?? {}) as Record<string, unknown>
      const row = (o.row ?? {}) as Record<string, unknown>
      const s = (k: string) => (typeof row[k] === 'string' ? (row[k] as string).trim().slice(0, 200) : '')
      return { line: Number.isInteger(o.line) ? (o.line as number) : i + 2, row: { firstName: s('firstName'), lastName: s('lastName'), phone: s('phone'), email: s('email') } as ImportRow }
    })
    const r = await app.importCustomers(b, actor, rows, source, body.dryRun !== false)
    return x.send(200, { ...r.value, revision: r.revision }), true
  }
  return false
}

async function readOnboarding(app: NoviaApp, b: string) {
  return app.withBusiness(b, { type: 'system', id: 'read' }, async (u) => ({
    profile: await loadStoredProfile(u.sql, b),
    engineProfile: await loadProfile(u.sql, b),
    facts: await loadFacts(u.sql, b),
    templates: await listTemplates(u.sql, b),
    templateMeta: TEMPLATE_META,
    faq: await listFaq(u.sql, b),
    settings: u.state().settings,
  })).then((r) => r.value)
}

export { PilotError }
