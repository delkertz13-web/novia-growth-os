import type { FaqItem, GalleryCategory, GalleryItem, NailLength, NailShape, ReviewItem } from './schema'

/**
 * GALERIE — 12 emplacements. Chaque `id` correspond à un fichier déposé dans
 * app/media-source/gallery/<id>.jpg puis traité par `npm run media`
 * (voir app/media-source/README.md). Sans visuel, un placeholder clairement
 * identifié s'affiche à la place.
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
  { id: 'g-pose-01', title: 'French blanche', category: 'french', shape: 'amande', length: 'longue', alt: 'French blanche classique sur ongles amande longs, base nude' },
  { id: 'g-pose-02', title: 'Bordeaux filets d’or', category: 'gel', shape: 'amande', length: 'longue', alt: 'Gel bordeaux brillant, un ongle orné de fins filets dorés en volute' },
  { id: 'g-pose-03', title: 'Marbré rosé & feuille d’or', category: 'pose-complete', shape: 'amande', length: 'longue', alt: 'Pose complète nude rosé, effet marbré laiteux et éclats de feuille d’or' },
  { id: 'g-pose-04', title: 'Chrome opale', category: 'nail-art', shape: 'amande', length: 'longue', alt: 'Effet chrome rose opalescent aux reflets nacrés sur ongles amande longs' },
  { id: 'g-pose-05', title: 'Nude mat & feuillage', category: 'nail-art', shape: 'amande', length: 'longue', alt: 'Base nude mat, feuillage blanc peint à main levée et un ongle pailleté or' },
  { id: 'g-pose-06', title: 'Fleurs sculptées', category: 'nail-art', shape: 'amande', length: 'longue', alt: 'Rose poudré, fleurs en relief et fines tiges dorées' },
  { id: 'g-pose-07', title: 'Baby boomer', category: 'nude', shape: 'amande', length: 'longue', alt: 'Dégradé baby boomer du rose nude au blanc laiteux' },
  { id: 'g-pose-08', title: 'Léopard nude & or', category: 'nail-art', shape: 'amande', length: 'longue', alt: 'Motif léopard sur base nude, souligné d’un filet doré' },
  { id: 'g-pose-09', title: 'Strass & filet d’or', category: 'nail-art', shape: 'amande', length: 'longue', alt: 'Base rosée transparente, petits strass et fin filet doré' },
  { id: 'g-pose-10', title: 'Vieux rose', category: 'semi-permanent', shape: 'amande', length: 'longue', alt: 'Vieux rose brillant, un ongle orné d’une branche dorée et d’un strass' },
  { id: 'g-pose-11', title: 'French noire liseré or', category: 'french', shape: 'amande', length: 'longue', alt: 'French noire soulignée d’un liseré doré sur base nude, un ongle orné de strass' },
  { id: 'g-pose-12', title: 'Bordeaux & or', category: 'gel', shape: 'amande', length: 'longue', alt: 'Gel bordeaux, ongle feuille d’or et ongle pailleté doré' },
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
