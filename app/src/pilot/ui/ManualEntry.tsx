/**
 * Saisies manuelles du pilote. Tout passe par l'API → moteur → base : l'écran n'écrit
 * jamais rien lui-même. La PROVENANCE est posée par le serveur (saisie de la pro ou de la
 * propriétaire) : une saisie manuelle n'est jamais présentée comme venant de Planity.
 *
 * Agenda observé : la pro recopie ses RDV tels qu'ils figurent dans Planity (qui fait foi).
 * Présente / absente / annulée / reportée, consentement, opposition et « déclarer payé »
 * se font depuis la fiche du RDV ou de la cliente.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { novia } from '../../domain'
import type { Appointment, Customer, Provenance } from '../../core/types'
import { fmt, salon, useDemoState } from '../../ui/common'
import { pilotApi } from '../client'
import { ActionMsg, Loading, PilotPage, useAction, useLoad } from './kit'

export const provenanceText: Record<Provenance, string> = {
  PRO_MANUAL: 'Saisie de la pro',
  OWNER_MANUAL: 'Saisie de la propriétaire',
  PLANITY_EXPORT: 'Export Planity (importé)',
  PLANITY_NOTIFICATION: 'Notification Planity',
  NOVIA_BOOKING: 'Réservation NOVIA',
  VOICE: 'NOVIA Voice',
  GHL: 'GHL',
  IMPORT: 'Import de fichier',
}

const leadSources = [
  ['manual', 'Saisie (Planity, carnet…)'],
  ['phone', 'Téléphone'],
  ['instagram', 'Instagram'],
  ['referral', 'Recommandation'],
] as const

const emptyContact = { firstName: '', lastName: '', phone: '', email: '' }

export function ManualEntry() {
  const st = useDemoState()
  const { data, error } = useLoad(pilotApi.onboarding)
  if (!data) return <PilotPage title="Saisies">{<Loading error={error} />}</PilotPage>
  const services = data.engineProfile.services.items.filter((s) => s.active)
  const authority = data.engineProfile.schedule.authority.value
  return (
    <PilotPage title="Saisies manuelles">
      <p className="pl-banner">
        {authority === 'planity'
          ? 'Agenda observé : recopiez les RDV tels qu’ils sont dans Planity. Planity fait foi ; NOVIA ne propose aucun créneau comme disponible.'
          : 'Agenda NOVIA : les RDV saisis ici font partie de l’agenda.'}
      </p>
      <div className="pl-grid" style={{ marginTop: 12 }}>
        <NewCustomer />
        <NewAppointment customers={st.customers} services={services} />
        <CorrectAppointment appointments={st.appointments} customers={st.customers} services={services} />
        <Waitlist customers={st.customers} services={services} />
        <section className="pl-card">
          <h3>Présence, absence, annulation, report, paiement, consentement</h3>
          <p className="pl-msg">
            Depuis la fiche du RDV (agenda) : présente, absente, annulée, reportée, « déclarer payé ». Depuis la fiche de la cliente : consentement et
            opposition.
          </p>
          <div className="pl-row">
            <Link className="btn btn--ghost btn--sm" to="/pro/agenda">
              Ouvrir l’agenda
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/pro/clientes">
              Ouvrir les clientes
            </Link>
          </div>
        </section>
        <Recent appointments={st.appointments} customers={st.customers} />
      </div>
    </PilotPage>
  )
}

function ContactFields({ value, onChange }: { value: typeof emptyContact; onChange: (v: typeof emptyContact) => void }) {
  const f = (k: keyof typeof emptyContact, label: string, type = 'text') => (
    <label className="pl-label">
      {label}
      <input type={type} value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
    </label>
  )
  return (
    <div className="pl-fields">
      {f('firstName', 'Prénom')}
      {f('lastName', 'Nom')}
      {f('phone', 'Téléphone', 'tel')}
      {f('email', 'E-mail', 'email')}
    </div>
  )
}

function NewCustomer() {
  const [c, setC] = useState(emptyContact)
  const a = useAction()
  return (
    <section className="pl-card">
      <h3>Créer une cliente</h3>
      <ContactFields value={c} onChange={setC} />
      <p className="pl-msg">Aucun consentement marketing n’est créé : il se déclare à part, avec sa preuve.</p>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={a.busy || !(c.firstName || c.lastName) || !(c.phone || c.email)}
        onClick={async () => {
          const ok = await a.run(async () => {
            const r = await novia.run({ type: 'ContactUpserted', contact: c, leadSource: 'manual' })
            if (!r.ok) throw new Error(r.error)
          }, 'Cliente enregistrée.')
          if (ok) setC(emptyContact)
        }}
      >
        Enregistrer la cliente
      </button>
      <ActionMsg msg={a.msg} />
    </section>
  )
}

type Svc = { id: string; name: string; durationMin: number }

function ServiceSelect({ services, value, onChange }: { services: Svc[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="pl-label">
      Prestation
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choisir…</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({fmt.duration(s.durationMin)})
          </option>
        ))}
      </select>
    </label>
  )
}

function CustomerSelect({ customers, value, onChange, allowNew }: { customers: Customer[]; value: string; onChange: (v: string) => void; allowNew?: boolean }) {
  return (
    <label className="pl-label">
      Cliente
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {allowNew ? <option value="">Nouvelle cliente…</option> : <option value="">Choisir…</option>}
        {[...customers]
          .sort((x, y) => x.lastName.localeCompare(y.lastName))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
      </select>
    </label>
  )
}

function NewAppointment({ customers, services }: { customers: Customer[]; services: Svc[] }) {
  const [customerId, setCustomerId] = useState('')
  const [contact, setContact] = useState(emptyContact)
  const [serviceId, setServiceId] = useState('')
  const [when, setWhen] = useState('')
  const [lead, setLead] = useState<(typeof leadSources)[number][0]>('manual')
  const a = useAction()
  const start = when ? salon.parseLocal(when) : null
  return (
    <section className="pl-card">
      <h3>Saisir un RDV observé</h3>
      {!services.length && (
        <p className="pl-msg pl-msg--error">
          Aucune prestation enregistrée : ajoutez-les d’abord dans <Link to="/pro/pilote/preparation/prestations">Préparation · Prestations</Link>.
        </p>
      )}
      <CustomerSelect customers={customers} value={customerId} onChange={setCustomerId} allowNew />
      {!customerId && <ContactFields value={contact} onChange={setContact} />}
      <ServiceSelect services={services} value={serviceId} onChange={setServiceId} />
      <div className="pl-fields">
        <label className="pl-label">
          Date et heure (fuseau du salon)
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="pl-label">
          Comment la cliente a réservé
          <select value={lead} onChange={(e) => setLead(e.target.value as typeof lead)}>
            {leadSources.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={a.busy || !serviceId || !start || (!customerId && !(contact.phone || contact.email))}
        onClick={async () => {
          const ok = await a.run(async () => {
            const r = await novia.run<Appointment>({
              type: 'BookingCreated',
              serviceId,
              start: start!.toISOString(),
              ...(customerId ? { customerId } : { contact }),
              leadSource: lead,
              origin: 'pro',
            })
            if (!r.ok) throw new Error(r.error)
          }, 'RDV enregistré (agenda observé). NOVIA l’observe en shadow.')
          if (ok) {
            setWhen('')
            setContact(emptyContact)
          }
        }}
      >
        Enregistrer le RDV
      </button>
      <ActionMsg msg={a.msg} />
    </section>
  )
}

function CorrectAppointment({ appointments, customers, services }: { appointments: Appointment[]; customers: Customer[]; services: Svc[] }) {
  const [id, setId] = useState('')
  const [when, setWhen] = useState('')
  const [serviceId, setServiceId] = useState('')
  const a = useAction()
  const start = when ? salon.parseLocal(when) : null
  const upcoming = appointments.filter((x) => x.status === 'booked' || x.status === 'confirmed').sort((x, y) => x.start.localeCompare(y.start))
  const name = (cid: string) => {
    const c = customers.find((x) => x.id === cid)
    return c ? `${c.firstName} ${c.lastName}` : 'Cliente'
  }
  return (
    <section className="pl-card">
      <h3>Corriger une erreur de saisie</h3>
      <p className="pl-msg">Pour une faute de frappe (heure, prestation). Si la cliente a déplacé son RDV, utilisez « Reporter » sur la fiche du RDV.</p>
      <label className="pl-label">
        RDV
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Choisir…</option>
          {upcoming.map((x) => (
            <option key={x.id} value={x.id}>
              {fmt.dayShort(x.start)} {fmt.time(x.start)} · {name(x.customerId)}
            </option>
          ))}
        </select>
      </label>
      <div className="pl-fields">
        <label className="pl-label">
          Bonne date et heure
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <ServiceSelect services={services} value={serviceId} onChange={setServiceId} />
      </div>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={a.busy || !id || (!start && !serviceId)}
        onClick={() =>
          a.run(async () => {
            const r = await novia.run({ type: 'AppointmentCorrected', appointmentId: id, ...(start ? { start: start.toISOString() } : {}), ...(serviceId ? { serviceId } : {}) })
            if (!r.ok) throw new Error(r.error)
          }, 'RDV corrigé : aucun message, rappels recalculés.')
        }
      >
        Corriger
      </button>
      <ActionMsg msg={a.msg} />
    </section>
  )
}

const WEEK = [
  [1, 'Lun'],
  [2, 'Mar'],
  [3, 'Mer'],
  [4, 'Jeu'],
  [5, 'Ven'],
  [6, 'Sam'],
  [0, 'Dim'],
] as const
const PERIODS = [
  ['matin', 'Matin'],
  ['apres-midi', 'Après-midi'],
  ['soir', 'Soir'],
] as const

function Waitlist({ customers, services }: { customers: Customer[]; services: Svc[] }) {
  const [customerId, setCustomerId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [days, setDays] = useState<number[]>([])
  const [periods, setPeriods] = useState<string[]>([])
  const a = useAction()
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  return (
    <section className="pl-card">
      <h3>Liste d’attente</h3>
      <CustomerSelect customers={customers} value={customerId} onChange={setCustomerId} />
      <ServiceSelect services={services} value={serviceId} onChange={setServiceId} />
      <div className="pl-row" role="group" aria-label="Jours souhaités">
        {WEEK.map(([d, l]) => (
          <button key={d} type="button" className={`chip chip--sm ${days.includes(d) ? 'is-active' : ''}`} aria-pressed={days.includes(d)} onClick={() => setDays(toggle(days, d))}>
            {l}
          </button>
        ))}
      </div>
      <div className="pl-row" role="group" aria-label="Moments souhaités">
        {PERIODS.map(([p, l]) => (
          <button key={p} type="button" className={`chip chip--sm ${periods.includes(p) ? 'is-active' : ''}`} aria-pressed={periods.includes(p)} onClick={() => setPeriods(toggle(periods, p))}>
            {l}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={a.busy || !customerId || !serviceId}
        onClick={() =>
          a.run(async () => {
            const r = await novia.run({ type: 'WaitlistJoined', customerId, serviceId, days, periods: periods as ('matin' | 'apres-midi' | 'soir')[] })
            if (!r.ok) throw new Error(r.error)
          }, 'Inscrite en liste d’attente.')
        }
      >
        Inscrire
      </button>
      <ActionMsg msg={a.msg} />
    </section>
  )
}

function Recent({ appointments, customers }: { appointments: Appointment[]; customers: Customer[] }) {
  const last = [...appointments].sort((x, y) => (y.bookedAt ?? y.start).localeCompare(x.bookedAt ?? x.start)).slice(0, 10)
  const name = (cid: string) => {
    const c = customers.find((x) => x.id === cid)
    return c ? `${c.firstName} ${c.lastName}` : 'Cliente'
  }
  return (
    <section className="pl-card">
      <h3>Dernières saisies</h3>
      {!last.length && <p className="pl-msg">Aucun RDV saisi.</p>}
      <ul className="pl-list">
        {last.map((x) => (
          <li key={x.id}>
            <Link to={`/pro/rdv/${x.id}`}>
              {fmt.dayShort(x.start)} {fmt.time(x.start)} · {name(x.customerId)}
            </Link>
            <span className="pl-tag">{x.provenance ? provenanceText[x.provenance] : 'Provenance non renseignée'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
