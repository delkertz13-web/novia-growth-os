/**
 * Vocabulaire de la verticale Nails (catégories, formes, longueurs). Ce n'est pas une
 * donnée d'entreprise : il est commun à tous les salons de la verticale.
 */
import type { GalleryCategory, NailLength, NailShape } from './schema'

export const galleryCategories: { id: GalleryCategory; label: string }[] = [
  { id: 'pose-complete', label: 'Pose complète' },
  { id: 'gel', label: 'Gel' },
  { id: 'french', label: 'French' },
  { id: 'nude', label: 'Nude' },
  { id: 'nail-art', label: 'Nail art' },
  { id: 'semi-permanent', label: 'Semi-permanent' },
]

export const shapeLabels: Record<NailShape, string> = {
  amande: 'Amande',
  carree: 'Carrée',
  ballerine: 'Ballerine',
  ovale: 'Ovale',
  stiletto: 'Stiletto',
  squoval: 'Squoval',
}

export const lengthLabels: Record<NailLength, string> = {
  courte: 'Courte',
  moyenne: 'Moyenne',
  longue: 'Longue',
}
