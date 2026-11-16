/**
 * Import CSV générique des CLIENTES (aucun scraping, aucune automatisation Planity).
 *
 *   fichier → colonnes → MAPPING explicite → APERÇU (valides, doublons, erreurs) → import
 *
 * Module PUR : l'écran l'utilise pour l'aperçu, le serveur le RE-calcule avant d'importer
 * (jamais de confiance dans l'aperçu du navigateur). Un import ne crée JAMAIS de
 * consentement marketing ; la provenance (IMPORT ou PLANITY_EXPORT) est déclarée.
 */
import { findDuplicate, normalizePhone } from '../core/availability'
import type { Customer } from '../core/types'

export const IMPORT_FIELDS = ['firstName', 'lastName', 'phone', 'email'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]
export const importFieldLabels: Record<ImportField, string> = { firstName: 'Prénom', lastName: 'Nom', phone: 'Téléphone', email: 'E-mail' }

export type ImportSource = 'IMPORT' | 'PLANITY_EXPORT'
export const MAX_IMPORT_ROWS = 2000

/** Lecture CSV (séparateur « ; » ou « , », guillemets, BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows
}

/** Mapping : colonne choisie pour chaque champ (index), ou absent. */
export type ImportMapping = Partial<Record<ImportField, number>>

export interface ImportRow {
  firstName: string
  lastName: string
  phone: string
  email: string
}

export interface PlannedRow {
  line: number
  row: ImportRow
  outcome: 'new' | 'duplicate_existing' | 'duplicate_in_file' | 'invalid'
  reason?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[+0-9 ().-]{6,30}$/

/** Applique le mapping aux lignes (la première ligne est l'en-tête si `header`). */
export function mapRows(rows: string[][], mapping: ImportMapping, header = true): { line: number; row: ImportRow }[] {
  const body = header ? rows.slice(1) : rows
  const get = (r: string[], f: ImportField) => (mapping[f] === undefined ? '' : (r[mapping[f]!] ?? '').trim())
  return body.map((r, i) => ({ line: i + (header ? 2 : 1), row: { firstName: get(r, 'firstName'), lastName: get(r, 'lastName'), phone: get(r, 'phone'), email: get(r, 'email') } }))
}

export function validateImportRow(r: ImportRow): string | undefined {
  if (!r.firstName && !r.lastName) return 'Nom et prénom absents.'
  if (r.firstName.length > 60 || r.lastName.length > 60) return 'Nom trop long.'
  if (!r.phone && !r.email) return 'Ni téléphone ni e-mail : impossible de reconnaître la cliente.'
  if (r.phone && !PHONE.test(r.phone)) return 'Téléphone illisible.'
  if (r.email && (!EMAIL.test(r.email) || r.email.length > 120)) return 'E-mail invalide.'
  return undefined
}

/**
 * Aperçu : nouvelles clientes, doublons (déjà dans NOVIA, ou deux fois dans le fichier),
 * lignes invalides. Rien n'est écrit.
 */
export function planImport(rows: { line: number; row: ImportRow }[], existing: Customer[]): PlannedRow[] {
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Fichier trop long : ${MAX_IMPORT_ROWS} lignes au plus.`)
  const seenPhone = new Set<string>()
  const seenEmail = new Set<string>()
  return rows.map(({ line, row }) => {
    const reason = validateImportRow(row)
    if (reason) return { line, row, outcome: 'invalid', reason }
    if (findDuplicate(existing, row)) return { line, row, outcome: 'duplicate_existing', reason: 'Déjà dans NOVIA (même téléphone ou e-mail) : non importée.' }
    const p = normalizePhone(row.phone)
    const e = row.email.toLowerCase()
    if ((p && seenPhone.has(p)) || (e && seenEmail.has(e))) return { line, row, outcome: 'duplicate_in_file', reason: 'En double dans le fichier : seule la première ligne est importée.' }
    if (p) seenPhone.add(p)
    if (e) seenEmail.add(e)
    return { line, row, outcome: 'new' }
  })
}

export function summarize(plan: PlannedRow[]) {
  const count = (o: PlannedRow['outcome']) => plan.filter((p) => p.outcome === o).length
  return { total: plan.length, new: count('new'), duplicateExisting: count('duplicate_existing'), duplicateInFile: count('duplicate_in_file'), invalid: count('invalid') }
}
