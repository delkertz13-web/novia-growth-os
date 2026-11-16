/**
 * Appels de l'API de préparation du pilote (P3), pour l'entreprise de la session.
 * Le serveur valide et décide tout ; ces fonctions ne font que transporter.
 */
import type { BusinessProfile, TemplateId } from '../config/profile'
import type { NoviaSettings } from '../core/types'
import { api } from './api'
import type { ImportRow, ImportSource, PlannedRow } from './import'
import type { Fact, Facts, PilotStatus, ProfileSection } from './onboarding'
import { pilotSession } from './session'

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

export interface Onboarding {
  profile: BusinessProfile
  engineProfile: BusinessProfile
  facts: Facts
  templates: TemplateRow[]
  templateMeta: Record<TemplateId, { workflow: string; purpose: string; label: string; variables: string[] }>
  faq: FaqRow[]
  settings: NoviaSettings
}

export type Verdict = 'AGREE' | 'DISAGREE' | 'UNSURE'

export interface ShadowDecisionRow {
  id: number
  at: string
  customer_id: string | null
  appointment_id: string | null
  workflow: string | null
  action: string
  result: 'WOULD_EXECUTE' | 'BLOCKED'
  reason: string
  guards: { name: string; ok: boolean }[]
  input_type: string | null
  feedback: { userId: string; verdict: Verdict; comment: string | null; at: string }[]
}

export interface PilotMetrics {
  decisions: number
  wouldExecute: number
  blocked: number
  byWorkflow: { workflow: string; result: string; n: number }[]
  blockReasons: { reason: string; n: number }[]
  feedback: Record<Verdict, number>
}

export interface DecisionQuery {
  customer?: string
  workflow?: string
  result?: 'WOULD_EXECUTE' | 'BLOCKED'
  from?: string
  to?: string
}

const base = () => {
  const s = pilotSession()
  if (!s) throw new Error('Session absente : reconnectez-vous.')
  return `/api/b/${encodeURIComponent(s.business.id)}`
}

export const pilotApi = {
  role: () => pilotSession()?.business.role ?? 'PRO',
  onboarding: () => api<Onboarding>(`${base()}/onboarding`),
  saveFact: (key: string, fact: Pick<Fact, 'value' | 'status' | 'note'>) => api<{ fact: Fact }>(`${base()}/onboarding/facts/${encodeURIComponent(key)}`, { method: 'PUT', body: fact }),
  saveSection: (section: ProfileSection, value: unknown) => api<{ ok: true }>(`${base()}/profile/${section}`, { method: 'PUT', body: { value } }),
  draftTemplate: (key: TemplateId, body: string) => api<{ version: number }>(`${base()}/templates`, { method: 'POST', body: { key, body } }),
  templateOp: (key: TemplateId, version: number, op: 'approve' | 'archive') => api(`${base()}/templates/${key}/${version}/${op}`, { method: 'POST', body: {} }),
  saveFaq: (input: { id?: string; intent: string; keywords: string[]; answer: string }) => api<{ id: string }>(`${base()}/faq`, { method: 'POST', body: input }),
  faqOp: (id: string, op: 'approve' | 'archive') => api(`${base()}/faq/${encodeURIComponent(id)}/${op}`, { method: 'POST', body: {} }),
  decisions: (q: DecisionQuery = {}) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])
    return api<{ decisions: ShadowDecisionRow[] }>(`${base()}/shadow-decisions${p.size ? `?${p}` : ''}`)
  },
  feedback: (decisionId: number, verdict: Verdict, comment: string) => api(`${base()}/shadow-decisions/${decisionId}/feedback`, { method: 'POST', body: { verdict, comment } }),
  metrics: () => api<PilotMetrics>(`${base()}/pilot-metrics`),
  importCustomers: (rows: { line: number; row: ImportRow }[], source: ImportSource, dryRun: boolean) =>
    api<{ plan: PlannedRow[]; summary: Record<string, number>; imported: number }>(`${base()}/import/customers`, { method: 'POST', body: { rows, source, dryRun } }),
}

export type { PilotStatus }
