/**
 * Contrats V2 des providers : la frontière entre NOVIA et les fournisseurs TECHNIQUES.
 *
 *   UI  →  NOVIA (application + moteur, src/domain + src/engine)  →  core (règles pures)
 *                         │
 *                         └→ ces contrats  →  Mock aujourd'hui · GHL / SMS direct / Voice / paiement demain
 *
 * Un provider ne DÉCIDE rien : il transporte (message, appel, miroir CRM, paiement) et
 * rapporte des faits (livraison, appel terminé, paiement reçu) sous forme d'événements.
 * Aucune règle NOVIA ne dépend d'un provider ; changer de messagerie (GHL ↔ SMS direct)
 * ne touche ni au moteur ni au noyau.
 *
 * Règles communes :
 * - tout est asynchrone (Promise) ;
 * - aucune exception ne sort : le résultat est explicite (`ProviderResult`) ;
 * - une erreur est typée et dit si elle est RETENTABLE ;
 * - toute écriture porte une `idempotencyKey` : rejouée, elle ne produit qu'un effet ;
 * - les objets créés chez le fournisseur sont référencés par `ExternalRef`.
 */
import type { Appointment, BusinessId, Customer, ExternalRef } from '../core/types'
import type { VoiceSettings } from '../core/types'

/* ------------------------------------------------------------------ */
/* Résultats et erreurs                                                 */
/* ------------------------------------------------------------------ */

export type ProviderErrorCode =
  | 'not_connected' // provider préparé mais non branché
  | 'unavailable' // panne, délai dépassé (retentable)
  | 'rate_limited' // trop de requêtes (retentable)
  | 'invalid_request' // donnée refusée (numéro invalide…) : ne pas retenter
  | 'rejected' // refus du fournisseur (opposition, compte suspendu) : ne pas retenter
  | 'unexpected' // exception imprévue, capturée par NOVIA (retentable)

export interface ProviderError {
  provider: string
  code: ProviderErrorCode
  message: string
  retryable: boolean
}

export type ProviderResult<T> = { ok: true; value: T } | { ok: false; error: ProviderError }

/** Toute écriture chez un fournisseur. */
export interface WriteRequest {
  businessId: BusinessId
  /** même clé → même effet, une seule fois */
  idempotencyKey: string
}

/* ------------------------------------------------------------------ */
/* Messagerie (SMS aujourd'hui ; GHL ou opérateur direct : décision ouverte) */
/* ------------------------------------------------------------------ */

export interface SendMessageRequest extends WriteRequest {
  to: { customerId: string; phone: string; name: string }
  channel: 'sms'
  body: string
  /** finalité : un fournisseur peut filtrer le marketing (heures, opposition) */
  purpose: 'transactional' | 'marketing' | 'conversation'
}

export interface SendMessageResult {
  externalRef: ExternalRef
  /** simulated : démo, rien n'est parti */
  status: 'accepted' | 'simulated'
}

export interface MessagingProvider {
  readonly name: string
  send(req: SendMessageRequest): Promise<ProviderResult<SendMessageResult>>
}

/* ------------------------------------------------------------------ */
/* Miroir CRM (optionnel : GHL peut en être un, il n'est jamais la base) */
/* ------------------------------------------------------------------ */

export interface CrmMirrorProvider {
  readonly name: string
  upsertContact(req: WriteRequest & { customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'phone' | 'email'>; marketingConsent: boolean; source: string }): Promise<ProviderResult<{ externalRef: ExternalRef }>>
  /** reflète STOP (ex. « ne pas déranger ») : l'opposition reste décidée par NOVIA */
  setOptOut(req: WriteRequest & { customerId: string; externalRef?: ExternalRef; optOut: boolean }): Promise<ProviderResult<void>>
}

/* ------------------------------------------------------------------ */
/* Voice                                                                */
/* ------------------------------------------------------------------ */

export interface VoiceProvider {
  readonly name: string
  /** pousse les réglages décidés dans NOVIA vers la plateforme téléphonique */
  configure(req: WriteRequest & { settings: VoiceSettings; greeting: string }): Promise<ProviderResult<void>>
}

/* ------------------------------------------------------------------ */
/* Paiement en ligne (phase P9 si besoin)                               */
/* ------------------------------------------------------------------ */

export interface PaymentProvider {
  readonly name: string
  /** lien de paiement d'acompte ; le paiement reçu revient en événement PaymentRecorded */
  createPaymentLink(req: WriteRequest & { appointment: Pick<Appointment, 'id' | 'deposit' | 'price'> }): Promise<ProviderResult<{ url: string; externalRef: ExternalRef }>>
}

/* ------------------------------------------------------------------ */
/* Agenda externe (scénario Planity A : Planity fait autorité sur l'agenda) */
/* ------------------------------------------------------------------ */

export interface BusyInterval {
  start: string
  end: string
  externalRef?: ExternalRef
}

export interface ExternalCalendarProvider {
  readonly name: string
  /** créneaux occupés connus du fournisseur, pour ne jamais proposer un créneau déjà pris */
  listBusy(req: { businessId: BusinessId; from: string; to: string }): Promise<ProviderResult<BusyInterval[]>>
}

/* ------------------------------------------------------------------ */
/* Horloge                                                              */
/* ------------------------------------------------------------------ */

/**
 * « Maintenant » pour NOVIA. En démo : heure de référence contrôlée ; en production :
 * heure système. L'heure n'est LUE que via ce provider ; elle n'est INTERPRÉTÉE (jour,
 * heure murale) que dans le fuseau du salon (core/time.ts).
 */
export interface ClockProvider {
  readonly mode: 'demo' | 'system'
  now(): Date
}

/** Les fournisseurs techniques d'une entreprise. Tous optionnels sauf l'horloge et la messagerie. */
export interface TechnicalProviders {
  clock: ClockProvider
  messaging: MessagingProvider
  crm?: CrmMirrorProvider
  voice?: VoiceProvider
  payment?: PaymentProvider
  calendar?: ExternalCalendarProvider
}
