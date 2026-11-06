import type { Appointment, AttributionSource, Opportunity, OpportunityKind } from './types'

export type RevenueLevel = 'potential' | 'booked' | 'confirmed'

export const levelLabels: Record<RevenueLevel, string> = {
  potential: 'CA potentiel',
  booked: 'CA réservé',
  confirmed: 'CA confirmé',
}

export const sourceLabels: Record<AttributionSource, string> = {
  acquisition: 'Acquisition',
  cancellation_recovery: 'Annulations récupérées',
  noshow_recovery: 'Absences récupérées',
  reactivation: 'Réactivation',
  referral: 'Parrainage',
  smartfill: 'Créneaux remplis',
  voice: 'NOVIA Voice',
  direct: 'Sans action NOVIA',
}

const opportunitySource: Record<OpportunityKind, AttributionSource> = {
  smartfill: 'smartfill',
  cancellation_recovery: 'cancellation_recovery',
  noshow_recovery: 'noshow_recovery',
}

export type Totals = Record<RevenueLevel, number>
const zero = (): Totals => ({ potential: 0, booked: 0, confirmed: 0 })

/**
 * Niveau de revenu d'un rendez-vous — un rendez-vous n'est compté qu'à UN niveau.
 * - réservé : RDV actif, ou présence attestée sans preuve de paiement ;
 * - confirmé : présence attestée ET preuve (fictive en démo) ;
 * - annulé, reporté (remplacé), absent : aucun revenu.
 * Une réservation n'est jamais présentée comme encaissée.
 */
export function appointmentLevel(a: Appointment): RevenueLevel | null {
  switch (a.status) {
    case 'booked':
    case 'confirmed':
      return 'booked'
    case 'showed':
    case 'completed':
      return a.paymentProof ? 'confirmed' : 'booked'
    default:
      return null
  }
}

export interface RevenueReport {
  totals: Totals
  bySource: Record<AttributionSource, Totals>
  /** montants réservés dont la prestation est attestée mais sans preuve de paiement */
  awaitingProof: number
}

export function computeRevenue(
  appointments: Appointment[],
  opportunities: Opportunity[],
  period?: { from: Date; to: Date },
): RevenueReport {
  const inPeriod = (iso?: string) => {
    if (!period || !iso) return true
    const t = new Date(iso).getTime()
    return t >= period.from.getTime() && t < period.to.getTime()
  }
  const totals = zero()
  const bySource = Object.fromEntries(Object.keys(sourceLabels).map((k) => [k, zero()])) as Record<
    AttributionSource,
    Totals
  >
  let awaitingProof = 0

  for (const a of appointments) {
    if (!inPeriod(a.start)) continue
    const level = appointmentLevel(a)
    if (!level) continue
    const amount = level === 'confirmed' ? a.paymentProof!.amount : a.price
    totals[level] += amount
    bySource[a.attribution][level] += amount
    if (level === 'booked' && a.status === 'showed') awaitingProof += amount
  }

  // Potentiel : le revenu d'un rendez-vous perdu (absence, annulation) qui n'a pas
  // encore été regagné. Un même RDV perdu peut ouvrir deux opportunités (relancer la
  // cliente ET proposer le créneau via SmartFill) : il n'est compté qu'UNE fois.
  // Dès qu'une de ses opportunités est gagnée, il sort du potentiel (le revenu regagné
  // est alors compté via le nouveau rendez-vous).
  for (const group of groupBySource(opportunities)) {
    if (group.some((o) => o.status === 'won')) continue
    const open = group.filter((o) => o.status === 'open').sort((a, b) => Number(a.kind === 'smartfill') - Number(b.kind === 'smartfill'))[0]
    if (!open || !inPeriod(open.slotStart ?? open.createdAt)) continue
    totals.potential += open.amount
    bySource[opportunitySource[open.kind]].potential += open.amount
  }

  return { totals, bySource, awaitingProof }
}

/** Opportunités regroupées par rendez-vous d'origine (une opportunité sans origine forme son propre groupe). */
function groupBySource(opportunities: Opportunity[]): Opportunity[][] {
  const groups = new Map<string, Opportunity[]>()
  for (const o of opportunities) {
    const key = o.sourceAppointmentId ?? `#${o.id}`
    groups.set(key, [...(groups.get(key) ?? []), o])
  }
  return [...groups.values()]
}

export const formatEUR = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
