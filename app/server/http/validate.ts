/**
 * Validation des entrées de l'API : une LISTE BLANCHE de commandes, champ par champ.
 * Tout ce qui n'est pas attendu est refusé. Le navigateur ne choisit jamais : la source,
 * l'identifiant d'événement, l'entreprise, la date (posés par le serveur), ni les
 * entrées internes (échéances, statuts de livraison) ni une origine SmartFill / Voice.
 */
import type { Draft } from '../../src/engine/engine'

export class InputError extends Error {}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

function str(o: Obj, k: string, opts: { max?: number; optional?: boolean; pattern?: RegExp } = {}): string | undefined {
  const v = o[k]
  if (v === undefined && opts.optional) return undefined
  if (typeof v !== 'string' || !v.trim() || v.length > (opts.max ?? 200) || (opts.pattern && !opts.pattern.test(v))) throw new InputError(`Champ invalide : ${k}`)
  return v
}
function bool(o: Obj, k: string): boolean {
  if (typeof o[k] !== 'boolean') throw new InputError(`Champ invalide : ${k}`)
  return o[k] as boolean
}
function oneOf<T extends string>(o: Obj, k: string, values: readonly T[], optional = false): T | undefined {
  const v = o[k]
  if (v === undefined && optional) return undefined
  if (!values.includes(v as T)) throw new InputError(`Champ invalide : ${k}`)
  return v as T
}
function date(o: Obj, k: string): string {
  const v = str(o, k, { max: 40 })!
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw new InputError(`Date invalide : ${k}`)
  return d.toISOString()
}
const ID = /^[A-Za-z0-9_-]{1,80}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
function noExtra(o: Obj, allowed: string[]) {
  const extra = Object.keys(o).filter((k) => !allowed.includes(k))
  if (extra.length) throw new InputError(`Champ non autorisé : ${extra.join(', ')}`)
}

function contact(v: unknown) {
  if (!isObj(v)) throw new InputError('Coordonnées invalides')
  noExtra(v, ['firstName', 'lastName', 'phone', 'email'])
  // une cliente se reconnaît à son téléphone OU à son e-mail (au moins l'un des deux)
  const blank = (k: string) => v[k] === undefined || v[k] === ''
  if (blank('phone') && blank('email')) throw new InputError('Téléphone ou e-mail requis.')
  return {
    firstName: str(v, 'firstName', { max: 60 })!,
    lastName: str(v, 'lastName', { max: 60 })!,
    phone: blank('phone') ? '' : str(v, 'phone', { max: 30, pattern: /^[+0-9 ().-]{6,30}$/ })!,
    email: blank('email') ? '' : str(v, 'email', { max: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })!,
  }
}

const leadSources = ['site', 'instagram', 'facebook', 'chatbot', 'manual', 'phone', 'referral'] as const
const statusSource = ['cockpit'] as const

