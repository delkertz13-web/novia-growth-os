/**
 * Jeu de données de DÉMONSTRATION, entièrement fictif.
 * Les dates sont calculées par rapport au moment de la présentation pour que
 * « aujourd'hui » soit toujours rempli de façon cohérente.
 */
import { business } from '../../config/business.demo'
import { serviceById } from '../../config/services.demo'
import type {
  Appointment,
  AppointmentStatus,
  AttributionSource,
  Customer,
  LeadSource,
  Opportunity,
  Conversation,
  NoviaSettings,
  VoiceCall,
  WaitlistEntry,
  WorkflowRun,
} from '../../core/types'
import { defaultSettings } from '../../config/novia.demo'
import type { SimulatedMessage } from '../types'

export interface DemoState {
  version: number
  seededAt: string
  seq: number
  customers: Customer[]
  appointments: Appointment[]
  runs: WorkflowRun[]
  opportunities: Opportunity[]
  waitlist: WaitlistEntry[]
  messages: SimulatedMessage[]
  voice: { active: boolean; mode: 'all' | 'missed' | 'after_hours' }
  conversations: Conversation[]
  calls: VoiceCall[]
  settings: NoviaSettings
}

export const STATE_VERSION = 7

const H = 3_600_000
const D = 24 * H

const atDay = (base: Date, dayOffset: number, hhmm: string) => {
  const d = new Date(base)
  d.setDate(d.getDate() + dayOffset)
  const [h, m] = hhmm.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

/** k-ième jour d'ouverture après aujourd'hui (les RDV de la semaine tombent toujours un jour ouvert) */
const atOpenDay = (base: Date, k: number, hhmm: string) => {
  let offset = 0
  for (let found = 0; found < k; ) {
    offset++
    const d = new Date(base)
    d.setDate(d.getDate() + offset)
    if (business.openingHours.value[d.getDay()]) found++
  }
  return atDay(base, offset, hhmm)
}

/** il y a `daysAgo` jours, ramené au jour d'ouverture précédent si le salon était fermé */
const atOpenDayBack = (base: Date, daysAgo: number, hhmm: string) => {
  let offset = -daysAgo
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + offset)
    if (business.openingHours.value[d.getDay()]) break
    offset--
  }
  return atDay(base, offset, hhmm)
}

/** prochain vendredi (dans au moins 1 jour) */
const nextFriday = (now: Date) => {
  let offset = (5 - now.getDay() + 7) % 7
  if (offset === 0) offset = 7
  return offset
}

type C = [id: string, first: string, last: string, source: LeadSource, extra?: Partial<Customer>]

const people: C[] = [
  ['c01', 'Julie', 'Martin', 'site'],
  ['c02', 'Chloé', 'Petit', 'instagram'],
  ['c03', 'Inès', 'Benali', 'site'],
  ['c04', 'Maëlle', 'Moreau', 'referral'],
  ['c05', 'Camille', 'Roux', 'instagram'],
  ['c06', 'Léna', 'Faure', 'site'],
  ['c07', 'Yasmine', 'Haddad', 'voice'],
  ['c08', 'Clara', 'Lambert', 'site'],
  ['c09', 'Nora', 'Girard', 'instagram'],
  ['c10', 'Lucie', 'Bonnet', 'phone'],
  ['c11', 'Manon', 'Dupuis', 'site'],
  ['c12', 'Alicia', 'Mercier', 'instagram'],
  ['c13', 'Océane', 'Blanc', 'site'],
  ['c14', 'Emma', 'Garnier', 'site'],
  ['c15', 'Jade', 'Chevalier', 'instagram'],
  ['c16', 'Louise', 'Perrin', 'site', { optOut: true }],
  ['c17', 'Anaïs', 'Robin', 'phone', { consent: { transactional: true, marketing: false } }],
  ['c18', 'Zoé', 'Clément', 'site'],
  ['c19', 'Rose', 'Gauthier', 'referral'],
  ['c20', 'Mila', 'Fontaine', 'instagram', { humanTakeover: true }],
  ['c21', 'Lina', 'Rousseau', 'site'],
  ['c22', 'Eva', 'Morel', 'site'],
  // nouveau lead Instagram : pas encore de rendez-vous
  ['c23', 'Inaya', 'Diallo', 'instagram', { lifecycle: 'prospect' }],
  // contact créé par NOVIA Voice aujourd'hui (appel de 14h18)
  ['c24', 'Sarah', 'Benoît', 'voice'],
]

