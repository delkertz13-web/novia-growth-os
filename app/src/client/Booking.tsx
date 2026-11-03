import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { business } from '../config/business.demo'
import { galleryById } from '../config/content.demo'
import { serviceById } from '../config/services.demo'
import type { Appointment } from '../core/types'
import { providers } from '../providers/mock'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, Notice, Photo, useDemoState } from '../ui/common'

type Step = 'service' | 'when' | 'contact' | 'recap'
const steps: Step[] = ['service', 'when', 'contact', 'recap']
const stepTitles: Record<Step, string> = {
  service: 'Prestation',
  when: 'Date et créneau',
  contact: 'Coordonnées',
  recap: 'Récapitulatif',
}

const period = (d: Date) => (d.getHours() < 12 ? 'Matin' : d.getHours() < 17 ? 'Après-midi' : 'Soir')

export function Booking() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  useDemoState() // re-rendu quand l'agenda change

  const preset = params.get('service')
  const inspiration = params.get('inspiration')
  const [serviceId, setServiceId] = useState<string | null>(preset && serviceById(preset) ? preset : null)
  const [step, setStep] = useState<Step>(serviceId ? 'when' : 'service')
  const [day, setDay] = useState<Date | null>(null)
  const [slot, setSlot] = useState<Date | null>(null)
  const [contact, setContact] = useState({ firstName: '', lastName: '', phone: '', email: '' })
  const [touched, setTouched] = useState(false)
  const [done, setDone] = useState<Appointment | null>(null)

  const service = serviceId ? serviceById(serviceId) : undefined
  const services = providers.booking.listServices()

  const days = useMemo(() => {
    const out: { date: Date; count: number }[] = []
    const base = new Date()
    base.setHours(0, 0, 0, 0)
    for (let i = 0; i < 21; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      out.push({ date: d, count: serviceId ? providers.booking.getSlots(d, serviceId).length : 0 })
    }
    return out
  }, [serviceId, step])

  const selectedDay = day ?? days.find((d) => d.count > 0)?.date ?? null
  const slots = selectedDay && serviceId ? providers.booking.getSlots(selectedDay, serviceId) : []
  const grouped = slots.reduce<Record<string, Date[]>>((acc, s) => {
    ;(acc[period(s)] ??= []).push(s)
    return acc
  }, {})

  const errors = {
    firstName: !contact.firstName.trim() ? 'Prénom requis' : '',
    lastName: !contact.lastName.trim() ? 'Nom requis' : '',
    phone: contact.phone.replace(/\D/g, '').length < 10 ? 'Numéro à 10 chiffres' : '',
    email: !/^\S+@\S+\.\S+$/.test(contact.email) ? 'Email invalide' : '',
  }
  const contactValid = !Object.values(errors).some(Boolean)

  const idx = steps.indexOf(step)
  const canNext = (step === 'service' && !!service) || (step === 'when' && !!slot) || (step === 'contact' && contactValid) || step === 'recap'

  const back = () => {
    if (idx === 0 || (idx === 1 && preset)) navigate(-1)
    else setStep(steps[idx - 1])
  }

  const next = () => {
    if (step === 'contact' && !contactValid) {
      setTouched(true)
      return
    }
    if (step === 'recap' && service && slot) {
      const a = providers.booking.createBooking({ serviceId: service.id, start: slot, contact, source: 'site', origin: 'site' })
      setDone(a)
      window.scrollTo({ top: 0 })
      return
    }
    setStep(steps[idx + 1])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (done && service) return <Confirmation appointment={done} />

  return (
    <main className="flow">
      <div className="flow__top">
        <div className="wrap flow__bar">
          <button className="icon-btn" onClick={back} aria-label="Étape précédente">
            <Icon name="arrowLeft" size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="flow__steplabel">
              ÉTAPE {idx + 1} / {steps.length}
            </div>
            <div style={{ fontWeight: 600 }}>{stepTitles[step]}</div>
          </div>
          <Link to="/" className="icon-btn" aria-label="Fermer">
            <Icon name="x" size={18} />
          </Link>
        </div>
        <div className="flow__progress">
          <i style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      <div className="wrap flow__body page" key={step}>
        {step === 'service' && (
          <>
            <h1 className="display flow__title">Quelle séance ?</h1>
            <p className="flow__lead">Prix et durées de démonstration.</p>
            <div className="choice-list">
              {services.map((s) => (
                <button
                  key={s.id}
                  className={`choice ${serviceId === s.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    setServiceId(s.id)
                    setDay(null)
                    setSlot(null)
                  }}
                  aria-pressed={serviceId === s.id}
                >
                  <Photo imageId={s.coverImageId} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {fmt.duration(s.durationMin)} · {fmt.eur(s.price)}
                    </div>
                  </div>
                  <span className="radio">{serviceId === s.id && <Icon name="check" size={13} stroke={2.4} />}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'when' && service && (
          <>
            <h1 className="display flow__title">Quand ?</h1>
            <p className="flow__lead">
              {service.name} · {fmt.duration(service.durationMin)}
              {inspiration && galleryById(inspiration) ? ` · inspiration « ${galleryById(inspiration)!.title} »` : ''}
            </p>
            <div className="days" role="listbox" aria-label="Jour">
              {days.map(({ date, count }) => {
                const selected = selectedDay && date.getTime() === selectedDay.getTime()
                return (
                  <button
                    key={date.toISOString()}
                    className={`day ${selected ? 'is-selected' : ''}`}
                    disabled={count === 0}
                    onClick={() => {
                      setDay(date)
                      setSlot(null)
                    }}
                    aria-selected={!!selected}
                  >
                    <small>{date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</small>
                    <b>{date.getDate()}</b>
                    <i>{count === 0 ? '—' : `${count} dispo`}</i>
                  </button>
                )
              })}
            </div>
            {selectedDay && (
              <p style={{ fontWeight: 600, margin: '0 0 14px' }}>{capitalize(fmt.dayLong(selectedDay))}</p>
            )}
            {Object.entries(grouped).map(([label, list]) => (
              <div className="slot-group" key={label}>
                <h3>{label}</h3>
                <div className="slots">
                  {list.map((s) => (
                    <button
                      key={s.toISOString()}
                      className={`slot ${slot?.getTime() === s.getTime() ? 'is-selected' : ''}`}
                      onClick={() => setSlot(s)}
                      aria-pressed={slot?.getTime() === s.getTime()}
                    >
                      {fmt.time(s)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {slots.length === 0 && <div className="empty">Aucun créneau ce jour-là.</div>}
          </>
        )}

        {step === 'contact' && (
          <>
            <h1 className="display flow__title">Vos coordonnées</h1>
            <p className="flow__lead">Pour vous confirmer le rendez-vous. Rien n’est transmis dans cette démonstration.</p>
            <div className="form-grid">
              {(
                [
                  ['firstName', 'Prénom', 'given-name', 'text'],
                  ['lastName', 'Nom', 'family-name', 'text'],
                  ['phone', 'Téléphone', 'tel', 'tel'],
                  ['email', 'Email', 'email', 'email'],
                ] as const
              ).map(([key, label, ac, type]) => (
                <div className="field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <input
                    id={key}
                    type={type}
                    autoComplete={ac}
                    inputMode={type === 'tel' ? 'tel' : type === 'email' ? 'email' : undefined}
                    value={contact[key]}
                    onChange={(e) => setContact({ ...contact, [key]: e.target.value })}
                    aria-invalid={touched && !!errors[key]}
                  />
                  {touched && errors[key] && <span className="field__error">{errors[key]}</span>}
                </div>
              ))}
            </div>
          </>
        )}

        {step === 'recap' && service && slot && (
          <>
            <h1 className="display flow__title">On récapitule</h1>
            <p className="flow__lead">Vérifiez avant de confirmer.</p>
            <div className="card recap">
              <Row k="Prestation" v={service.name} />
              <Row k="Date" v={capitalize(fmt.dayLong(slot))} />
              <Row k="Heure" v={`${fmt.time(slot)} · ${fmt.duration(service.durationMin)}`} />
              <Row k="Avec" v={`${business.artistFirstName.value} · ${business.name.value}`} />
              <Row k="Au nom de" v={`${contact.firstName} ${contact.lastName}`} />
              <div className="recap__row recap__total">
                <span>Prix</span>
                <span style={{ fontSize: 18 }}>{fmt.eur(service.price)}</span>
              </div>
              {service.deposit > 0 && <Row k="Acompte (fictif)" v={fmt.eur(service.deposit)} />}
            </div>
            <div style={{ height: 14 }} />
            <Notice>
              Démonstration : aucun paiement ni acompte n’est demandé, aucune réservation réelle n’est créée.
            </Notice>
          </>
        )}
      </div>

      <div className="flow__footer">
        <div className="wrap">
          <div className="flow__sum">
            {service ? (
              <>
                <strong>{service.name}</strong>
                <span>{slot ? `${capitalize(fmt.dayShort(slot))} · ${fmt.time(slot)}` : fmt.eur(service.price)}</span>
              </>
            ) : (
              <span>Choisissez une prestation</span>
            )}
          </div>
          <button className={`btn ${step === 'recap' ? 'btn--lacquer' : 'btn--primary'}`} disabled={!canNext && step !== 'contact'} onClick={next}>
            {step === 'recap' ? 'Confirmer' : 'Continuer'}
            <Icon name={step === 'recap' ? 'check' : 'arrowRight'} size={18} />
          </button>
        </div>
      </div>
    </main>
  )
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="recap__row">
    <span>{k}</span>
    <span>{v}</span>
  </div>
)

function Confirmation({ appointment: a }: { appointment: Appointment }) {
  const s = serviceById(a.serviceId)!
  const start = new Date(a.start)
  return (
    <main className="wrap done page">
      <div className="done__mark">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </div>
      <div className="eyebrow">Réservation simulée</div>
      <h1 className="display">C’est noté.</h1>
      <p className="muted" style={{ margin: 0 }}>
        {capitalize(fmt.dayLong(start))} à {fmt.time(start)}.
      </p>
      <div className="card recap">
        <Row k="Prestation" v={s.name} />
        <Row k="Durée" v={fmt.duration(s.durationMin)} />
        <Row k="Prix" v={fmt.eur(s.price)} />
        <Row k="Référence" v={a.ref} />
      </div>
      <Notice>
        Démonstration : la confirmation et les rappels (24 h et 2 h avant, paramètres démo) seraient envoyés automatiquement. Aucun
        message n’est envoyé.
      </Notice>
      <div className="done__actions">
        <Link to={`/pro/rdv/${a.id}`} className="btn btn--primary">
          Voir ce rendez-vous côté pro
        </Link>
        <Link to="/" className="btn btn--ghost">
          Retour à l’accueil
        </Link>
      </div>
    </main>
  )
}
