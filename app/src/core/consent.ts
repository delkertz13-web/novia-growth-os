/**
 * Registre de consentement (ajout seul) et sa projection.
 *
 * Le registre garde TOUT l'historique : canal, finalité, état, source, date et preuve.
 * Les champs `consent` et `optOut` de la cliente n'en sont qu'une projection, recalculée
 * ici et nulle part ailleurs. Les règles (gardes, SmartFill, STOP) lisent la projection.
 *
 * Règle STOP (figée le 2026-11-06), traduite dans le registre :
 * - un enregistrement `opposed` pose l'opposition ;
 * - rien ne la lève, ni une réservation, ni une conversation, ni un nouveau « granted »
 *   venant d'un formulaire : SEULE une réinscription explicite (`explicit_resubscribe`,
 *   avec preuve) la retire.
 */
import type { ConsentChannel, ConsentPurpose, ConsentRecord, ConsentSource, ConsentState, Customer } from './types'

export interface ConsentProjection {
  consent: { transactional: boolean; marketing: boolean }
  optOut: boolean
}

/** Canaux pris en compte par la projection : le canal de messagerie du pilote (SMS) ou « tous ». */
const projected = (channel: ConsentChannel) => channel === 'sms' || channel === 'all'

export function projectConsent(records: ConsentRecord[]): ConsentProjection {
  const p: ConsentProjection = { consent: { transactional: false, marketing: false }, optOut: false }
  for (const r of records) {
    if (!projected(r.channel)) continue
    if (r.state === 'opposed') {
      p.optOut = true
      continue
    }
    if (r.purpose === 'transactional') {
      p.consent.transactional = r.state === 'granted'
      continue
    }
    if (r.state === 'withdrawn') p.consent.marketing = false
    else {
      p.consent.marketing = true
      if (r.source === 'explicit_resubscribe') p.optOut = false
    }
  }
  return p
}

export class ConsentError extends Error {}

export interface ConsentChange {
  channel: ConsentChannel
  purpose: ConsentPurpose
  state: ConsentState
  source: ConsentSource
  proofRef?: string
}

/** Valide une modification : la levée d'une opposition exige une réinscription explicite prouvée. */
export function checkConsentChange(change: ConsentChange) {
  if (change.source === 'explicit_resubscribe' && (change.state !== 'granted' || !change.proofRef))
    throw new ConsentError('Une réinscription doit être explicite, accordée et prouvée (preuve obligatoire).')
  if (change.state === 'opposed' && change.source !== 'inbound_stop' && change.source !== 'pro_declared' && change.source !== 'import' && change.source !== 'demo')
    throw new ConsentError('Une opposition vient de la cliente (STOP) ou est déclarée par la professionnelle.')
}

/** Ajoute un enregistrement au registre et recalcule la projection. */
export function applyConsent(customer: Customer, record: ConsentRecord): Customer {
  checkConsentChange(record)
  const consents = [...customer.consents, record]
  return { ...customer, consents, ...projectConsent(consents) }
}

/** Historique initial cohérent avec un état connu (import d'un fichier existant, scénario de démo). */
export function initialConsents(
  idPrefix: string,
  at: string,
  state: ConsentProjection,
  source: Extract<ConsentSource, 'import' | 'demo' | 'booking_form'>,
  proofRef?: string,
): ConsentRecord[] {
  const base = { at, channel: 'sms' as const, source, proofRef }
  const records: ConsentRecord[] = [
    { ...base, id: `${idPrefix}-t`, purpose: 'transactional', state: state.consent.transactional ? 'granted' : 'withdrawn' },
    { ...base, id: `${idPrefix}-m`, purpose: 'marketing', state: state.consent.marketing ? 'granted' : 'withdrawn' },
  ]
  if (state.optOut) records.push({ ...base, id: `${idPrefix}-stop`, purpose: 'marketing', state: 'opposed' })
  return records
}
