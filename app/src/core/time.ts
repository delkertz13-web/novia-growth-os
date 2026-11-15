/**
 * Calendrier du SALON, jamais celui du navigateur ni du serveur.
 *
 * Toute décision qui dépend d'un jour, d'une heure ou d'une plage horaire (horaires
 * d'ouverture, plage d'envoi, « aujourd'hui », mois en cours, rappels) passe par ces
 * fonctions avec le fuseau explicite de l'établissement (BusinessProfile.timezone).
 * Un instant reste un `Date` (UTC) ; seule sa lecture « murale » dépend du fuseau.
 */

export interface WallTime {
  year: number
  /** 1 à 12 */
  month: number
  day: number
  hour: number
  minute: number
  /** 0 = dimanche … 6 = samedi */
  weekday: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()
const formatterFor = (timeZone: string) => {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    })
    formatters.set(timeZone, f)
  }
  return f
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Fuseau IANA valide (ex. « Europe/Paris ») ? */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false
  try {
    formatterFor(timeZone)
    return true
  } catch {
    return false
  }
}

/** Lecture murale d'un instant dans le fuseau du salon. */
export function wall(d: Date, timeZone: string): WallTime {
  const parts: Record<string, string> = {}
  for (const p of formatterFor(timeZone).formatToParts(d)) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday],
  }
}

/**
 * Instant correspondant à une heure murale du salon. Les débordements sont normalisés
 * (jour 32 → mois suivant, comme `new Date(y, m, d)`). Lors d'un changement d'heure,
 * une heure murale inexistante est décalée vers l'avant.
 */
export function zoned(timeZone: string, year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute)
  let t = target
  for (let i = 0; i < 3; i++) {
    const w = wall(new Date(t), timeZone)
    const seen = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute)
    if (seen === target) break
    t += target - seen
  }
  return new Date(t)
}

/** « 2026-11-19T15:10:00 » lu comme une heure murale du salon. */
export function parseWall(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(local)
  if (!m) throw new Error(`Date murale invalide : ${local}`)
  return zoned(timeZone, +m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0))
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Même jour (dans le salon), à l'heure murale donnée « HH:mm ». */
export function atTime(d: Date, hhmm: string, timeZone: string): Date {
  const w = wall(d, timeZone)
  const m = toMinutes(hhmm)
  return zoned(timeZone, w.year, w.month, w.day, Math.floor(m / 60), m % 60)
}

/** Minuit (heure du salon) du jour de `d`. */
export const startOfDay = (d: Date, timeZone: string) => atTime(d, '00:00', timeZone)

/** Même heure murale, `n` jours plus tard (ou plus tôt) dans le salon. */
export function addDays(d: Date, n: number, timeZone: string): Date {
  const w = wall(d, timeZone)
  return zoned(timeZone, w.year, w.month, w.day + n, w.hour, w.minute)
}

export const weekday = (d: Date, timeZone: string) => wall(d, timeZone).weekday

/** Minutes écoulées depuis minuit, heure du salon. */
export function minutesOfDay(d: Date, timeZone: string) {
  const w = wall(d, timeZone)
  return w.hour * 60 + w.minute
}

export function sameDay(a: Date, b: Date, timeZone: string) {
  const x = wall(a, timeZone)
  const y = wall(b, timeZone)
  return x.year === y.year && x.month === y.month && x.day === y.day
}

/** « 2026-11-19 » : clé du jour dans le salon. */
export function dayKey(d: Date, timeZone: string) {
  const w = wall(d, timeZone)
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`
}

/** Mois calendaire du salon contenant `d` : [1er à 00:00, 1er du mois suivant à 00:00[. */
export function monthOf(d: Date, timeZone: string) {
  const w = wall(d, timeZone)
  return { from: zoned(timeZone, w.year, w.month, 1), to: zoned(timeZone, w.year, w.month + 1, 1) }
}

/** Nombre de jours calendaires du salon entre deux instants (b − a). */
export function daysBetween(a: Date, b: Date, timeZone: string) {
  const x = wall(a, timeZone)
  const y = wall(b, timeZone)
  return Math.round((Date.UTC(y.year, y.month - 1, y.day) - Date.UTC(x.year, x.month - 1, x.day)) / 86_400_000)
}

/** Formatage français dans le fuseau du salon (jamais celui de l'appareil). */
export function formatIn(d: Date | string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleString('fr-FR', { ...options, timeZone })
}
