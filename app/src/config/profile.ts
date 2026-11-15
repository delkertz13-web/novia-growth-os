/**
 * BusinessProfile : tout ce qui distingue une entreprise d'une autre.
 *
 * Le noyau (src/core) et le moteur (src/engine) sont identiques pour tous les clients ;
 * seul ce profil change. Il est chargé au démarrage et INJECTÉ (jamais importé en dur
 * par le code générique). Chaque valeur garde son niveau de preuve (unknown / demo /
 * verified) : une valeur non vérifiée dont dépend une automatisation la BLOQUE dès que
 * NOVIA n'est plus en simulation (voir `usable` et engine/policy.ts).
 *
 * P1 : modèle + injection uniquement. Pas d'écran de réglages complet.
 */
import type { BusinessId, NoviaSettings, VoiceCall } from '../core/types'
import type { BusinessConfig, DataStatus, FaqItem, Field, GalleryCategory, GalleryItem, ReviewItem, ServiceConfig, WorkflowRules } from './schema'

export interface ApprovedAnswer {
  id: string
  topic: string
  /** mots-clés (sans accents, en minuscules) qui déclenchent la réponse */
  keywords: string[]
  answer: string
}

/**
 * Modèles des messages que NOVIA envoie d'elle-même. Variables : {business}, {firstName},
 * {service}, {when}, {reminders}. Un modèle non vérifié bloque l'envoi réel.
 */
export type TemplateId = 'W02.confirmation' | 'W02.reschedule' | 'W02.reminder' | 'W03.recovery' | 'W04.recovery'

export interface Break {
  /** 0 = dimanche … 6 = samedi */
  weekday: number
  start: string
  end: string
}

export interface BookingPolicy {
  /** délai minimal avant un créneau réservable en ligne */
  minNoticeHours: number
  /** horizon de réservation */
  maxAdvanceDays: number
  slotStepMin: number
  /** battement entre deux prestations */
  bufferMin: number
}

export interface CancellationPolicy {
  /** annulation sans frais jusqu'à N heures avant */
  freeCancellationHours: number
  /** texte affiché à la cliente */
  text: string
}

export interface SmartFillPolicy {
  /** nombre maximal de clientes sollicitées pour un créneau */
  maxContacts: number
}

export interface VoicePolicy {
  defaultMode: VoiceCall['trigger']
  greeting: string
}

export interface ConsentPolicy {
  /** texte de la case de consentement marketing (preuve) */
  marketingOptInText: string
}

export interface AttributionPolicy {
  /** une réservation après relance n'est attribuée à NOVIA que dans ce délai */
  recoveryWindowDays: number
}

/** Contenu public du site de réservation. */
export interface SiteContent {
  gallery: GalleryItem[]
  reviews: ReviewItem[]
  faq: FaqItem[]
  /** prestation proposée depuis une catégorie de la galerie */
  serviceForCategory: Partial<Record<GalleryCategory, string>>
}

export interface BusinessProfile {
  businessId: BusinessId
  /** identité, contact, FUSEAU et horaires d'ouverture */
  identity: BusinessConfig
  services: { status: DataStatus; items: ServiceConfig[] }
  breaks: Field<Break[]>
  booking: Field<BookingPolicy>
  cancellation: Field<CancellationPolicy>
  /** W01–W04 : rappels, délais de récupération, plage d'envoi par défaut */
  rules: WorkflowRules
  smartFill: Field<SmartFillPolicy>
  voice: Field<VoicePolicy>
  consent: Field<ConsentPolicy>
  attribution: Field<AttributionPolicy>
  /** réglages initiaux d'une nouvelle entreprise (la pro les modifie ensuite dans NOVIA) */
  defaultSettings: NoviaSettings
  templates: Record<TemplateId, Field<string>>
  /** réponses que NOVIA peut donner seule (approuvées par la pro) */
  approvedAnswers: Field<ApprovedAnswer[]>
  /** sujets que NOVIA ne traite jamais seule */
  sensitiveKeywords: string[]
  content: SiteContent
}

/** Fuseau du salon : toute lecture d'un jour ou d'une heure passe par lui. */
export const timeZoneOf = (p: BusinessProfile) => p.identity.timezone.value

/**
 * Une valeur est-elle utilisable ? En simulation (démo), les valeurs de démonstration
 * suffisent. Dès que NOVIA calcule pour de vrai (shadow) ou agit (live), seule une valeur
 * VÉRIFIÉE par l'établissement l'est.
 */
export const usable = (status: DataStatus, simulated: boolean) => status === 'verified' || (simulated && status === 'demo')

export const serviceOf = (p: BusinessProfile, id: string) => p.services.items.find((s) => s.id === id)

/** Remplit un modèle de message : `{firstName}` → valeur. Une variable absente reste visible. */
export function renderTemplate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all))
}
