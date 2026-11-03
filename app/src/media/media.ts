import generated from './manifest.generated.json'
import type { MediaAsset, MediaManifest } from './types'

/** Manifeste produit par `npm run media`. Ne pas éditer à la main. */
export const manifest = generated as unknown as MediaManifest

/** Emplacements de l'accueil. La galerie utilise les identifiants de `content.demo.ts`. */
export const heroSlots = {
  /** photo de fond du Hero */
  photo: 'hero',
  /** même scène, main/sujet détouré sur fond transparent (plan de profondeur) */
  cutout: 'hero-cutout',
} as const

export const mediaUrl = (a: Pick<MediaAsset, 'id' | 'hash'>, width: number, ext: string) => `/media/${a.id}.${a.hash}-${width}.${ext}`

export const srcSet = (a: MediaAsset, ext: string) => a.widths.map((w) => `${mediaUrl(a, w, ext)} ${w}w`).join(', ')

/** Taille servie par défaut (balise img) : la plus proche de 960 px. */
export const defaultWidth = (a: MediaAsset) => a.widths.reduce((best, w) => (Math.abs(w - 960) < Math.abs(best - 960) ? w : best), a.widths[0])

export const objectPosition = (a: Pick<MediaAsset, 'focal'>) => {
  const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5))
  return `${Math.round(clamp(a.focal[0]) * 100)}% ${Math.round(clamp(a.focal[1]) * 100)}%`
}

/** Premier visuel disponible parmi une liste d'identifiants (ex. Hero puis visuel de galerie). */
export function resolveMedia(ids: string | readonly (string | undefined)[], source: MediaManifest = manifest): MediaAsset | undefined {
  const list = typeof ids === 'string' ? [ids] : ids
  for (const id of list) if (id && source.assets[id]) return source.assets[id]
  return undefined
}

/** Vrai si au moins un visuel du groupe est fictif : la mention de provenance doit alors s'afficher. */
export const hasFictionalMedia = (group?: MediaAsset['group'], source: MediaManifest = manifest) =>
  Object.values(source.assets).some((a) => (!group || a.group === group) && a.provenance === 'fictif')

export const provenanceNote = (source: MediaManifest = manifest) =>
  source.provenance.note || 'Visuels fictifs créés pour la démonstration. Ce ne sont pas des réalisations du salon.'
