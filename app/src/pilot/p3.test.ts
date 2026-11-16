/**
 * P3 · préparation du pilote, partie PURE : statuts INCONNU / ESTIMÉ / VÉRIFIÉ, readiness
 * par capacité (plafond shadow), validation de la checklist, import CSV, récit des décisions.
 */
import { describe, expect, it } from 'vitest'
import type { BusinessProfile } from '../config/profile'
import { createPilotProfile } from './profile'
import { applyProfileSection, factOf, OnboardingError, SECTIONS, validateFact, type Facts } from './onboarding'
import { assessReadiness, completeness } from './readiness'
import { mapRows, MAX_IMPORT_ROWS, parseCsv, planImport, summarize } from './import'
import { narrate } from './narrative'
import type { Customer } from '../core/types'

const fresh = () => createPilotProfile('pilot-001', 'Europe/Paris')
const settings = (p: BusinessProfile) => ({ ...p.defaultSettings, voice: undefined }) as never
const cap = (p: BusinessProfile, id: string, facts: Facts = {}) => assessReadiness(p, facts, settings(p)).find((c) => c.id === id)!
const labels = SECTIONS.flatMap((s) => s.facts.map((f) => ({ key: f.key, label: f.label, section: s.title })))
const withTemplate = (p: BusinessProfile, id: keyof BusinessProfile['templates'], status: 'estimated' | 'verified'): BusinessProfile => ({
  ...p,
  templates: { ...p.templates, [id]: { value: 'Bonjour {firstName}', status } },
})

describe('entreprise neuve : tout est inconnu', () => {
  it('aucune information pré-remplie : la checklist entière est « inconnue »', () => {
    const c = completeness(fresh(), {}, labels)
    expect(c.verified).toEqual([])
    expect(c.estimated).toEqual([])
    expect(c.unknown.length).toBe(18 + labels.length)
    expect(factOf({}, 'planity.plan')).toEqual({ value: '', status: 'unknown' })
  })

  it('readiness : bloqué partout où une donnée manque ; Voice non configuré ; rien au-delà du shadow', () => {
    const caps = assessReadiness(fresh(), {}, settings(fresh()))
    expect(caps.find((c) => c.id === 'observed_agenda')!.level).toBe('BLOCKED')
    for (const id of ['booking_online', 'W02.confirmation', 'W02.reminder', 'W03', 'W04', 'smartfill', 'faq']) expect(caps.find((c) => c.id === id)!.level, id).toBe('BLOCKED')
    expect(caps.find((c) => c.id === 'voice')!.level).toBe('NOT_CONFIGURED')
    expect(caps.every((c) => c.level !== 'READY_FOR_TEST' && c.level !== 'READY_FOR_LIVE')).toBe(true)
    expect(cap(fresh(), 'booking_online').reasons.join(' ')).toMatch(/Agenda de référence : inconnu/)
    expect(cap(fresh(), 'W02.reminder').reasons.join(' ')).toMatch(/Rappels déjà envoyés par l’agenda \(Planity\) : inconnu/)
  })
})

describe('ESTIMÉ n’est jamais VÉRIFIÉ', () => {
  it('W04 : modèle estimé → bloqué avec la raison ; vérifié → prêt pour le shadow (et signalé coupé)', () => {
    const base: BusinessProfile = { ...fresh(), rules: { ...fresh().rules, status: 'verified' } }
    const est = cap(withTemplate(base, 'W04.recovery', 'estimated'), 'W04')
    expect(est.level).toBe('BLOCKED')
    expect(est.reasons.join(' ')).toMatch(/Texte de relance après absence : estimé, à confirmer/)
    const ok = cap(withTemplate(base, 'W04.recovery', 'verified'), 'W04')
    expect(ok.level).toBe('READY_FOR_SHADOW')
    expect(ok.disabled).toBe(true) // automatisations coupées au départ du pilote
  })

  it('SmartFill : règles et prestations vérifiées ne suffisent pas, le consentement marketing doit être connu', () => {
    const p: BusinessProfile = { ...fresh(), smartFill: { value: { maxContacts: 3 }, status: 'verified' }, services: { ...fresh().services, status: 'verified' } }
    expect(cap(p, 'smartfill').reasons.join(' ')).toMatch(/Consentement marketing des clientes : inconnu/)
    expect(cap(p, 'smartfill', { 'clients.marketingConsent': { value: 'Peut-être', status: 'estimated' } }).level).toBe('BLOCKED')
    expect(cap(p, 'smartfill', { 'clients.marketingConsent': { value: 'Aucune preuve : à recueillir', status: 'verified' } }).level).toBe('READY_FOR_SHADOW')
  })

  it('agenda : Planity vérifié comme référence → réservation en ligne bloquée, raison explicite', () => {
    const p: BusinessProfile = { ...fresh(), schedule: { authority: { value: 'planity', status: 'verified' }, externalReminders: { value: true, status: 'verified' } } }
    expect(cap(p, 'booking_online').reasons).toContain('Planity fait foi pour l’agenda : NOVIA n’affiche aucun créneau comme disponible.')
    expect(cap(p, 'W02.reminder').reasons).toContain('L’agenda envoie déjà des rappels : NOVIA n’en ajoute pas (doublon).')
  })
})