/**
 * Le scénario est construit autour de `now`, l'heure de référence de l'horloge de démo
 * (src/config/demo.ts) : jamais l'heure réelle. Les RDV du jour ont des heures fixes,
 * dans les horaires d'ouverture ; scenario.test.ts vérifie que la référence choisie
 * produit bien toutes les situations de la démonstration.
 */
export function createSeed(now: Date): DemoState {
  const n = now.getTime()
  let refNo = 100

  const customers: Customer[] = people.map(([id, firstName, lastName, source, extra], i) => ({
    id,
    firstName,
    lastName,
    phone: `06 00 00 ${String(10 + i).padStart(2, '0')} ${String(20 + i).padStart(2, '0')}`,
    email: `${firstName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${lastName.toLowerCase()}@exemple.demo`,
    source,
    createdAt: new Date(n - (120 - i * 3) * D).toISOString(),
    lifecycle: 'client',
    consent: { transactional: true, marketing: true },
    optOut: false,
    humanTakeover: false,
    lastActivityAt: new Date(n - (i + 1) * D).toISOString(),
    ...extra,
  }))

  const appointments: Appointment[] = []
  const add = (
    customerId: string,
    serviceId: string,
    start: Date,
    status: AppointmentStatus,
    o: { attribution?: AttributionSource; paid?: boolean; origin?: Appointment['bookingOrigin']; bookedAt?: Date } = {},
  ) => {
    const s = serviceById(serviceId)!
    const a: Appointment = {
      id: `a${refNo}`,
      ref: `A${refNo}`,
      customerId,
      serviceId,
      start: start.toISOString(),
      durationMin: s.durationMin,
      price: s.price,
      deposit: s.deposit,
      status,
      bookingOrigin: o.origin ?? 'site',
      attribution: o.attribution ?? 'direct',
      history: [],
      paymentProof: o.paid ? { kind: 'demo_payment', amount: s.price, at: start.toISOString() } : undefined,
      // pris une semaine avant (au plus tard la veille de la référence)
      bookedAt: (o.bookedAt ?? new Date(Math.min(start.getTime() - 7 * D, n - D))).toISOString(),
    }
    refNo++
    appointments.push(a)
    return a
  }

  /* ---------- Aujourd'hui ---------- */
  add('c22', 'semi-permanent', atDay(now, 0, '10:00'), 'showed', { paid: true })
  // À confirmer : l'heure est passée, la présence est INCONNUE
  add('c02', 'pose-gel', atDay(now, 0, '11:00'), 'confirmed', { attribution: 'acquisition' })
  add('c01', 'remplissage', atDay(now, 0, '13:00'), 'confirmed')
  // En cours, puis à venir
  add('c03', 'semi-permanent', atDay(now, 0, '14:30'), 'confirmed')
  add('c04', 'remplissage', atDay(now, 0, '16:00'), 'confirmed', { attribution: 'referral' })
  add('c05', 'nail-art', atDay(now, 0, '17:00'), 'booked')
  add('c07', 'depose-pose', atDay(now, 0, '17:30'), 'booked', { attribution: 'voice', origin: 'voice', bookedAt: new Date(n - 3 * D + 5 * H) })

  /* ---------- Semaine à venir ---------- */
  add('c06', 'remplissage', atOpenDay(now, 1, '10:00'), 'confirmed')
  add('c08', 'pose-gel', atOpenDay(now, 2, '10:00'), 'booked', { attribution: 'acquisition' })
  add('c09', 'remplissage', atOpenDay(now, 3, '10:30'), 'booked')
  add('c10', 'semi-permanent', atOpenDay(now, 4, '14:00'), 'booked')

  /* ---------- Historique (prestations attestées) ---------- */
  add('c06', 'pose-gel', atOpenDayBack(now, 12, '10:30'), 'showed', { paid: true })
  add('c08', 'semi-permanent', atOpenDayBack(now, 8, '15:00'), 'showed', { paid: true, attribution: 'acquisition' })
  add('c09', 'remplissage', atOpenDayBack(now, 9, '11:00'), 'showed', { paid: true })
  add('c10', 'remplissage', atOpenDayBack(now, 4, '15:00'), 'showed', { attribution: 'smartfill', origin: 'smartfill' })
  add('c03', 'pose-gel', atOpenDayBack(now, 14, '14:00'), 'showed', { paid: true, attribution: 'acquisition' })
  add('c04', 'pose-gel', atOpenDayBack(now, 13, '10:00'), 'showed', { paid: true, attribution: 'referral' })
  add('c05', 'remplissage', atOpenDayBack(now, 6, '10:00'), 'showed', { paid: true })
  add('c11', 'pose-gel', atOpenDayBack(now, 10, '13:00'), 'showed', { paid: true })
  // chaque cliente connue a un historique cohérent avec ses messages et sa liste d'attente
  add('c01', 'pose-gel', atOpenDayBack(now, 20, '13:00'), 'showed', { paid: true })
  add('c20', 'pose-gel', atOpenDayBack(now, 5, '15:00'), 'showed', { paid: true })
  add('c18', 'remplissage', atOpenDayBack(now, 16, '16:00'), 'showed', { paid: true })
  add('c19', 'semi-permanent', atOpenDayBack(now, 15, '11:00'), 'showed', { paid: true, attribution: 'referral' })
  add('c21', 'remplissage', atOpenDayBack(now, 11, '15:00'), 'showed', { paid: true })
  // Remplissages à prévoir (délais fictifs : 19 et 23 jours…)
  add('c14', 'remplissage', atOpenDayBack(now, 19, '11:00'), 'showed', { paid: true })
  add('c15', 'remplissage', atOpenDayBack(now, 23, '14:00'), 'showed', { paid: true })
  add('c16', 'remplissage', atOpenDayBack(now, 21, '15:30'), 'showed', { paid: true })
  add('c17', 'remplissage', atOpenDayBack(now, 25, '10:30'), 'showed', { paid: true })

  /* ---------- No-shows du mois : 2, dont 1 récupéré ---------- */
  const ns1 = add('c12', 'remplissage', atOpenDayBack(now, 10, '11:00'), 'no_show')
  const t1 = new Date(ns1.start).getTime()
  ns1.history.push({ at: new Date(t1 + 2 * H).toISOString(), from: 'confirmed', to: 'no_show', source: 'cockpit' })
  const rec = add('c12', 'remplissage', atOpenDay(now, 3, '12:00'), 'booked', { attribution: 'noshow_recovery', origin: 'recovery' })
  const ns2 = add('c13', 'semi-permanent', atOpenDayBack(now, 6, '14:00'), 'no_show')
  const t2 = new Date(ns2.start).getTime()
  ns2.history.push({ at: new Date(t2 + 2 * H).toISOString(), from: 'confirmed', to: 'no_show', source: 'sms' })

  /* ---------- Annulation : créneau libre vendredi 15h30 ---------- */
  const fri = nextFriday(now)
  const slot = atDay(now, fri, '15:30')
  const cancelled = add('c11', 'remplissage', slot, 'cancelled')
  cancelled.history.push({ at: new Date(n - 5 * H).toISOString(), from: 'confirmed', to: 'cancelled', source: 'client' })

  /* ---------- NOVIA Voice : l'appel de Sarah (14h18) a créé un RDV ---------- */
  const callSarahAt = atDay(now, 0, '14:18')
  const sarahRdv = add('c24', 'pose-gel', atOpenDay(now, 1, '11:30'), 'booked', { attribution: 'voice', origin: 'voice', bookedAt: new Date(callSarahAt.getTime() + 3 * 60_000) })

  const customer = (id: string) => customers.find((c) => c.id === id)!
  customer('c12').noShowRecovered = true
  Object.assign(customer('c23'), { createdAt: new Date(n - 26 * H).toISOString(), lastActivityAt: new Date(n - 26 * H).toISOString() })
  Object.assign(customer('c24'), { createdAt: callSarahAt.toISOString(), lastActivityAt: callSarahAt.toISOString(), phone: '06 00 00 77 18', email: 'sarah.benoit@exemple.demo' })

  /* ---------- Workflows en cours (démo) ---------- */
  const runs: WorkflowRun[] = [
    {
      id: 'run-seed-w04-c12',
      workflow: 'W04',
      customerId: 'c12',
      appointmentId: ns1.id,
      state: 'completed',
      step: 'done',
      messagesSent: 1,
      startedAt: new Date(t1 + 3 * H).toISOString(),
      endedAt: new Date(t1 + 24 * H).toISOString(),
      outcome: 'recovered',
      actions: [
        { at: new Date(t1 + 3 * H).toISOString(), kind: 'info', label: 'Absence confirmée par la professionnelle.' },
        { at: new Date(t1 + 6 * H).toISOString(), kind: 'message_simulated', label: 'Message bienveillant, sans reproche, avec un nouveau créneau (simulé).' },
        { at: new Date(t1 + 24 * H).toISOString(), kind: 'stop', label: 'Nouveau rendez-vous réservé : absence récupérée.' },
      ],
    },
    {
      id: 'run-seed-w04-c13',
      workflow: 'W04',
      customerId: 'c13',
      appointmentId: ns2.id,
      state: 'active',
      step: 'await_reply',
      messagesSent: 1,
      startedAt: new Date(t2 + 3 * H).toISOString(),
      actions: [
        { at: new Date(t2 + 3 * H).toISOString(), kind: 'info', label: 'Absence confirmée par validation SMS.' },
        { at: new Date(t2 + 6 * H).toISOString(), kind: 'check_ok', label: 'Vérification avant envoi : situation inchangée, pas de nouveau RDV, pas d’opposition.' },
        { at: new Date(t2 + 6 * H).toISOString(), kind: 'message_simulated', label: 'Message bienveillant, sans reproche, avec un nouveau créneau (simulé).' },
      ],
    },
    {
      id: 'run-seed-w03-c11',
      workflow: 'W03',
      customerId: 'c11',
      appointmentId: cancelled.id,
      state: 'active',
      step: 'wait',
      messagesSent: 0,
      startedAt: new Date(n - 5 * H).toISOString(),
      actions: [
        { at: new Date(n - 5 * H).toISOString(), kind: 'info', label: 'Annulation confirmée : les rappels sont arrêtés.' },
        { at: new Date(n - 5 * H).toISOString(), kind: 'check_ok', label: 'Pas de nouveau rendez-vous, pas de demande de déplacement.' },
        { at: new Date(n - 5 * H).toISOString(), kind: 'info', label: 'NOVIA attend 2 h avant d’écrire.' },
      ],
    },
  ]

  const opportunities: Opportunity[] = [
    { id: 'o-ns-c12', kind: 'noshow_recovery', amount: 45, status: 'won', createdAt: ns1.start, sourceAppointmentId: ns1.id, resultAppointmentId: rec.id },
    { id: 'o-ns-c13', kind: 'noshow_recovery', amount: 35, status: 'open', createdAt: ns2.start, sourceAppointmentId: ns2.id },
    { id: 'o-cx-c11', kind: 'cancellation_recovery', amount: 45, status: 'open', createdAt: new Date(n - 5 * H).toISOString(), sourceAppointmentId: cancelled.id },
    { id: 'o-sf-slot', kind: 'smartfill', amount: 45, status: 'open', createdAt: new Date(n - 5 * H).toISOString(), sourceAppointmentId: cancelled.id, slotStart: slot.toISOString(), slotDurationMin: 60 },
  ]

  const waitlist: WaitlistEntry[] = [
    { id: 'w1', customerId: 'c18', serviceId: 'remplissage', days: [5, 6], periods: ['apres-midi'], flexible: true, createdAt: new Date(n - 3 * D).toISOString() },
    { id: 'w2', customerId: 'c19', serviceId: 'semi-permanent', days: [4, 5], periods: ['apres-midi', 'soir'], flexible: false, createdAt: new Date(n - 2 * D).toISOString() },
    { id: 'w3', customerId: 'c20', serviceId: 'remplissage', days: [5], periods: ['apres-midi'], flexible: true, createdAt: new Date(n - 5 * D).toISOString() },
    { id: 'w4', customerId: 'c21', serviceId: 'remplissage', days: [2, 5], periods: ['matin', 'apres-midi'], flexible: true, createdAt: new Date(n - 1 * D).toISOString() },
  ]

  return {
    version: STATE_VERSION,
    seededAt: now.toISOString(),
    seq: refNo,
    customers,
    appointments,
    runs,
    opportunities,
    waitlist,
    messages: [],
    voice: { active: true, mode: 'missed' },
    conversations: seedConversations(now, t2 + 6 * H),
    calls: seedCalls(now, { sarah: sarahRdv.id, yasmine: appointments.find((a) => a.customerId === 'c07')!.id }),
    settings: structuredClone(defaultSettings),
  }
}

