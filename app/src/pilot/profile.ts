/**
 * Profil d'une entreprise PILOTE avant sa vérification : rien n'est inventé.
 *
 * Chaque valeur est `unknown` tant que l'établissement ne l'a pas fournie et validée
 * (checklist PILOT-001). Une valeur inconnue dont dépend une automatisation la BLOQUE.
 * Les automatisations sont toutes désactivées au départ : le pilote commence par le
 * SERVICE (réservation, information, messages entrants, rappels, changements de RDV).
 * Aucune donnée de la démonstration n'est importée ici.
 */
import type { BusinessProfile } from '../config/profile'
import { unknown, type OpeningHours } from '../config/schema'

const closed: OpeningHours = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }

export function createPilotProfile(businessId: string, timezone: string): BusinessProfile {
  return {
    businessId,
    identity: {
      name: unknown(''),
      tagline: unknown(''),
      artistFirstName: unknown(''),
      city: unknown(''),
      address: unknown(''),
      phone: unknown(''),
      email: unknown(''),
      instagram: unknown(''),
      googleReviewUrl: unknown(''),
      // le fuseau est explicite dès le départ ; il reste « à vérifier » avec l'établissement
      timezone: unknown(timezone),
      openingHours: unknown(closed),
      currency: 'EUR',
    },
    services: { status: 'unknown', items: [] },
    breaks: unknown([]),
    booking: unknown({ minNoticeHours: 0, maxAdvanceDays: 0, slotStepMin: 30, bufferMin: 0 }),
    cancellation: unknown({ freeCancellationHours: 0, text: '' }),
    rules: {
      status: 'unknown',
      sendWindow: { start: '09:00', end: '20:00' },
      w01: { followUpDelayHours: 0, maxFollowUps: 0 },
      w02: { remindersHoursBefore: [], validationRequestDelayMin: 0 },
      w03: { waitBeforeRecoveryHours: 0, lastFollowUpDelayHours: 0 },
      w04: { waitBeforeRecoveryHours: 0, lastFollowUpDelayHours: 0 },
    },
    smartFill: unknown({ maxContacts: 0 }),
    voice: unknown({ defaultMode: 'missed', greeting: '' }),
    consent: unknown({ marketingOptInText: '' }),
    attribution: unknown({ recoveryWindowDays: 0 }),
    defaultSettings: {
      automations: { cancellationRecovery: false, noShowRecovery: false, smartFill: false, rebooking: false, reviews: false, referral: false },
      sendWindow: { start: '09:00', end: '20:00' },
      channels: { sms: true, email: false, instagram: false },
    },
    templates: {
      'W02.confirmation': unknown(''),
      'W02.reschedule': unknown(''),
      'W02.reminder': unknown(''),
      'W03.recovery': unknown(''),
      'W04.recovery': unknown(''),
    },
    approvedAnswers: unknown([]),
    sensitiveKeywords: ['allerg', 'reaction', 'irrit', 'douleur', 'infection', 'brul', 'rembours', 'plainte', 'enceinte', 'medic'],
    content: { gallery: [], reviews: [], faq: [], serviceForCategory: {} },
  }
}
