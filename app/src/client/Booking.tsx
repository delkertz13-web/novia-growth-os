import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { business } from '../config/business.demo'
import { galleryById } from '../config/content.demo'
import type { GalleryItem, ServiceConfig } from '../config/schema'
import { serviceById } from '../config/services.demo'
import type { Appointment } from '../core/types'
import { resolveMedia } from '../media/media'
import { providers } from '../providers/mock'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, Notice, Photo, useDemoState } from '../ui/common'
import { prefersReducedMotion } from '../ui/motion'
import './booking/booking.css'
import { Confirmation } from './booking/Confirmation'
import { dayState, dayStateLabel, depositLabel, inspoSize, sameDay, slotEnd, steps, type Step } from './booking/model'

const stepTitles: Record<Step, string> = {
  service: 'Prestation',
  when: 'Date et créneau',
  contact: 'Coordonnées',
  recap: 'Récapitulatif',
}

const period = (d: Date) => (d.getHours() < 12 ? 'Matin' : d.getHours() < 17 ? 'Après-midi' : 'Soir')
const hours = business.openingHours.value

export function Booking() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  useDemoState() // re-rendu quand l'agenda change

  const preset = params.get('service')
  const inspiration = params.get('inspiration')
  const inspo = inspiration ? galleryById(inspiration) : undefined
  const [serviceId, setServiceId] = useState<string | null>(preset && serviceById(preset) ? preset : null)
  const [step, setStep] = useState<Step>(serviceId ? 'when' : 'service')
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [day, setDay] = useState<Date | null>(null)
  const [slot, setSlot] = useState<Date | null>(null)
  const [contact, setContact] = useState({ firstName: '', lastName: '', phone: '', email: '' })
  const [touched, setTouched] = useState(false)
  const [sending, setSending] = useState(false)
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
    // `step` : recalcul en revenant sur l'étape (l'agenda a pu changer)
  }, [serviceId, step])

  const selectedDay = day ?? (slot ? new Date(new Date(slot).setHours(0, 0, 0, 0)) : null) ?? days.find((d) => d.count > 0)?.date ?? null
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

  const goTo = (s: Step) => {
    setDir(steps.indexOf(s) < idx ? 'back' : 'fwd')
    setStep(s)
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  const back = () => {
    if (idx === 0 || (idx === 1 && preset)) navigate(-1)
    else goTo(steps[idx - 1])
  }

  const confirm = () => {
    if (!service || !slot || sending) return
    const create = () => {
      const a = providers.booking.createBooking({ serviceId: service.id, start: slot, contact, source: 'site', origin: 'site' })
      setDone(a)
      window.scrollTo({ top: 0 })
    }
    // Un court temps d'envoi rend la confirmation lisible ; aucun appel réseau.
    if (prefersReducedMotion()) create()
    else {
      setSending(true)
      window.setTimeout(create, 450)
    }
  }

  const next = () => {
    if (step === 'contact' && !contactValid) {
      setTouched(true)
      return
    }
    if (step === 'recap') return confirm()
    goTo(steps[idx + 1])
  }

  if (done) return <Confirmation appointment={done} inspo={inspo} />

  const subject = step !== 'service' && service ? <Chosen step={step} inspo={inspo} service={service} /> : null

  return (
    <main className="flow">
      <div className="flow__top">
        <div className="wrap flow__bar">
          <button type="button" className="icon-btn" onClick={back} aria-label="Étape précédente">
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

      {subject && <div className="wrap flow__subject">{subject}</div>}

      <div className="wrap flow__body flow__step" data-dir={dir} key={step}>
        {step === 'service' && (
          <>
            <h1 className="display flow__title">Quelle séance ?</h1>
            <p className="flow__lead">
              {inspo ? `Pour votre inspiration « ${inspo.title} ». ` : ''}Prix et durées de démonstration.
            </p>
            <div className="choice-list">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`choice ${serviceId === s.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    if (s.id !== serviceId) {
                      setServiceId(s.id)
                      setDay(null)
                      setSlot(null)
                    }
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
            <h1 className="display flow__title">Quand ?</h1>
            <p className="flow__lead">Touchez un jour, puis un horaire.</p>
            <DayStrip
              days={days}
              selected={selectedDay}
              onPick={(d) => {
                setDay(d)
                if (slot && !sameDay(slot, d)) setSlot(null)
              }}
            />
            {selectedDay && <p className="when__day">{capitalize(fmt.dayLong(selectedDay))}</p>}
            <div className="when__slots" key={selectedDay?.toDateString()}>
              {Object.entries(grouped).map(([label, list]) => (
                <div className="slot-group" key={label}>
                  <h3>
                    {label} <small>{list.length}</small>
                  </h3>
                  <div className="slots">
                    {list.map((s) => {
                      const on = slot?.getTime() === s.getTime()
                      return (
                        <button key={s.toISOString()} type="button" className={`slot ${on ? 'is-selected' : ''}`} onClick={() => setSlot(s)} aria-pressed={on}>
                          {fmt.time(s)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {slots.length === 0 && <div className="empty">Aucun créneau ce jour-là.</div>}
            </div>
          </>
        )}

        {step === 'contact' && (
          <>
            <h1 className="display flow__title">Vos coordonnées</h1>
            <p className="flow__lead">Pour vous confirmer le rendez-vous. Rien n’est transmis dans cette démonstration.</p>
            <form
              id="contact-form"
              className="form-grid"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                next()
              }}
            >
              {(
                [
                  ['firstName', 'Prénom', 'given-name', 'text'],
                  ['lastName', 'Nom', 'family-name', 'text'],
                  ['phone', 'Téléphone', 'tel', 'tel'],
                  ['email', 'Email', 'email', 'email'],
                ] as const
              ).map(([key, label, ac, type], i, all) => (
                <div className="field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <input
                    id={key}
                    type={type}
                    autoComplete={ac}
                    enterKeyHint={i === all.length - 1 ? 'done' : 'next'}
                    inputMode={type === 'tel' ? 'tel' : type === 'email' ? 'email' : undefined}
                    value={contact[key]}
                    onChange={(e) => setContact({ ...contact, [key]: e.target.value })}
                    aria-invalid={touched && !!errors[key]}
                    aria-describedby={touched && errors[key] ? `${key}-err` : undefined}
                  />
                  {touched && errors[key] && (
                    <span className="field__error" id={`${key}-err`}>
                      {errors[key]}
                    </span>
                  )}
                </div>
              ))}
            </form>
          </>
        )}

        {step === 'recap' && service && slot && (
          <>
            <h1 className="display flow__title">On récapitule</h1>
            <p className="flow__lead">Tout est modifiable avant de confirmer.</p>
            <div className="card recap recap--v2">
              {inspo && (
                <div className="recap__inspo">
                  <div className="recap__inspo-media">
                    <Photo item={inspo} eager sizes="56px" />
                  </div>
                  <div>
                    <span className="recap__k">Inspiration</span>
                    <strong>{inspo.title}</strong>
                  </div>
                </div>
              )}
              <RecapRow k="Prestation" v={service.name} edit={() => goTo('service')} />
              <RecapRow k="Date" v={capitalize(fmt.dayLong(slot))} edit={() => goTo('when')} />
              <RecapRow k="Heure" v={`${fmt.time(slot)} → ${fmt.time(slotEnd(slot, service.durationMin))}`} />
              <RecapRow k="Durée" v={fmt.duration(service.durationMin)} />
              <RecapRow k="Avec" v={`${business.artistFirstName.value} · ${business.name.value}, ${business.city.value}`} />
              <RecapRow k="Au nom de" v={`${contact.firstName} ${contact.lastName}`} edit={() => goTo('contact')} />
              <div className="recap__money">
                <div className="recap__row recap__total">
                  <span>Prix</span>
                  <span>{fmt.eur(service.price)}</span>
                </div>
                <div className="recap__row">
                  <span>Acompte</span>
                  <span>{depositLabel(service, fmt.eur)}</span>
                </div>
              </div>
            </div>
            <ul className="trust">
              <li>
                <Icon name="check" size={14} stroke={2.4} /> Confirmation immédiate, puis rappels avant le rendez-vous
              </li>
              <li>
                <Icon name="check" size={14} stroke={2.4} /> Aucun paiement en ligne
              </li>
            </ul>
            <Notice>Démonstration : aucun paiement ni acompte n’est demandé, aucune réservation réelle n’est créée et aucun message n’est envoyé.</Notice>
          </>
        )}
      </div>

      <div className="flow__footer">
        <div className="wrap">
          <div className="flow__sum" aria-live="polite" key={slot?.getTime() ?? serviceId ?? 'none'}>
            {service ? (
              <>
                <strong>{service.name}</strong>
                <span>{slot ? `${capitalize(fmt.dayShort(slot))} · ${fmt.time(slot)} · ${fmt.eur(service.price)}` : `${fmt.duration(service.durationMin)} · ${fmt.eur(service.price)}`}</span>
              </>
            ) : (
              <span>Choisissez une prestation</span>
            )}
          </div>
          <button
            // Un bouton par étape : sinon le même nœud, devenu « submit » pendant le clic, soumettrait aussitôt les coordonnées.
            key={step}
            type={step === 'contact' ? 'submit' : 'button'}
            form={step === 'contact' ? 'contact-form' : undefined}
            className={`btn ${step === 'recap' ? 'btn--lacquer' : 'btn--primary'} ${sending ? 'is-sending' : ''}`}
            disabled={(!canNext && step !== 'contact') || sending}
            onClick={step === 'contact' ? undefined : next}
          >
            {sending ? 'Réservation…' : step === 'recap' ? 'Confirmer' : 'Continuer'}
            {!sending && <Icon name={step === 'recap' ? 'check' : 'arrowRight'} size={18} />}
          </button>
        </div>
      </div>
    </main>
  )
}

const RecapRow = ({ k, v, edit }: { k: string; v: string; edit?: () => void }) => (
  <div className="recap__row">
    <span>
      {k}
      {edit && (
        <button type="button" className="recap__edit" onClick={edit} aria-label={`Modifier : ${k}`}>
          Modifier
        </button>
      )}
    </span>
    <span>{v}</span>
  </div>
)

/** Bande de jours : fermé / complet / nombre de créneaux, jour choisi ramené à l'écran. */
function DayStrip({ days, selected, onPick }: { days: { date: Date; count: number }[]; selected: Date | null; onPick: (d: Date) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const strip = ref.current
    const el = strip?.querySelector<HTMLElement>('.day.is-selected')
    if (!strip || !el) return
    const left = el.offsetLeft - strip.offsetLeft
    if (left < strip.scrollLeft || left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: Math.max(0, left - 20), behavior: 'auto' })
    }
    // seulement à l'arrivée sur l'étape
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="days" ref={ref} role="listbox" aria-label="Jour">
      {days.map(({ date, count }) => {
        const state = dayState(date, hours, count)
        const on = !!selected && sameDay(date, selected)
        return (
          <button
            key={date.toISOString()}
            type="button"
            role="option"
            className={`day day--${state.kind} ${on ? 'is-selected' : ''}`}
            disabled={state.kind !== 'open'}
            onClick={() => onPick(date)}
            aria-selected={on}
            aria-label={`${capitalize(fmt.dayLong(date))} : ${dayStateLabel(state)}`}
          >
            <small>{date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</small>
            <b>{date.getDate()}</b>
            <i>{dayStateLabel(state)}</i>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Ce que l'on réserve, gardé en tête du parcours : la pose choisie en galerie (même
 * nom de transition que la visionneuse, donc continuité visuelle), sinon la prestation.
 * Grande au choix de la date, plus discrète ensuite, jamais retirée brutalement.
 */
function Chosen({ step, inspo, service }: { step: Step; inspo?: GalleryItem; service: ServiceConfig }) {
  const size = inspoSize(step)
  const fictional = inspo ? resolveMedia(inspo.id)?.provenance === 'fictif' : false
  return (
    <div className={`chosen chosen--${size} ${inspo ? 'chosen--inspo' : ''}`}>
      <div className="chosen__media" style={inspo ? ({ viewTransitionName: 'pose' } as CSSProperties) : undefined}>
        {inspo ? <Photo item={inspo} eager sizes="96px" /> : <Photo imageId={service.coverImageId} eager sizes="96px" />}
      </div>
      <div className="chosen__text">
        <span className="chosen__label">{inspo ? 'Je réserve cette inspiration' : 'Votre prestation'}</span>
        <span className="chosen__title">{inspo ? inspo.title : service.name}</span>
        <span className="chosen__sub">
          {inspo ? `${service.name} · ` : ''}
          {fmt.duration(service.durationMin)} · {fmt.eur(service.price)}
        </span>
        {fictional && <span className="chosen__prov">Visuel fictif, à titre d’inspiration</span>}
      </div>
    </div>
  )
}
