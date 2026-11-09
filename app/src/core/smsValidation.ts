import { formatIn } from './time'
import type { Appointment, ValidationOutcome } from './types'

const codes: Record<string, ValidationOutcome> = { '1': 'present', '2': 'absent', '3': 'cancelled', '4': 'rescheduled' }

const hhmm = (iso: string, tz: string) => formatIn(iso, tz, { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')

/**
 * Message de validation envoyé à la professionnelle (spécification W02).
 * Avec plusieurs RDV en attente, chaque ligne porte un identifiant à rappeler dans la réponse.
 */
export function buildValidationSms(pending: { appointment: Appointment; customerName: string }[], timeZone: string): string {
  const header = 'NOVIA — statut à confirmer'
  const legend = '1 = Présente\n2 = Absente\n3 = Annulée\n4 = Reportée'
  if (pending.length === 1) {
    const { appointment, customerName } = pending[0]
    return `${header}\n${customerName} — ${hhmm(appointment.start, timeZone)}\n${legend}`
  }
  const lines = pending.map(({ appointment, customerName }) => `${appointment.ref} · ${customerName} — ${hhmm(appointment.start, timeZone)}`)
  return `${header}\n${lines.join('\n')}\n${legend}\nRépondre : identifiant + chiffre (ex. ${pending[0].appointment.ref} 1)`
}

export type ParsedReply =
  | { ok: true; ref: string; outcome: ValidationOutcome }
  | { ok: false; reason: 'ambiguous' | 'unknown_ref' | 'invalid' }

/**
 * Interprète la réponse de la professionnelle.
 * Une réponse ambiguë n'est jamais appliquée arbitrairement.
 */
export function parseValidationReply(text: string, pendingRefs: string[]): ParsedReply {
  const t = text.trim().toUpperCase()
  const withRef = t.match(/^([A-Z]+\d+)\s*[:\-\s]\s*([1-4])$/)
  if (withRef) {
    const [, ref, code] = withRef
    if (!pendingRefs.includes(ref)) return { ok: false, reason: 'unknown_ref' }
    return { ok: true, ref, outcome: codes[code] }
  }
  if (/^[1-4]$/.test(t)) {
    if (pendingRefs.length === 1) return { ok: true, ref: pendingRefs[0], outcome: codes[t] }
    return { ok: false, reason: 'ambiguous' }
  }
  return { ok: false, reason: 'invalid' }
}
