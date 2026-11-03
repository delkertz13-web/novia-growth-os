import { demo, unknown, type BusinessConfig } from './schema'

/**
 * Identité de DÉMONSTRATION. Aucune de ces valeurs n'est celle du salon réel.
 * Pour le pilote : remplacer chaque champ et passer son statut à 'verified'.
 */
export const business: BusinessConfig = {
  name: demo('NOVIA Nails'),
  tagline: demo('Nail artistry, sur rendez-vous.'),
  artistFirstName: demo('Léa'),
  city: demo('Paris'),
  address: demo('Adresse de démonstration'),
  phone: demo('01 00 00 00 00'),
  email: demo('contact@exemple.demo'),
  instagram: unknown(''),
  googleReviewUrl: unknown(''),
  timezone: demo('Europe/Paris'),
  openingHours: demo({
    0: null,
    1: null,
    2: { open: '10:00', close: '19:00' },
    3: { open: '10:00', close: '19:00' },
    4: { open: '10:00', close: '20:00' },
    5: { open: '10:00', close: '19:00' },
    6: { open: '09:30', close: '17:00' },
  }),
  currency: 'EUR',
}
