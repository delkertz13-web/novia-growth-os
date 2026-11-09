import type { OpeningHours } from '../config/schema'
import { appointmentEnd } from './appointmentStatus'
import { atTime, weekday } from './time'
import type { Appointment, Customer } from './types'

const occupies = (a: Appointment) => a.status !== 'cancelled' && a.status !== 'rescheduled'

/**
 * Créneaux libres d'une journée pour une durée donnée (pas de 30 min par défaut).
 * `day` désigne un jour du salon : les horaires sont lus dans son fuseau (`timeZone`).
 */
export function availableSlots(
  day: Date,
  durationMin: number,
  hours: OpeningHours,
  appointments: Appointment[],
  now: Date,
  timeZone: string,
  stepMin = 30,
): Date[] {
  const h = hours[weekday(day, timeZone)]
  if (!h) return []
  const open = atTime(day, h.open, timeZone)
  const close = atTime(day, h.close, timeZone)
  const busy = appointments.filter(occupies).map((a) => [new Date(a.start).getTime(), appointmentEnd(a).getTime()])
  const slots: Date[] = []
  for (let t = open.getTime(); t + durationMin * 60_000 <= close.getTime(); t += stepMin * 60_000) {
    const end = t + durationMin * 60_000
    if (t <= now.getTime()) continue
    if (busy.some(([s, e]) => t < e && end > s)) continue
    slots.push(new Date(t))
  }
  return slots
}

/** Le créneau [start, start + durée[ ne chevauche aucun RDV qui occupe l'agenda. */
export function isSlotFree(start: Date, durationMin: number, appointments: Appointment[], excludeId?: string): boolean {
  const s = start.getTime()
  const e = s + durationMin * 60_000
  return !appointments.some((a) => a.id !== excludeId && occupies(a) && s < appointmentEnd(a).getTime() && e > new Date(a.start).getTime())
}

/* ------------------------------------------------------------------ */
/* Déduplication des contacts (W01 : obligatoire)                       */
/* ------------------------------------------------------------------ */

export const normalizePhone = (p: string) => {
  const digits = p.replace(/\D/g, '')
  if (digits.startsWith('33') && digits.length === 11) return '0' + digits.slice(2)
  return digits
}

export function findDuplicate(customers: Customer[], input: { phone: string; email: string }): Customer | undefined {
  const phone = normalizePhone(input.phone)
  const email = input.email.trim().toLowerCase()
  return customers.find(
    (c) => (phone && normalizePhone(c.phone) === phone) || (email && c.email.trim().toLowerCase() === email),
  )
}
