/**
 * Règles de collaboration NOVIA ↔ professionnelle — valeurs de DÉMONSTRATION.
 * Les réponses ci-dessous sont des exemples ; en production, chaque réponse est
 * écrite ou approuvée par la professionnelle avant que NOVIA puisse l'utiliser.
 */
import type { ApprovedAnswer } from '../../config/profile'
import type { NoviaSettings } from '../../core/types'

export const approvedAnswers: ApprovedAnswer[] = [
  {
    id: 'ongle-casse',
    topic: 'Ongle cassé',
    keywords: ['casse', 'fissure', 'ongle abime'],
    answer:
      'Oui, venez telle quelle : Léa prévoit quelques minutes pour réparer l’ongle avant la pose. Si plusieurs ongles sont abîmés, dites-le-nous pour ajuster le temps.',
  },
  {
    id: 'duree',
    topic: 'Durée d’une pose',
    keywords: ['combien de temps', 'duree', 'ca dure'],
    answer: 'Comptez environ deux heures pour une pose complète, une heure pour un remplissage.',
  },
  {
    id: 'tarifs',
    topic: 'Tarifs',
    keywords: ['tarif', 'prix', 'combien'],
    answer:
      'Pose complète gel : 70 €, remplissage : 45 €, semi-permanent : 35 €, nail art à partir de 15 € (tarifs de démonstration). Vous pouvez réserver directement en ligne.',
  },
  {
    id: 'preparation',
    topic: 'Préparation',
    keywords: ['preparer', 'vernis', 'avant de venir'],
    answer: 'Venez sans vernis si possible. Si vous avez une ancienne pose, indiquez-le lors de la réservation.',
  },
  {
    id: 'acces',
    topic: 'Accès',
    keywords: ['parking', 'garer', 'adresse', 'acces', 'metro'],
    answer: 'L’adresse et l’accès figurent dans votre confirmation de rendez-vous (information de démonstration).',
  },
]

/** Sujets que NOVIA ne traite jamais seule : la professionnelle est prévenue. */
export const sensitiveKeywords = ['allerg', 'reaction', 'irrit', 'douleur', 'infection', 'brul', 'rembours', 'plainte', 'enceinte', 'medic']

export const defaultSettings: NoviaSettings = {
  automations: {
    cancellationRecovery: true,
    noShowRecovery: true,
    smartFill: true,
    rebooking: true,
    reviews: false,
    referral: false,
  },
  sendWindow: { start: '09:00', end: '20:00' },
  channels: { sms: true, email: true, instagram: false },
}