describe('checklist : validation (mêmes règles à l’écran et au serveur)', () => {
  it('fait : estimé ou vérifié exige un contenu ; clé inconnue refusée ; jamais « demo »', () => {
    expect(validateFact('planity.plan', { value: 'Essentiel ?', status: 'estimated' })).toEqual({ value: 'Essentiel ?', status: 'estimated' })
    expect(validateFact('planity.plan', { value: '', status: 'unknown' })).toEqual({ value: '', status: 'unknown' })
    expect(() => validateFact('planity.plan', { value: '  ', status: 'verified' })).toThrow(OnboardingError)
    expect(() => validateFact('planity.plan', { value: 'x', status: 'demo' })).toThrow(OnboardingError)
    expect(() => validateFact('inventee', { value: 'x', status: 'verified' })).toThrow(OnboardingError)
  })

  it('profil : une section à la fois, valeurs contrôlées, le reste inchangé', () => {
    const p = fresh()
    const svc = { id: 'pose', name: 'Pose', description: '', durationMin: 60, price: 40, deposit: 0, category: 'pose', returnRecommendedAfterDays: null, active: true, coverImageId: '' }
    const q = applyProfileSection(p, 'services', { status: 'estimated', items: [svc] })
    expect(q.services.status).toBe('estimated')
    expect(q.identity).toEqual(p.identity)
    expect(() => applyProfileSection(p, 'services', { status: 'verified', items: [] })).toThrow(/au moins une prestation/)
    expect(() => applyProfileSection(p, 'services', { status: 'verified', items: [{ ...svc, price: -1 }] })).toThrow(OnboardingError)
    expect(() => applyProfileSection(p, 'services', { status: 'demo', items: [svc] })).toThrow(OnboardingError)
    expect(() => applyProfileSection(p, 'hours', { openingHours: { value: { ...p.identity.openingHours.value, 1: { open: '19:00', close: '09:00' } }, status: 'verified' }, breaks: { value: [], status: 'verified' } })).toThrow(OnboardingError)
    expect(() => applyProfileSection(p, 'schedule', { authority: { value: 'google', status: 'verified' }, externalReminders: { value: false, status: 'unknown' } })).toThrow(OnboardingError)
  })
})

describe('import CSV', () => {
  const existing = [{ id: 'c1', firstName: 'Déjà', lastName: 'Là', phone: '06 22 22 22 22', email: 'deja@exemple.invalid' }] as Customer[]

  it('lecture : « ; » ou « , », guillemets, BOM, lignes vides ignorées', () => {
    expect(parseCsv('﻿Prénom;Nom;Tél\n"Ana";"D;E";0611\n\n')).toEqual([
      ['Prénom', 'Nom', 'Tél'],
      ['Ana', 'D;E', '0611'],
    ])
    expect(parseCsv('a,b\r\n"x ""y""",z')).toEqual([
      ['a', 'b'],
      ['x "y"', 'z'],
    ])
  })

  it('aperçu : nouvelles, doublons (base et fichier), invalides ; correspondance explicite', () => {
    const rows = parseCsv('tel;prenom;nom;mail\n0611111111;Ana;A;\n06 11 11 11 11;Ana;Bis;\n0622222222;X;Y;\n;;Z;\n;Bea;B;bea@exemple.invalid\n;Cy;C;pas-un-mail')
    const mapped = mapRows(rows, { phone: 0, firstName: 1, lastName: 2, email: 3 })
    expect(mapped[0]).toEqual({ line: 2, row: { firstName: 'Ana', lastName: 'A', phone: '0611111111', email: '' } })
    const plan = planImport(mapped, existing)
    expect(plan.map((x) => x.outcome)).toEqual(['new', 'duplicate_in_file', 'duplicate_existing', 'invalid', 'new', 'invalid'])
    expect(summarize(plan)).toEqual({ total: 6, new: 2, duplicateExisting: 1, duplicateInFile: 1, invalid: 2 })
    expect(() => planImport(Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ line: i, row: mapped[0].row })), [])).toThrow(/trop long/)
  })
})

describe('Shadow Control Center : récit lisible', () => {
  it('décision bloquée : déclencheur, action, vérifications et raison en français', () => {
    const n = narrate(
      { workflow: 'W04', action: 'W04 · étape 1', result: 'BLOCKED', reason: 'Opposition (STOP) enregistrée.', guards: [{ name: 'pas d’opposition (STOP)', ok: false }, { name: 'plage d’envoi', ok: true }], input_type: 'SequenceStepDue' },
      { time: 'mar. 14h00', customer: 'Ana A.' },
    )
    expect(n.headline).toBe('mar. 14h00 · Ana A. · Étape de relance due')
    expect(n.workflow).toBe('Relance après absence')
    expect(n.wouldDo).toBe('NOVIA aurait : W04 · étape 1')
    expect(n.checks).toEqual([
      { label: 'pas d’opposition (STOP)', ok: false },
      { label: 'plage d’envoi', ok: true },
    ])
    expect(n.outcome).toBe('Bloqué : Opposition (STOP) enregistrée.')
  })

  it('décision « aurait été exécutée » : rappelle que rien n’est envoyé', () => {
    const n = narrate({ workflow: 'W02', action: 'Confirmation', result: 'WOULD_EXECUTE', reason: '', guards: null, input_type: 'BookingCreated' }, { time: '10h00' })
    expect(n.blocked).toBe(false)
    expect(n.outcome).toMatch(/Rien n’a été envoyé \(mode shadow\)/)
    expect(n.headline).toBe('10h00 · Nouveau RDV saisi')
  })
})
