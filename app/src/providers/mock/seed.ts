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
  WaitlistEntry,
  WorkflowRun,
} from '../../core/types'
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
}

export const STATE_VERSION = 5

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
  ['c04', 'Sarah', 'Moreau', 'referral'],
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
    o: { attribution?: AttributionSource; paid?: boolean; origin?: Appointment['bookingOrigin'] } = {},
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
  add('c07', 'depose-pose', atDay(now, 0, '17:30'), 'booked', { attribution: 'acquisition', origin: 'voice' })

  /* ---------- Semaine à venir ---------- */
  add('c06', 'remplissage', atOpenDay(now, 1, '11:00'), 'confirmed')
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

  const customer = (id: string) => customers.find((c) => c.id === id)!
  customer('c12').noShowRecovered = true

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
        { at: new Date(t1 + 6 * H).toISOString(), kind: 'message_simulated', label: 'Message de récupération non culpabilisant (simulé).' },
        { at: new Date(t1 + 24 * H).toISOString(), kind: 'stop', label: 'Nouveau rendez-vous réservé : STOP → W02. NO_SHOW_RECOVERED = TRUE' },
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
        { at: new Date(t2 + 6 * H).toISOString(), kind: 'check_ok', label: 'Revérification : statut, nouveau RDV, opposition, reprise humaine — OK.' },
        { at: new Date(t2 + 6 * H).toISOString(), kind: 'message_simulated', label: 'Message de récupération non culpabilisant (simulé).' },
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
        { at: new Date(n - 5 * H).toISOString(), kind: 'info', label: 'Annulation confirmée : rappels W02 stoppés.' },
        { at: new Date(n - 5 * H).toISOString(), kind: 'check_ok', label: 'Aucun nouveau RDV, aucune demande de déplacement.' },
        { at: new Date(n - 5 * H).toISOString(), kind: 'info', label: 'Attente avant récupération : 2 h (paramètre démo).' },
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
  }
}