/* ------------------------------------------------------------------ */
/* Conversations de démonstration                                       */
/* ------------------------------------------------------------------ */

function seedConversations(now: Date, oceaneMsgAt: number): Conversation[] {
  const missed = new Date(oceaneMsgAt).toLocaleDateString('fr-FR', { weekday: 'long' })
  const n = now.getTime()
  const at = (minAgo: number) => new Date(n - minAgo * 60_000).toISOString()
  let k = 0
  const m = (minAgo: number, from: 'client' | 'novia' | 'pro', body: string, faqId?: string) => ({ id: `cm${++k}`, at: at(minAgo), from, body, ...(faqId ? { faqId } : {}) })
  return [
    {
      // Océane a répondu au message de récupération de NOVIA : sa demande attend Léa
      id: 'conv-c13',
      customerId: 'c13',
      channel: 'sms',
      needsHuman: true,
      needsHumanReason: 'Elle demande à vous parler avant de reprendre rendez-vous',
      unread: true,
      messages: [
        { id: 'cm-c13-1', at: new Date(oceaneMsgAt).toISOString(), from: 'novia', body: `Bonjour Océane, nous ne vous avons pas vue ${missed}, j’espère que tout va bien. Souhaitez-vous un nouveau créneau ?` },
        m(95 * 60, 'client', `Bonjour, désolée pour ${missed}, j’ai eu un souci de garde. Est-ce que Léa pourrait me garder un créneau tôt le matin la semaine prochaine ? Je ne peux pas avant 9h30.`),
      ],
    },
    {
      id: 'conv-c09',
      customerId: 'c09',
      channel: 'instagram',
      needsHuman: true,
      needsHumanReason: 'Demande sur mesure : aucune réponse approuvée',
      unread: true,
      messages: [m(42, 'client', 'Bonjour ! Je me marie le 12 décembre, est-ce que vous faites des french avec des paillettes dorées ? Et ce serait combien pour moi et deux témoins ?')],
    },
    {
      id: 'conv-c08',
      customerId: 'c08',
      channel: 'sms',
      needsHuman: true,
      needsHumanReason: 'Sujet sensible : réaction cutanée',
      unread: true,
      messages: [m(95, 'client', 'Bonjour Léa, j’ai un peu de rougeur autour des ongles depuis ma dernière pose, est-ce que c’est une réaction allergique ? Je viens après-demain.')],
    },
    {
      id: 'conv-c05',
      customerId: 'c05',
      channel: 'sms',
      needsHuman: false,
      unread: false,
      messages: [
        m(130, 'client', 'Coucou, est-ce que je peux venir ce soir avec un ongle cassé ?'),
        m(129, 'novia', 'Oui, venez telle quelle : Léa prévoit quelques minutes pour réparer l’ongle avant la pose. Si plusieurs ongles sont abîmés, dites-le-nous pour ajuster le temps.', 'ongle-casse'),
        m(120, 'client', 'Super merci 🙏'),
      ],
    },
    {
      id: 'conv-c23',
      customerId: 'c23',
      channel: 'instagram',
      needsHuman: false,
      unread: false,
      messages: [
        m(26 * 60, 'client', 'Bonjour, quels sont vos tarifs pour une pose gel ?'),
        m(26 * 60 - 1, 'novia', 'Pose complète gel : 70 €, remplissage : 45 €, semi-permanent : 35 €, nail art à partir de 15 € (tarifs de démonstration). Vous pouvez réserver directement en ligne.', 'tarifs'),
      ],
    },
    {
      id: 'conv-c20',
      customerId: 'c20',
      channel: 'sms',
      needsHuman: false,
      unread: false,
      messages: [
        m(3 * 24 * 60, 'client', 'Léa, je voulais te parler de la dernière fois, je n’étais pas très contente de la forme…'),
        m(3 * 24 * 60 - 30, 'pro', 'Bonjour Mila, merci de me l’avoir dit. Je te propose de passer quand tu veux cette semaine, je reprends la forme sans frais.'),
      ],
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Appels NOVIA Voice de démonstration (fictifs)                        */
/* ------------------------------------------------------------------ */

function seedCalls(now: Date, ids: { sarah: string; yasmine: string }): VoiceCall[] {
  const n = now.getTime()
  const today = (hhmm: string) => atDay(now, 0, hhmm).toISOString()
  return [
    {
      id: 'call-1418',
      at: today('14:18'),
      callerName: 'Sarah Benoît',
      phone: '06 00 00 77 18',
      customerId: 'c24',
      durationSec: 154,
      trigger: 'missed',
      handledBy: 'novia',
      outcome: 'booked',
      summary: 'Demande de tarif pour une pose complète → RDV vendredi 11h30',
      appointmentId: ids.sarah,
      transcript: [
        { from: 'novia', text: 'NOVIA Nails, bonjour ! Léa est en prestation, je suis son assistante. Comment puis-je vous aider ?' },
        { from: 'caller', text: 'Bonjour, je voulais savoir le prix d’une pose complète.' },
        { from: 'novia', text: 'Une pose complète gel est à 70 €, comptez environ deux heures. Voulez-vous que je regarde les disponibilités ?' },
        { from: 'caller', text: 'Oui, plutôt en fin de matinée.' },
        { from: 'novia', text: 'Je peux vous proposer demain vendredi à 11h30, ou samedi à 10h. Lequel vous convient ?' },
        { from: 'caller', text: 'Vendredi 11h30, parfait.' },
        { from: 'novia', text: 'C’est noté : vendredi à 11h30, pose complète. Vous recevrez une confirmation par SMS. Puis-je avoir votre nom ?' },
        { from: 'caller', text: 'Sarah Benoît.' },
      ],
    },
    {
      id: 'call-1205',
      at: today('12:05'),
      callerName: 'Lucie Bonnet',
      phone: '06 00 00 19 29',
      customerId: 'c10',
      durationSec: 48,
      trigger: 'missed',
      handledBy: 'novia',
      outcome: 'transferred',
      summary: 'Souhaite parler à Léa d’un changement de couleur → rappel demandé',
      transcript: [
        { from: 'novia', text: 'NOVIA Nails, bonjour ! Léa est en prestation, je suis son assistante.' },
        { from: 'caller', text: 'Je voudrais parler à Léa directement, c’est pour mon rendez-vous de la semaine prochaine.' },
        { from: 'novia', text: 'Bien sûr. Je préviens Léa, elle vous rappelle dès qu’elle a terminé. C’est bien au 06 00 00 19 29 ?' },
        { from: 'caller', text: 'Oui, merci.' },
      ],
    },
    {
      id: 'call-1140',
      at: today('11:40'),
      callerName: 'Numéro inconnu',
      phone: '06 00 00 55 03',
      durationSec: 36,
      trigger: 'missed',
      handledBy: 'novia',
      outcome: 'answered',
      summary: 'Question sur l’accès au salon → réponse donnée',
      transcript: [
        { from: 'caller', text: 'Bonjour, il y a un parking près du salon ?' },
        { from: 'novia', text: 'L’adresse et l’accès figurent dans votre confirmation de rendez-vous. Souhaitez-vous prendre rendez-vous ?' },
        { from: 'caller', text: 'Pas pour l’instant, merci.' },
      ],
    },
    {
      id: 'call-1030',
      at: today('10:30'),
      callerName: 'Rose Gauthier',
      phone: '06 00 00 28 38',
      customerId: 'c19',
      durationSec: 95,
      trigger: 'all',
      handledBy: 'pro',
      outcome: 'answered',
      summary: 'Appel pris par Léa',
      transcript: [],
    },
    {
      id: 'call-2015',
      at: new Date(n - 3 * D + 5 * H).toISOString(),
      callerName: 'Yasmine Haddad',
      phone: '06 00 00 16 26',
      customerId: 'c07',
      durationSec: 131,
      trigger: 'after_hours',
      handledBy: 'novia',
      outcome: 'booked',
      summary: 'Appel hors horaires : dépose + nouvelle pose → RDV jeudi 17h30',
      appointmentId: ids.yasmine,
      transcript: [
        { from: 'novia', text: 'NOVIA Nails, bonsoir ! Le salon est fermé, mais je peux vous aider à prendre rendez-vous.' },
        { from: 'caller', text: 'J’ai une pose faite ailleurs, je voudrais la refaire.' },
        { from: 'novia', text: 'Je vous propose une dépose suivie d’une nouvelle pose, environ 2 h 30. Jeudi à 17h30, ça vous va ?' },
        { from: 'caller', text: 'Oui, très bien.' },
      ],
    },
  ]
}
