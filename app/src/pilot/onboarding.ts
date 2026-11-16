/**
 * Fiche de préparation de PILOT-001 : ce que nous apprendrons à la rencontre.
 *
 * Deux sortes d'informations, chacune avec son statut UNKNOWN / ESTIMATED / VERIFIED :
 * - les données du PROFIL dont le moteur dépend (identité, prestations, horaires, agenda,
 *   règles de messages…) : elles vivent dans le BusinessProfile ;
 * - les FAITS utiles au pilote mais qu'aucune règle ne lit (formule Planity, objectifs,
 *   moyens de paiement…) : texte libre, dans la fiche de préparation.
 *
 * Rien n'est pré-rempli : une entreprise neuve a tout « inconnu ». Module PUR (navigateur
 * et serveur) : le serveur valide avec les mêmes fonctions que l'écran.
 */
import type { BusinessProfile } from '../config/profile'
import type { DataStatus, Field, OpeningHours, ServiceCategory, ServiceConfig } from '../config/schema'
import { isValidTimeZone } from '../core/time'

/** statuts permis dans un profil pilote (jamais « demo ») */
export const PILOT_STATUSES = ['unknown', 'estimated', 'verified'] as const
export type PilotStatus = (typeof PILOT_STATUSES)[number]

export const statusText: Record<PilotStatus, string> = { unknown: 'Inconnu', estimated: 'Estimé', verified: 'Vérifié' }

export interface Fact {
  value: string
  status: PilotStatus
  note?: string
  updatedAt?: string
  updatedBy?: string
}
export type Facts = Record<string, Fact>

export interface FactItem {
  key: string
  label: string
  hint?: string
}

/** Sections de la checklist ; `profile` = éditeurs du BusinessProfile affichés dans la section. */
export interface OnboardingSection {
  id: string
  title: string
  profile: ProfileSection[]
  facts: FactItem[]
}

export type ProfileSection = 'identity' | 'services' | 'hours' | 'booking' | 'schedule' | 'cancellation' | 'rules' | 'smartFill' | 'consent'

export const SECTIONS: OnboardingSection[] = [
  { id: 'identite', title: 'Identité', profile: ['identity'], facts: [] },
  { id: 'prestations', title: 'Prestations', profile: ['services'], facts: [] },
  {
    id: 'horaires',
    title: 'Horaires',
    profile: ['hours', 'booking'],
    facts: [{ key: 'hours.closures', label: 'Fermetures (congés, jours fériés)', hint: 'Dates ou périodes connues' }],
  },
  {
    id: 'planity',
    title: 'Planity',
    profile: ['schedule'],
    facts: [
      { key: 'planity.plan', label: 'Formule Planity' },
      { key: 'planity.cost', label: 'Coût Planity', hint: 'Montant mensuel tel qu’indiqué par la pro' },
      { key: 'planity.newClients', label: 'Nouvelles clientes venant de Planity (estimation)' },
      { key: 'planity.reminders', label: 'Rappels envoyés par Planity (canal, délais)' },
      { key: 'planity.deposit', label: 'Acompte demandé via Planity' },
      { key: 'planity.export', label: 'Export possible des clientes / RDV' },
      { key: 'planity.notifications', label: 'Notifications reçues par la pro (nouveau RDV, annulation)' },
      { key: 'planity.bookingSources', label: 'Provenance des RDV (Planity, Instagram, téléphone…)' },
    ],
  },
  {
    id: 'annulation',
    title: 'Annulation / no-show',
    profile: ['cancellation', 'smartFill'],
    facts: [
      { key: 'noshow.consequences', label: 'Conséquences appliquées (acompte retenu, aucune…)' },
      { key: 'noshow.frequency', label: 'Fréquence des annulations et absences (estimation)' },
      { key: 'noshow.recoveryWish', label: 'Comportement souhaité pour la relance' },
    ],
  },
  {
    id: 'communications',
    title: 'Communications',
    profile: ['rules'],
    facts: [
      { key: 'comms.channels', label: 'Canaux utilisés avec les clientes' },
      { key: 'comms.address', label: 'Tutoiement ou vouvoiement' },
      { key: 'comms.signature', label: 'Signature des messages' },
      { key: 'comms.sensitive', label: 'Sujets sensibles (jamais traités seule par NOVIA)' },
      { key: 'comms.currentReminders', label: 'Rappels envoyés aujourd’hui (par qui, quand)' },
    ],
  },
  {
    id: 'clientes',
    title: 'Clientes / consentement',
    profile: ['consent'],
    facts: [
      { key: 'clients.database', label: 'Où est la base clientes aujourd’hui' },
      { key: 'clients.export', label: 'Export possible de la base' },
      { key: 'clients.marketingConsent', label: 'Consentement marketing des clientes connu ?', hint: 'Sans preuve, aucune cliente n’est sollicitée' },
      { key: 'clients.oppositions', label: 'Oppositions connues (clientes ne voulant plus de messages)' },
      { key: 'clients.neverAutomate', label: 'Clientes à ne jamais automatiser' },
    ],
  },
  {
    id: 'paiement',
    title: 'Paiement',
    profile: [],
    facts: [
      { key: 'payment.methods', label: 'Moyens de paiement acceptés' },
      { key: 'payment.flow', label: 'Fonctionnement (au salon, acompte, en ligne…)' },
      { key: 'payment.declarationAccepted', label: 'D’accord pour déclarer « payé » dans NOVIA ?' },
    ],
  },
  {
    id: 'voice',
    title: 'Voice',
    profile: [],
    facts: [
      { key: 'voice.calls', label: 'Appels reçus (volume estimé)' },
      { key: 'voice.missed', label: 'Appels manqués (volume estimé)' },
      { key: 'voice.wish', label: 'Comportement souhaité' },
    ],
  },
  {
    id: 'objectifs',
    title: 'Objectifs du pilote',
    profile: [],
    facts: [
      { key: 'goals.priority', label: 'Priorité' },
      { key: 'goals.problem', label: 'Problème principal' },
      { key: 'goals.success', label: 'Critère de réussite' },
      { key: 'goals.stop', label: 'Critère d’arrêt' },
    ],
  },
]

