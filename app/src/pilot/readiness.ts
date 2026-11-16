/**
 * PILOT READINESS : où en est chaque capacité de NOVIA, et pourquoi.
 *
 * Pas de score en pourcentage : un état par capacité, avec ses raisons.
 * - BLOCKED           : une donnée nécessaire manque, n'est qu'estimée, ou l'interdit ;
 * - NOT_CONFIGURED    : la capacité n'existe pas encore dans ce pilote (ex. Voice) ;
 * - READY_FOR_SHADOW  : NOVIA peut décider en mode shadow (sans rien envoyer) ;
 * - READY_FOR_TEST / READY_FOR_LIVE : niveaux suivants, INATTEIGNABLES en P3 (aucun transport).
 *
 * Les exigences du MOTEUR viennent de config/requirements.ts (la même table que celle qui
 * bloque les décisions) ; s'y ajoutent les prérequis du pilote tirés de la fiche de
 * préparation (ex. consentement marketing des clientes connu avant SmartFill).
 */
import type { BusinessProfile } from '../config/profile'
import { requirementMet, requirementsFor, unmetReason, type Capability, type Requirement } from '../config/requirements'
import type { NoviaSettings } from '../core/types'
import { factOf, profileItems, type Facts } from './onboarding'

export type ReadinessLevel = 'BLOCKED' | 'NOT_CONFIGURED' | 'READY_FOR_SHADOW' | 'READY_FOR_TEST' | 'READY_FOR_LIVE'
/** plafond de P3 : aucun transport n'existe, donc jamais au-delà du shadow */
export const P3_CEILING: ReadinessLevel = 'READY_FOR_SHADOW'

export interface CapabilityReadiness {
  id: Capability | 'voice' | 'observed_agenda'
  title: string
  level: ReadinessLevel
  /** pourquoi (bloquants) ou ce qui le permet */
  reasons: string[]
  requirements: { label: string; ok: boolean; status?: string }[]
  /** automatisation coupée dans les réglages (prête, mais NOVIA n'observera rien tant qu'elle est coupée) */
  disabled?: boolean
}

const factReq = (facts: Facts, key: string, label: string): Requirement => ({ label, status: factOf(facts, key).status })

const CAPS: { id: Capability; title: string; extra?: (f: Facts) => Requirement[]; automation?: keyof NoviaSettings['automations'] }[] = [
  { id: 'booking_online', title: 'Réservation en ligne par NOVIA' },
  { id: 'W02.confirmation', title: 'W02 · Confirmation de RDV' },
  { id: 'W02.reminder', title: 'W02 · Rappel de RDV' },
  { id: 'W02.reschedule', title: 'W02 · RDV déplacé' },
  { id: 'W03', title: 'W03 · Relance après annulation', automation: 'cancellationRecovery' },
  { id: 'W04', title: 'W04 · Relance après absence', automation: 'noShowRecovery' },
  {
    id: 'smartfill',
    title: 'SmartFill · Remplir un créneau libéré',
    automation: 'smartFill',
    extra: (f) => [factReq(f, 'clients.marketingConsent', 'Consentement marketing des clientes')],
  },
  { id: 'faq', title: 'Réponses automatiques (FAQ approuvée)' },
]

export function assessReadiness(profile: BusinessProfile, facts: Facts, settings: NoviaSettings): CapabilityReadiness[] {
  const out: CapabilityReadiness[] = [
    {
      id: 'observed_agenda',
      title: 'Agenda observé (saisie des RDV)',
      ...(profile.services.items.length
        ? { level: 'READY_FOR_SHADOW' as const, reasons: ['Les RDV saisis ou importés sont observés par NOVIA (copie : l’agenda qui fait foi reste celui déclaré).'] }
        : { level: 'BLOCKED' as const, reasons: ['Aucune prestation saisie : impossible d’enregistrer un RDV.'] }),
      requirements: [{ label: 'Au moins une prestation (même estimée)', ok: profile.services.items.length > 0 }],
    },
  ]
  for (const c of CAPS) {
    const reqs = [...requirementsFor(profile, c.id), ...(c.extra?.(facts) ?? [])]
    const reasons = reqs.map((r) => unmetReason(r, false)).filter((x): x is string => !!x)
    const disabled = c.automation ? !settings.automations[c.automation] : undefined
    out.push({
      id: c.id,
      title: c.title,
      level: reasons.length ? 'BLOCKED' : P3_CEILING,
      reasons: reasons.length ? reasons : [disabled ? 'Données vérifiées. Automatisation coupée dans les réglages : NOVIA n’observera rien tant qu’elle reste coupée.' : 'Données vérifiées : NOVIA décide en shadow, sans rien envoyer.'],
      requirements: reqs.map((r) => ({ label: r.label, ok: requirementMet(r, false), status: r.status })),
      ...(disabled !== undefined ? { disabled } : {}),
    })
  }
  out.push({
    id: 'voice',
    title: 'NOVIA Voice',
    level: 'NOT_CONFIGURED',
    reasons: ['Aucun service d’appel n’est branché dans ce pilote (P3).'],
    requirements: [],
  })
  return out
}

/** Ce qui est inconnu / estimé / vérifié, profil et fiche confondus. */
export function completeness(profile: BusinessProfile, facts: Facts, factLabels: { key: string; label: string; section: string }[]) {
  const items = [
    ...profileItems(profile),
    ...factLabels.map((f) => ({ section: f.section, label: f.label, status: factOf(facts, f.key).status })),
  ]
  return {
    unknown: items.filter((i) => i.status === 'unknown'),
    estimated: items.filter((i) => i.status === 'estimated'),
    verified: items.filter((i) => i.status === 'verified'),
  }
}
