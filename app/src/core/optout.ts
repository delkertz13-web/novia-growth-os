/**
 * Règle STOP (opposition), figée par kertz le 2026-11-06.
 *
 * STOP interdit à NOVIA d'INITIER une communication de prospection, de relance ou de
 * réactivation : récupérations d'absence ou d'annulation, réactivation, SmartFill,
 * parrainage, toute nouvelle séquence marketing.
 *
 * STOP n'empêche pas de répondre à une demande que la cliente initie elle-même
 * (question, demande de créneau, réservation). Répondre, ou la laisser réserver, ne
 * retire JAMAIS l'opposition : seule une action explicite et distincte de la cliente
 * pourrait la lever (non proposée dans la démo).
 */
import type { Customer } from './types'

type Contact = Pick<Customer, 'optOut' | 'consent' | 'humanTakeover'>

/** NOVIA peut-elle écrire la première à cette cliente (relance, SmartFill, réactivation…) ? */
export const mayInitiateOutbound = (c: Contact) => !c.optOut && c.consent.marketing && !c.humanTakeover

/** Une demande entrante de la cliente peut toujours être traitée, opposition ou non. */
export const mayAnswerInbound = (_c: Contact) => true

export const optOutReason = 'Opposition enregistrée : la cliente a répondu STOP. NOVIA ne la relance pas.'
