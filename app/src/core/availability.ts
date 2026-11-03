import type { OpeningHours } from '../config/schema'
import { appointmentEnd } from './appointmentStatus'
import type { Appointment, Customer } from './types'

const occupies = (a: Appointment) => a.status !== 'cancelled' && a.status !== 'rescheduled'

const at = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

/** Créneaux libres d'une journée pour une durée donnée (pas de 30 min par défaut). */
export function availableSlots(
  day: Date,
  durationMin: number,
  hours: OpeningHours,
  appointments: Appointment[],
  now: Date,
  stepMin = 30,
): Date[] {
  const h = hours[day.getDay()]
  if (!h) return []
  const open = at(day, h.open)
  const close = at(day, h.close)
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
