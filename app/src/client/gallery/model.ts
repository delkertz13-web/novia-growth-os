/**
 * Galerie — logique pure (filtres, vues, lien de réservation), testée à part.
 * Aucune dépendance au DOM ni à React.
 */
import { galleryCategories, serviceForCategory } from '../../config/content.demo'
import type { GalleryCategory, GalleryItem, NailLength, NailShape } from '../../config/schema'

export type GalleryView = 'portfolio' | 'grille'

export interface GalleryFilters {
  cat: GalleryCategory | 'all'
  shape: NailShape | 'all'
  length: NailLength | 'all'
}

export const noFilters: GalleryFilters = { cat: 'all', shape: 'all', length: 'all' }

/** Lit la vue et la catégorie dans l'URL (`?vue=grille&cat=french`). Valeurs inconnues ignorées. */
export function parseGalleryParams(params: URLSearchParams): { view: GalleryView; cat: GalleryFilters['cat'] } {
  const view: GalleryView = params.get('vue') === 'grille' ? 'grille' : 'portfolio'
  const raw = params.get('cat')
  const cat = galleryCategories.some((c) => c.id === raw) ? (raw as GalleryCategory) : 'all'
  return { view, cat }
}

export function filterGallery(items: readonly GalleryItem[], f: GalleryFilters): GalleryItem[] {
  return items.filter(
    (g) => (f.cat === 'all' || g.category === f.cat) && (f.shape === 'all' || g.shape === f.shape) && (f.length === 'all' || g.length === f.length),
  )
}

/** Catégories réellement présentes, dans l'ordre de la configuration, avec leur nombre de visuels. */
export function categoriesWithCount(items: readonly GalleryItem[]) {
  return galleryCategories
    .map((c) => ({ ...c, count: items.filter((g) => g.category === c.id).length }))
    .filter((c) => c.count > 0)
}

/** Valeurs distinctes d'un critère. Un filtre à une seule valeur n'a pas de sens et n'est pas affiché. */
export function distinct<K extends 'shape' | 'length'>(items: readonly GalleryItem[], key: K): GalleryItem[K][] {
  return Array.from(new Set(items.map((g) => g[key])))
}

/**
 * Liste parcourue dans la visionneuse : la sélection filtrée si elle contient la pose
 * ouverte, sinon toute la galerie (ouverture depuis l'accueil, filtre changé entre-temps).
 */
export function viewerList(all: readonly GalleryItem[], filtered: readonly GalleryItem[], openId: string): readonly GalleryItem[] {
  return filtered.some((g) => g.id === openId) ? filtered : all
}

export const serviceIdForPose = (g: GalleryItem) => serviceForCategory[g.category]

/** Lien « Je veux cette pose » : prestation correspondante présélectionnée, pose gardée en inspiration. */
export function bookingHref(g: GalleryItem) {
  const q = new URLSearchParams({ service: serviceIdForPose(g), inspiration: g.id })
  return `/reserver?${q.toString()}`
}
