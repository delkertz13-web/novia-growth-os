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
  noshow_recovery: 'No-shows récupérés',
  reactivation: 'Réactivation',
  referral: 'Parrainage',
  smartfill: 'SmartFill',
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

  // Potentiel : uniquement les opportunités encore ouvertes (une opportunité gagnée
  // est déjà comptée via son rendez-vous : pas de double compte).
  for (const o of opportunities) {
    if (o.status !== 'open' || !inPeriod(o.slotStart ?? o.createdAt)) continue
    totals.potential += o.amount
    bySource[opportunitySource[o.kind]].potential += o.amount
  }

  return { totals, bySource, awaitingProof }
}

export const formatEUR = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
