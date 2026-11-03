import type { ServiceConfig } from '../config/schema'
import { hasFutureBooking } from './workflows'
import { isActiveBooking } from './appointmentStatus'
import type { Appointment, Customer, WaitlistEntry } from './types'

/** RDV à venir, ou passé mais pas encore validé : la cliente n'est pas à solliciter. */
const hasPendingOrFutureBooking = (appointments: Appointment[], customerId: string, now: Date) =>
  hasFutureBooking(appointments, customerId, now) ||
  appointments.some((a) => a.customerId === customerId && isActiveBooking(a.status))

/**
 * SmartFill — SIMULATION. W12 reste À CONCEVOIR : l'éligibilité ci-dessous
 * est une règle de démonstration, pas une politique validée.
 * Éligibles : clientes sans RDV à venir, inscrites en liste d'attente ou
 * arrivant au délai de remplissage recommandé.
 * Contactables : éligibles sans opposition, avec consentement, sans reprise humaine.
 */
export function smartFillFunnel(input: {
  slotStart: Date
  slotDurationMin: number
  customers: Customer[]
  appointments: Appointment[]
  waitlist: WaitlistEntry[]
  services: ServiceConfig[]
  now: Date
}) {
  const { slotStart, slotDurationMin, customers, appointments, waitlist, services, now } = input
  const fits = (serviceId: string) => (services.find((s) => s.id === serviceId)?.durationMin ?? Infinity) <= slotDurationMin

  const lastShowed = (customerId: string) =>
    appointments
      .filter((a) => a.customerId === customerId && a.status === 'showed')
      .sort((a, b) => b.start.localeCompare(a.start))[0]

  const eligible = customers.filter((c) => {
    if (hasPendingOrFutureBooking(appointments, c.id, now)) return false
    if (waitlist.some((w) => w.customerId === c.id && fits(w.serviceId))) return true
    const last = lastShowed(c.id)
    if (!last || !fits(last.serviceId)) return false
    const days = services.find((s) => s.id === last.serviceId)?.returnRecommendedAfterDays
    if (!days) return false
    const due = new Date(last.start).getTime() + (days - 5) * 86_400_000
    return due <= slotStart.getTime()
  })

  const contactable = eligible.filter((c) => !c.optOut && c.consent.marketing && !c.humanTakeover)
  return { eligible, contactable }
}

/** Clientes arrivant à leur délai de remplissage (jours depuis la dernière prestation). */
export function refillsDue(
  customers: Customer[],
  appointments: Appointment[],
  services: ServiceConfig[],
  now: Date,
  windowDays = 5,
) {
  return customers
    .map((c) => {
      if (hasPendingOrFutureBooking(appointments, c.id, now)) return null
      const last = appointments
        .filter((a) => a.customerId === c.id && a.status === 'showed')
        .sort((a, b) => b.start.localeCompare(a.start))[0]
      const rec = last && services.find((s) => s.id === last.serviceId)?.returnRecommendedAfterDays
      if (!last || !rec) return null
      const daysSince = Math.floor((now.getTime() - new Date(last.start).getTime()) / 86_400_000)
      if (daysSince < rec - windowDays) return null
      return { customer: c, last, daysSince, recommended: rec }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.daysSince - a.daysSince)
}