/** Commandes de la professionnelle (cockpit NOVIA Pro). */
export function parseCommand(body: unknown): Draft {
  if (!isObj(body)) throw new InputError('Commande invalide')
  const type = body.type
  switch (type) {
    case 'BookingCreated': {
      noExtra(body, ['type', 'serviceId', 'start', 'customerId', 'contact', 'leadSource', 'origin', 'marketingConsent'])
      const mc = body.marketingConsent
      if (mc !== undefined && (!isObj(mc) || typeof mc.granted !== 'boolean' || typeof mc.proofRef !== 'string' || mc.proofRef.length > 300)) throw new InputError('Consentement invalide')
      if (body.customerId === undefined && body.contact === undefined) throw new InputError('Cliente ou coordonnées requises')
      return {
        type,
        serviceId: str(body, 'serviceId', { pattern: ID })!,
        start: date(body, 'start'),
        customerId: str(body, 'customerId', { optional: true, pattern: ID }),
        contact: body.contact === undefined ? undefined : contact(body.contact),
        leadSource: oneOf(body, 'leadSource', leadSources)!,
        origin: oneOf(body, 'origin', ['site', 'pro'] as const)!,
        marketingConsent: mc as { granted: boolean; proofRef: string } | undefined,
      }
    }
    case 'ContactUpserted':
      noExtra(body, ['type', 'contact', 'leadSource'])
      return { type, contact: contact(body.contact), leadSource: oneOf(body, 'leadSource', leadSources)! }
    case 'AttendanceRecorded':
      noExtra(body, ['type', 'appointmentId', 'attended', 'statusSource'])
      return { type, appointmentId: str(body, 'appointmentId', { pattern: ID })!, attended: bool(body, 'attended'), statusSource: oneOf(body, 'statusSource', statusSource)! }
    case 'BookingCancelled':
      noExtra(body, ['type', 'appointmentId', 'statusSource'])
      return { type, appointmentId: str(body, 'appointmentId', { pattern: ID })!, statusSource: oneOf(body, 'statusSource', statusSource)! }
    case 'BookingRescheduled':
      noExtra(body, ['type', 'appointmentId', 'newStart', 'statusSource'])
      return { type, appointmentId: str(body, 'appointmentId', { pattern: ID })!, newStart: date(body, 'newStart'), statusSource: oneOf(body, 'statusSource', statusSource)! }
    case 'PaymentRecorded': {
      noExtra(body, ['type', 'appointmentId', 'method', 'amount'])
      // P2 : paiement DÉCLARÉ par la pro uniquement (ni démo, ni en ligne)
      const amount = body.amount
      if (amount !== undefined && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 100_000)) throw new InputError('Montant invalide')
      return { type, appointmentId: str(body, 'appointmentId', { pattern: ID })!, method: oneOf(body, 'method', ['declared'] as const)!, amount: amount as number | undefined }
    }
    case 'HumanTakeoverChanged':
      noExtra(body, ['type', 'customerId', 'value'])
      return { type, customerId: str(body, 'customerId', { pattern: ID })!, value: bool(body, 'value') }
    case 'ConsentChanged': {
      noExtra(body, ['type', 'customerId', 'change'])
      const ch = body.change
      if (!isObj(ch)) throw new InputError('Consentement invalide')
      noExtra(ch, ['channel', 'purpose', 'state', 'source', 'proofRef'])
      return {
        type,
        customerId: str(body, 'customerId', { pattern: ID })!,
        change: {
          channel: oneOf(ch, 'channel', ['sms', 'email', 'phone', 'instagram', 'all'] as const)!,
          purpose: oneOf(ch, 'purpose', ['transactional', 'marketing'] as const)!,
          state: oneOf(ch, 'state', ['granted', 'withdrawn', 'opposed'] as const)!,
          // la pro déclare (opposition orale, réinscription prouvée) ; un STOP vient d'un message
          source: oneOf(ch, 'source', ['pro_declared', 'explicit_resubscribe'] as const)!,
          proofRef: str(ch, 'proofRef', { optional: true, max: 300 }),
        },
      }
    }
    case 'AppointmentCorrected': {
      noExtra(body, ['type', 'appointmentId', 'start', 'serviceId'])
      if (body.start === undefined && body.serviceId === undefined) throw new InputError('Rien à corriger.')
      return {
        type,
        appointmentId: str(body, 'appointmentId', { pattern: ID })!,
        ...(body.start !== undefined ? { start: date(body, 'start') } : {}),
        ...(body.serviceId !== undefined ? { serviceId: str(body, 'serviceId', { pattern: ID })! } : {}),
      }
    }
    case 'WaitlistJoined': {
      noExtra(body, ['type', 'customerId', 'serviceId', 'days', 'periods'])
      const days = body.days
      const periods = body.periods
      if (!Array.isArray(days) || days.length > 7 || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) throw new InputError('Jours invalides.')
      if (!Array.isArray(periods) || periods.length > 3 || !periods.every((p) => ['matin', 'apres-midi', 'soir'].includes(p))) throw new InputError('Moments invalides.')
      return { type, customerId: str(body, 'customerId', { pattern: ID })!, serviceId: str(body, 'serviceId', { pattern: ID })!, days: [...new Set(days as number[])], periods: [...new Set(periods as ('matin' | 'apres-midi' | 'soir')[])] }
    }
    case 'OpportunityClosed':
      noExtra(body, ['type', 'opportunityId', 'reason'])
      return { type, opportunityId: str(body, 'opportunityId', { pattern: ID })!, reason: oneOf(body, 'reason', ['kept_free'] as const)! }
    case 'LaunchSmartFill':
      noExtra(body, ['type', 'opportunityId'])
      return { type, opportunityId: str(body, 'opportunityId', { pattern: ID })! }
    case 'ReplyAsPro':
      noExtra(body, ['type', 'conversationId', 'body'])
      return { type, conversationId: str(body, 'conversationId', { pattern: ID })!, body: str(body, 'body', { max: 1000 })! }
    case 'OpenConversation':
      noExtra(body, ['type', 'customerId', 'channel'])
      return { type, customerId: str(body, 'customerId', { pattern: ID })!, channel: oneOf(body, 'channel', ['sms'] as const)! }
    case 'MarkConversationRead':
      noExtra(body, ['type', 'conversationId'])
      return { type, conversationId: str(body, 'conversationId', { pattern: ID })! }
    case 'SettingsChanged': {
      noExtra(body, ['type', 'settings', 'voice'])
      const s = body.settings
      const v = body.voice
      const out: Draft = { type }
      if (s !== undefined) {
        if (!isObj(s)) throw new InputError('Réglages invalides')
        noExtra(s, ['automations', 'sendWindow', 'channels'])
        const patch: Obj = {}
        if (s.automations !== undefined) {
          if (!isObj(s.automations)) throw new InputError('Réglages invalides')
          noExtra(s.automations, ['cancellationRecovery', 'noShowRecovery', 'smartFill', 'rebooking', 'reviews', 'referral'])
          for (const k of Object.keys(s.automations)) bool(s.automations, k)
          patch.automations = s.automations
        }
        if (s.sendWindow !== undefined) {
          if (!isObj(s.sendWindow)) throw new InputError('Réglages invalides')
          noExtra(s.sendWindow, ['start', 'end'])
          for (const k of Object.keys(s.sendWindow)) str(s.sendWindow, k, { pattern: HHMM })
          patch.sendWindow = s.sendWindow
        }
        if (s.channels !== undefined) {
          if (!isObj(s.channels)) throw new InputError('Réglages invalides')
          noExtra(s.channels, ['sms', 'email', 'instagram'])
          for (const k of Object.keys(s.channels)) bool(s.channels, k)
          patch.channels = s.channels
        }
        out.settings = patch
      }
      if (v !== undefined) {
        if (!isObj(v)) throw new InputError('Réglages invalides')
        noExtra(v, ['active', 'mode'])
        out.voice = { ...(v.active !== undefined ? { active: bool(v, 'active') } : {}), ...(v.mode !== undefined ? { mode: oneOf(v, 'mode', ['all', 'missed', 'after_hours'] as const)! } : {}) }
      }
      return out
    }
    default:
      throw new InputError('Commande inconnue ou non autorisée')
  }
}

