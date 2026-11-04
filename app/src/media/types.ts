/**
 * Provenance d'un visuel.
 * - fictif : visuel créé pour la démonstration, jamais présenté comme une réalisation du salon
 * - reel   : réalisation réelle de l'établissement, droits vérifiés
 */
export type MediaProvenance = 'fictif' | 'reel'

/** Entrée produite par `npm run media` (voir scripts/media.mjs). */
export interface MediaAsset {
  id: string
  group: 'hero' | 'gallery'
  width: number
  height: number
  /** fond transparent (sujet détouré) */
  alpha: boolean
  hash: string
  widths: number[]
  fallback: 'jpg' | 'png'
  /** point focal, de 0 à 1 sur chaque axe */
  focal: [number, number]
  /** couleur dominante, affichée avant le chargement */
  tone: string
  /** aperçu flou en ligne (data URI) */
  lqip: string
  provenance: MediaProvenance
  credit?: string
}

export interface MediaManifest {
  version: number
  provenance: { default: MediaProvenance; note: string }
  assets: Record<string, MediaAsset>
}