export const FACT_KEYS = new Set(SECTIONS.flatMap((s) => s.facts.map((f) => f.key)))

export class OnboardingError extends Error {}

const isStatus = (s: unknown): s is PilotStatus => typeof s === 'string' && (PILOT_STATUSES as readonly string[]).includes(s)

/** Un fait saisi (validé côté serveur, mêmes règles qu'à l'écran). */
export function validateFact(key: string, f: unknown): Pick<Fact, 'value' | 'status' | 'note'> {
  if (!FACT_KEYS.has(key)) throw new OnboardingError('Information inconnue de la checklist.')
  const o = f as Partial<Fact>
  if (!o || typeof o !== 'object' || typeof o.value !== 'string' || o.value.length > 2000 || !isStatus(o.status)) throw new OnboardingError('Information invalide.')
  if (o.note !== undefined && (typeof o.note !== 'string' || o.note.length > 500)) throw new OnboardingError('Note invalide.')
  // une information sans contenu ne peut pas être « vérifiée »
  if (o.status !== 'unknown' && !o.value.trim()) throw new OnboardingError('Une information estimée ou vérifiée doit avoir un contenu.')
  return { value: o.value, status: o.status, ...(o.note ? { note: o.note } : {}) }
}

export const factOf = (facts: Facts, key: string): Fact => facts[key] ?? { value: '', status: 'unknown' }

/* ------------------------------------------------------------------ */
/* Sections du profil                                                    */
/* ------------------------------------------------------------------ */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const str = (v: unknown, max = 200) => typeof v === 'string' && v.length <= max
const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

function field<T>(v: unknown, check: (x: unknown) => boolean, what: string): Field<T> {
  const f = v as Field<T>
  if (!f || typeof f !== 'object' || !isStatus(f.status) || !check(f.value)) throw new OnboardingError(`${what} : valeur invalide.`)
  return { value: f.value, status: f.status }
}

/** valeur « inconnue » vide autorisée ; sinon contenu requis */
const textField = (v: unknown, what: string, max = 200) => {
  const f = field<string>(v, (x) => str(x, max), what)
  if (f.status !== 'unknown' && !f.value.trim()) throw new OnboardingError(`${what} : une valeur estimée ou vérifiée doit être renseignée.`)
  return f
}

const validHours = (x: unknown) => {
  if (!x || typeof x !== 'object') return false
  for (let d = 0; d < 7; d++) {
    const h = (x as OpeningHours)[d]
    if (h === null) continue
    if (!h || !HHMM.test(h.open) || !HHMM.test(h.close) || h.open >= h.close) return false
  }
  return true
}

const CATEGORIES: ServiceCategory[] = ['pose', 'entretien', 'semi-permanent', 'nail-art', 'depose']
const SERVICE_ID = /^[a-z0-9-]{1,40}$/