/**
 * Événements de TEST du pilote (P2 : aucun fournisseur réel). Identifiant d'événement
 * fourni par l'émetteur (c'est lui qui permet l'idempotence), source forcée `pilot-test`.
 */
export function parseTestEvent(body: unknown): Draft & { source: 'pilot-test'; eventId: string; occurredAt: string } {
  if (!isObj(body)) throw new InputError('Événement invalide')
  const eventId = str(body, 'eventId', { max: 100, pattern: /^[A-Za-z0-9:_.-]{1,100}$/ })!
  const occurredAt = body.occurredAt === undefined ? new Date().toISOString() : date(body, 'occurredAt')
  const version = body.version
  if (version !== undefined && (typeof version !== 'number' || !Number.isInteger(version) || version < 0)) throw new InputError('Version invalide')
  const { eventId: _e, occurredAt: _o, version: _v, ...rest } = body
  void _e
  void _o
  void _v
  let draft: Draft
  if (rest.type === 'InboundMessageReceived') {
    noExtra(rest, ['type', 'customerId', 'conversationId', 'channel', 'body'])
    draft = {
      type: 'InboundMessageReceived',
      customerId: str(rest, 'customerId', { optional: true, pattern: ID }),
      conversationId: str(rest, 'conversationId', { optional: true, pattern: ID }),
      channel: oneOf(rest, 'channel', ['sms', 'instagram', 'site'] as const)!,
      body: str(rest, 'body', { max: 1000 })!,
    }
  } else if (rest.type === 'BookingCancelled' || rest.type === 'AttendanceRecorded' || rest.type === 'BookingRescheduled' || rest.type === 'BookingCreated') {
    // un fait reçu d'un système externe (statut « integration »), jamais déduit de l'heure
    const withStatus = rest.type !== 'BookingCreated'
    const parsed = parseCommand(withStatus ? { ...rest, statusSource: 'cockpit' } : rest)
    draft = withStatus ? ({ ...parsed, statusSource: 'integration' } as Draft) : parsed
  } else throw new InputError('Type d’événement de test non autorisé')
  return { ...draft, source: 'pilot-test', eventId, occurredAt, ...(version !== undefined ? { version } : {}) } as Draft & { source: 'pilot-test'; eventId: string; occurredAt: string }
}
