/**
 * Ce dont chaque capacité de NOVIA a besoin, en clair.
 *
 * Une SEULE table, lue par deux consommateurs :
 * - le moteur (engine/orchestration.ts) : une exigence non remplie BLOQUE l'automatisation
 *   et la ShadowDecision donne la raison lisible (« Modèle de relance absence : estimé ») ;
 * - la vue « Préparation du pilote » (pilot/readiness.ts) : ce qui bloque chaque capacité.
 *
 * Règle : seule une valeur VÉRIFIÉE compte (ou une valeur de démo en simulation). Une valeur
 * ESTIMÉE n'est jamais traitée comme vérifiée.
 */
import { usable, type BusinessProfile, type TemplateId } from './profile'
import type { DataStatus } from './schema'

export type Capability = 'booking_online' | 'W02.confirmation' | 'W02.reschedule' | 'W02.reminder' | 'W03' | 'W04' | 'smartfill' | 'faq'

export interface Requirement {
  /** ce dont il s'agit, pour une professionnelle */
  label: string
  status: DataStatus
  /** condition sur la VALEUR (ex. : Planity n'envoie pas déjà de rappels) ; absente = seul le statut compte */
  valueOk?: boolean
  /** raison affichée quand la valeur bloque */
  valueReason?: string
}

const statusLabel: Record<DataStatus, string> = { unknown: 'inconnu', estimated: 'estimé, à confirmer', verified: 'vérifié', demo: 'exemple de démonstration' }
export const describeStatus = (s: DataStatus) => statusLabel[s]

const templateLabels: Record<TemplateId, string> = {
  'W02.confirmation': 'Texte de confirmation de RDV',
  'W02.reschedule': 'Texte de RDV déplacé',
  'W02.reminder': 'Texte de rappel de RDV',
  'W03.recovery': 'Texte de relance après annulation',
  'W04.recovery': 'Texte de relance après absence',
}
const tpl = (p: BusinessProfile, id: TemplateId): Requirement => ({ label: templateLabels[id], status: p.templates[id].status })

export function requirementsFor(p: BusinessProfile, cap: Capability): Requirement[] {
  const name: Requirement = { label: 'Nom commercial', status: p.identity.name.status }
  const rules: Requirement = { label: 'Règles de messages (délais, plage d’envoi)', status: p.rules.status }
  switch (cap) {
    case 'booking_online':
      return [
        {
          label: 'Agenda de référence',
          status: p.schedule.authority.status,
          valueOk: p.schedule.authority.value === 'novia',
          valueReason: 'Planity fait foi pour l’agenda : NOVIA n’affiche aucun créneau comme disponible.',
        },
        { label: 'Horaires d’ouverture', status: p.identity.openingHours.status },
        { label: 'Pauses et fermetures', status: p.breaks.status },
        { label: 'Délai minimum et horizon de réservation', status: p.booking.status },
        { label: 'Prestations (prix, durées)', status: p.services.status },
      ]
    case 'W02.confirmation':
      return [tpl(p, 'W02.confirmation'), name]
    case 'W02.reschedule':
      return [tpl(p, 'W02.reschedule'), name]
    case 'W02.reminder':
      return [
        tpl(p, 'W02.reminder'),
        rules,
        name,
        {
          label: 'Rappels déjà envoyés par l’agenda (Planity)',
          status: p.schedule.externalReminders.status,
          valueOk: p.schedule.externalReminders.value === false,
          valueReason: 'L’agenda envoie déjà des rappels : NOVIA n’en ajoute pas (doublon).',
        },
      ]
    case 'W03':
      return [rules, tpl(p, 'W03.recovery')]
    case 'W04':
      return [rules, tpl(p, 'W04.recovery')]
    case 'smartfill':
      return [
        { label: 'Règles SmartFill (nombre de clientes sollicitées)', status: p.smartFill.status },
        { label: 'Prestations (prix, durées)', status: p.services.status },
      ]
    case 'faq':
      return [{ label: 'Réponses approuvées (FAQ)', status: p.approvedAnswers.status }]
  }
}

/** Exigence remplie ? (en simulation, une valeur de démonstration suffit) */
export const requirementMet = (r: Requirement, simulated: boolean) => usable(r.status, simulated) && r.valueOk !== false

/** Raison lisible d'une exigence non remplie. */
export function unmetReason(r: Requirement, simulated: boolean): string | undefined {
  if (!usable(r.status, simulated)) return `${r.label} : ${describeStatus(r.status)}.`
  if (r.valueOk === false) return r.valueReason ?? `${r.label} : valeur incompatible.`
  return undefined
}
