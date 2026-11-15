/**
 * Profil de l'entreprise de DÉMONSTRATION « NOVIA Nails ». Entièrement fictif.
 * Il n'est chargé QUE par la composition de démo (src/app/demo.ts) : aucune de ces
 * valeurs ne peut devenir une valeur par défaut du pilote.
 */
import { demo, unknown } from '../../config/schema'
import type { BusinessProfile } from '../../config/profile'
import { business } from './business'
import { cancellationPolicy, faq, gallery, reviews, serviceForCategory } from './content'
import { approvedAnswers, defaultSettings, sensitiveKeywords } from './novia'
import { rules } from './rules'
import { services, servicesStatus } from './services'

export const DEMO_BUSINESS_ID = 'demo-novia-nails'

export const demoProfile: BusinessProfile = {
  businessId: DEMO_BUSINESS_ID,
  identity: business,
  services: { status: servicesStatus, items: services },
  breaks: unknown([]),
  booking: demo({ minNoticeHours: 0, maxAdvanceDays: 60, slotStepMin: 30, bufferMin: 0 }),
  cancellation: demo({ freeCancellationHours: 48, text: cancellationPolicy }),
  rules,
  smartFill: demo({ maxContacts: 5 }),
  voice: demo({ defaultMode: 'missed', greeting: '{business}, bonjour ! {artist} est en prestation, je suis son assistante. Comment puis-je vous aider ?' }),
  consent: unknown({ marketingOptInText: '' }),
  attribution: demo({ recoveryWindowDays: 30 }),
  defaultSettings,
  // textes exacts de la démonstration (aucun envoi réel)
  templates: {
    'W02.confirmation': demo('{business} — votre {service} est réservé {when}.'),
    'W02.reschedule': demo('Votre {service} est déplacé au {when}. {reminders} rappel(s) recalculé(s), anciens rappels annulés.'),
    'W02.reminder': demo('{business} — rappel : votre {service} {when}.'),
    'W03.recovery': demo('Bonjour {firstName}, votre rendez-vous a bien été annulé. Voulez-vous en reprendre un autre ?'),
    'W04.recovery': demo('Bonjour {firstName}, nous ne vous avons pas vue aujourd’hui, j’espère que tout va bien. Souhaitez-vous un nouveau créneau ?'),
  },
  approvedAnswers: demo(approvedAnswers),
  sensitiveKeywords,
  content: { gallery, reviews, faq, serviceForCategory },
}
