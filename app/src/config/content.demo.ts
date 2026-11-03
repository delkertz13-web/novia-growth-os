import type { FaqItem, GalleryCategory, GalleryItem, NailLength, NailShape, ReviewItem } from './schema'

/**
 * GALERIE — emplacements prêts à recevoir de vrais visuels.
 * Déposer les fichiers dans app/public/demo-media/gallery/ puis renseigner `src`
 * (voir app/public/demo-media/gallery/README.md). Sans `src`, un placeholder
 * clairement identifié s'affiche à la place.
 */
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

export const gallery: GalleryItem[] = [
  { id: 'g-pose-01', title: 'Pose complète laiteuse', category: 'pose-complete', shape: 'amande', length: 'longue', alt: 'Pose complète gel, forme amande longue, teinte laiteuse' },
  { id: 'g-french-01', title: 'French fine', category: 'french', shape: 'amande', length: 'moyenne', alt: 'French manucure fine sur forme amande moyenne' },
  { id: 'g-nude-01', title: 'Nude rosé', category: 'nude', shape: 'ovale', length: 'courte', alt: 'Ongles courts ovales, vernis nude rosé' },
  { id: 'g-art-01', title: 'Ligne graphique', category: 'nail-art', shape: 'carree', length: 'moyenne', alt: 'Nail art minimaliste à lignes graphiques, forme carrée' },
  { id: 'g-gel-01', title: 'Gel bordeaux', category: 'gel', shape: 'ballerine', length: 'longue', alt: 'Gel bordeaux brillant, forme ballerine longue' },
  { id: 'g-semi-01', title: 'Semi-permanent rouge', category: 'semi-permanent', shape: 'squoval', length: 'courte', alt: 'Semi-permanent rouge classique sur ongles courts squoval' },
  { id: 'g-french-02', title: 'French colorée', category: 'french', shape: 'carree', length: 'courte', alt: 'French colorée sur ongles carrés courts' },
  { id: 'g-art-02', title: 'Chrome perlé', category: 'nail-art', shape: 'stiletto', length: 'longue', alt: 'Effet chrome perlé sur stiletto long' },
  { id: 'g-pose-02', title: 'Pose sculptée', category: 'pose-complete', shape: 'ballerine', length: 'moyenne', alt: 'Pose sculptée, forme ballerine moyenne' },
  { id: 'g-nude-02', title: 'Nude baby boomer', category: 'nude', shape: 'amande', length: 'moyenne', alt: 'Dégradé baby boomer nude, forme amande' },
  { id: 'g-gel-02', title: 'Gel transparent', category: 'gel', shape: 'ovale', length: 'moyenne', alt: 'Gel transparent effet naturel, forme ovale' },
  { id: 'g-semi-02', title: 'Semi-permanent caramel', category: 'semi-permanent', shape: 'ovale', length: 'courte', alt: 'Semi-permanent caramel sur ongles courts' },
]

export const galleryById = (id: string) => gallery.find((g) => g.id === id)

/** FAQ de DÉMONSTRATION — réponses non validées par l'établissement. */
export const faq: FaqItem[] = [
  { q: 'Combien de temps dure une pose complète ?', a: 'Comptez environ deux heures, selon la longueur et le décor choisis.' },
  { q: 'Comment me préparer ?', a: 'Venez sans vernis si possible. Si vous avez une ancienne pose, indiquez-le lors de la réservation.' },
  { q: 'J’ai une pose faite ailleurs, est-ce possible ?', a: 'Oui, choisissez « Dépose + nouvelle pose » pour prévoir le temps nécessaire.' },
  { q: 'Pourquoi un acompte ?', a: 'Il réserve votre créneau. Dans cette démonstration, aucun paiement n’est effectué.' },
  { q: 'Et si je dois annuler ?', a: 'Prévenez au plus tôt depuis votre lien de rendez-vous. La politique réelle sera définie par l’établissement.' },
  { q: 'Quels moyens de paiement ?', a: 'À définir par l’établissement. Rien n’est encaissé dans la démonstration.' },
]

/** Politique d'annulation de DÉMONSTRATION. */
export const cancellationPolicy =
  'Exemple de politique : annulation ou report possible jusqu’à 48 h avant le rendez-vous. Les conditions réelles seront fixées par l’établissement.'

/** Avis FICTIFS — ne représentent aucune cliente réelle. */
export const reviews: ReviewItem[] = [
  { author: 'Camille R.', rating: 5, text: 'Une pose d’une finesse incroyable, et elle tient parfaitement trois semaines.', service: 'Pose complète gel' },
  { author: 'Inès B.', rating: 5, text: 'Réservé en deux minutes, rappel reçu la veille, rien à penser.', service: 'Remplissage' },
  { author: 'Sarah M.', rating: 5, text: 'Le nail art est exactement ce que j’avais en tête, en mieux.', service: 'Nail art' },
  { author: 'Julie L.', rating: 4, text: 'Très précise et de bon conseil sur la forme.', service: 'Semi-permanent' },
]

/** Prestation proposée depuis un visuel de la galerie (configuration verticale Nails). */
export const serviceForCategory: Record<GalleryCategory, string> = {
  'pose-complete': 'pose-gel',
  gel: 'pose-gel',
  french: 'pose-gel',
  nude: 'pose-gel',
  'nail-art': 'nail-art',
  'semi-permanent': 'semi-permanent',
}