function validService(s: unknown): ServiceConfig {
  const o = s as ServiceConfig
  if (!o || typeof o !== 'object' || !SERVICE_ID.test(o.id) || !str(o.name, 80) || !o.name.trim()) throw new OnboardingError('Prestation : nom invalide.')
  if (!num(o.price, 0, 10_000) || !num(o.durationMin, 5, 600) || !num(o.deposit ?? 0, 0, 10_000)) throw new OnboardingError(`Prestation « ${o.name} » : prix, durée ou acompte invalide.`)
  if (o.returnRecommendedAfterDays !== null && !num(o.returnRecommendedAfterDays, 1, 365)) throw new OnboardingError(`Prestation « ${o.name} » : retour recommandé invalide.`)
  if (o.bufferMin !== undefined && !num(o.bufferMin, 0, 240)) throw new OnboardingError(`Prestation « ${o.name} » : battement invalide.`)
  return {
    id: o.id,
    name: o.name.trim(),
    description: str(o.description, 300) ? o.description : '',
    durationMin: o.durationMin,
    price: o.price,
    deposit: o.deposit ?? 0,
    category: CATEGORIES.includes(o.category) ? o.category : 'pose',
    returnRecommendedAfterDays: o.returnRecommendedAfterDays,
    active: o.active !== false,
    bookableOnline: o.bookableOnline === true,
    ...(o.bufferMin !== undefined ? { bufferMin: o.bufferMin } : {}),
    coverImageId: '',
  }
}

/**
 * Applique UNE section au profil (copie). Toute valeur est validée ; un statut « demo »
 * est refusé ; rien d'autre du profil ne change.
 */
export function applyProfileSection(p: BusinessProfile, section: ProfileSection, value: unknown): BusinessProfile {
  const v = value as Record<string, unknown>
  if (!v || typeof v !== 'object') throw new OnboardingError('Section invalide.')
  switch (section) {
    case 'identity': {
      const tz = field<string>(v.timezone, (x) => typeof x === 'string' && isValidTimeZone(x), 'Fuseau horaire')
      return {
        ...p,
        identity: {
          ...p.identity,
          name: textField(v.name, 'Nom commercial', 80),
          artistFirstName: textField(v.artistFirstName, 'Prénom de la professionnelle', 60),
          address: textField(v.address, 'Adresse', 200),
          city: textField(v.city, 'Ville', 80),
          phone: textField(v.phone, 'Téléphone', 30),
          email: textField(v.email, 'E-mail', 120),
          timezone: tz,
          instagram: textField(v.instagram, 'Instagram', 120),
          googleReviewUrl: textField(v.googleReviewUrl, 'Google Business Profile', 300),
        },
      }
    }
    case 'services': {
      if (!isStatus(v.status) || !Array.isArray(v.items) || v.items.length > 60) throw new OnboardingError('Prestations invalides.')
      const items = v.items.map(validService)
      if (new Set(items.map((s) => s.id)).size !== items.length) throw new OnboardingError('Deux prestations ont le même identifiant.')
      if (v.status !== 'unknown' && !items.length) throw new OnboardingError('Ajoutez au moins une prestation avant de l’estimer ou de la vérifier.')
      return { ...p, services: { status: v.status, items } }
    }
    case 'hours': {
      const openingHours = field<OpeningHours>(v.openingHours, validHours, 'Horaires')
      const breaks = field<BusinessProfile['breaks']['value']>(
        v.breaks,
        (x) => Array.isArray(x) && x.length <= 30 && x.every((b) => b && num(b.weekday, 0, 6) && HHMM.test(b.start) && HHMM.test(b.end) && b.start < b.end),
        'Pauses',
      )
      return { ...p, identity: { ...p.identity, openingHours }, breaks }
    }
    case 'booking': {
      const f = field<BusinessProfile['booking']['value']>(
        v,
        (x) => {
          const b = x as BusinessProfile['booking']['value']
          return !!b && num(b.minNoticeHours, 0, 720) && num(b.maxAdvanceDays, 0, 365) && num(b.slotStepMin, 5, 120) && num(b.bufferMin, 0, 240)
        },
        'Délai et horizon de réservation',
      )
      return { ...p, booking: f }
    }
    case 'schedule':
      return {
        ...p,
        schedule: {
          authority: field<'planity' | 'novia'>(v.authority, (x) => x === 'planity' || x === 'novia', 'Agenda de référence'),
          externalReminders: field<boolean>(v.externalReminders, (x) => typeof x === 'boolean', 'Rappels envoyés par l’agenda'),
        },
      }
    case 'cancellation':
      return {
        ...p,
        cancellation: field(v, (x) => !!x && num((x as { freeCancellationHours: number }).freeCancellationHours, 0, 720) && str((x as { text: string }).text, 600), 'Politique d’annulation'),
      }
    case 'rules': {
      const r = v as unknown as BusinessProfile['rules']
      if (!isStatus(r.status)) throw new OnboardingError('Règles : statut invalide.')
      const hoursList = (x: unknown) => Array.isArray(x) && x.length <= 4 && x.every((h) => num(h, 1, 168))
      if (!r.sendWindow || !HHMM.test(r.sendWindow.start) || !HHMM.test(r.sendWindow.end) || r.sendWindow.start >= r.sendWindow.end) throw new OnboardingError('Plage d’envoi invalide.')
      if (!r.w02 || !hoursList(r.w02.remindersHoursBefore)) throw new OnboardingError('Rappels : heures invalides.')
      for (const k of ['w03', 'w04'] as const)
        if (!r[k] || !num(r[k].waitBeforeRecoveryHours, 0, 168) || !num(r[k].lastFollowUpDelayHours, 1, 720)) throw new OnboardingError('Relance : délais invalides.')
      return {
        ...p,
        rules: {
          status: r.status,
          sendWindow: { start: r.sendWindow.start, end: r.sendWindow.end },
          w01: p.rules.w01,
          w02: { remindersHoursBefore: [...r.w02.remindersHoursBefore].sort((a, b) => b - a), validationRequestDelayMin: p.rules.w02.validationRequestDelayMin },
          w03: { waitBeforeRecoveryHours: r.w03.waitBeforeRecoveryHours, lastFollowUpDelayHours: r.w03.lastFollowUpDelayHours },
          w04: { waitBeforeRecoveryHours: r.w04.waitBeforeRecoveryHours, lastFollowUpDelayHours: r.w04.lastFollowUpDelayHours },
        },
      }
    }
    case 'smartFill':
      return { ...p, smartFill: field(v, (x) => !!x && num((x as { maxContacts: number }).maxContacts, 1, 20), 'SmartFill') }
    case 'consent':
      return { ...p, consent: field(v, (x) => !!x && str((x as { marketingOptInText: string }).marketingOptInText, 600), 'Texte de consentement marketing') }
    default:
      throw new OnboardingError('Section inconnue.')
  }
}

