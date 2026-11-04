/**
 * Chaque valeur de configuration porte son niveau de preuve.
 * - unknown  : information réelle inconnue, rien n'est inventé à sa place
 * - demo     : exemple fictif pour la démonstration
 * - verified : donnée réelle validée par l'établissement
 */
export type DataStatus = 'unknown' | 'demo' | 'verified'

export interface Field<T> {
  value: T
  status: DataStatus
}

export const demo = <T,>(value: T): Field<T> => ({ value, status: 'demo' })
export const unknown = <T,>(placeholder: T): Field<T> => ({ value: placeholder, status: 'unknown' })

export interface OpeningHours {
  /** 0 = dimanche … 6 = samedi ; null = fermé */
  [weekday: number]: { open: string; close: string } | null
}

export interface BusinessConfig {
  name: Field<string>
  tagline: Field<string>
  artistFirstName: Field<string>
  city: Field<string>
  address: Field<string>
  phone: Field<string>
  email: Field<string>
  instagram: Field<string>
  googleReviewUrl: Field<string>
  timezone: Field<string>
  openingHours: Field<OpeningHours>
  currency: 'EUR'
}

export type ServiceCategory = 'pose' | 'entretien' | 'semi-permanent' | 'nail-art' | 'depose'

export interface ServiceConfig {
  id: string
  name: string
  description: string
  durationMin: number
  price: number
  deposit: number
  category: ServiceCategory
  /** délai recommandé avant le prochain rendez-vous (remplissage), null si sans objet */
  returnRecommendedAfterDays: number | null
  active: boolean
  /** id d'un visuel de la galerie pour illustrer la prestation */
  coverImageId: string
}

export type GalleryCategory = 'pose-complete' | 'gel' | 'french' | 'nude' | 'nail-art' | 'semi-permanent'
export type NailShape = 'amande' | 'carree' | 'ballerine' | 'ovale' | 'stiletto' | 'squoval'
export type NailLength = 'courte' | 'moyenne' | 'longue'

export interface GalleryItem {
  id: string
  title: string
  category: GalleryCategory
  shape: NailShape
  length: NailLength
  /**
   * Chemin explicite sous /public, servi tel quel (contourne le pipeline médias).
   * Normalement absent : le visuel vient de media-source/gallery/<id>.* via `npm run media`.
   */
  src?: string
  alt: string
  credit?: string
}

export interface FaqItem {
  q: string
  a: string
}

export interface ReviewItem {
  author: string
  rating: number
  text: string
  service: string
}

/** Paramètres W01–W04 : valeurs de démonstration, à configurer avant tout usage réel */
export interface WorkflowRules {
  status: DataStatus
  sendWindow: { start: string; end: string }
  w01: { followUpDelayHours: number; maxFollowUps: number }
  w02: { remindersHoursBefore: number[]; validationRequestDelayMin: number }
  w03: { waitBeforeRecoveryHours: number; lastFollowUpDelayHours: number }
  w04: { waitBeforeRecoveryHours: number; lastFollowUpDelayHours: number }
}