export const PROFILE_SECTIONS: ProfileSection[] = ['identity', 'services', 'hours', 'booking', 'schedule', 'cancellation', 'rules', 'smartFill', 'consent']

/** Toutes les valeurs du profil et leur statut, à plat (pour le résumé et la readiness). */
export interface ProfileItem {
  section: string
  label: string
  status: DataStatus
}

export function profileItems(p: BusinessProfile): ProfileItem[] {
  const i = p.identity
  return [
    { section: 'Identité', label: 'Nom commercial', status: i.name.status },
    { section: 'Identité', label: 'Prénom de la professionnelle', status: i.artistFirstName.status },
    { section: 'Identité', label: 'Adresse', status: i.address.status },
    { section: 'Identité', label: 'Téléphone', status: i.phone.status },
    { section: 'Identité', label: 'E-mail', status: i.email.status },
    { section: 'Identité', label: 'Fuseau horaire', status: i.timezone.status },
    { section: 'Identité', label: 'Instagram', status: i.instagram.status },
    { section: 'Identité', label: 'Google Business Profile', status: i.googleReviewUrl.status },
    { section: 'Prestations', label: 'Catalogue des prestations', status: p.services.status },
    { section: 'Horaires', label: 'Horaires d’ouverture', status: i.openingHours.status },
    { section: 'Horaires', label: 'Pauses', status: p.breaks.status },
    { section: 'Horaires', label: 'Délai minimum et horizon de réservation', status: p.booking.status },
    { section: 'Planity', label: 'Agenda de référence', status: p.schedule.authority.status },
    { section: 'Planity', label: 'Rappels envoyés par l’agenda', status: p.schedule.externalReminders.status },
    { section: 'Annulation / no-show', label: 'Politique d’annulation', status: p.cancellation.status },
    { section: 'Annulation / no-show', label: 'Règles SmartFill', status: p.smartFill.status },
    { section: 'Communications', label: 'Règles de messages (plage, rappels, relances)', status: p.rules.status },
    { section: 'Clientes / consentement', label: 'Texte de consentement marketing', status: p.consent.status },
  ]
}
