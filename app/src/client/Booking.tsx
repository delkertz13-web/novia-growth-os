import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { business } from '../config/business.demo'
import { galleryById } from '../config/content.demo'
import { serviceById } from '../config/services.demo'
import type { Appointment } from '../core/types'
import { resolveMedia } from '../media/media'
import { novia } from '../domain'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, Photo, useDemoState } from '../ui/common'
import { prefersReducedMotion } from '../ui/motion'
import './booking/booking.css'
import { dayState, dayStateLabel, sameDay, steps, type Step } from './booking/model'
import { Scene } from './booking/Scene'
import { NextSteps, Ticket, type Phase } from './booking/Ticket'

const stepTitles: Record<Step, string> = {
  service: 'Prestation',
  when: 'Date et créneau',
  contact: 'Coordonnées',
  recap: 'Récapitulatif',
}

const period = (d: Date) => (d.getHours() < 12 ? 'Matin' : d.getHours() < 17 ? 'Après-midi' : 'Soir')
const hours = business.openingHours.value

/** Temps du « bouton qui réagit » avant que la réservation se pose (aucun appel réseau). */
const CONFIRM_DELAY = 450

/**
 * Réservation V2 — la pose choisie reste le décor de tout le parcours (Scene),
 * les étapes apparaissent sur des surfaces qui flottent au-dessus d'elle.
 * Logique, étapes, règles et provider inchangés.
 */
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
  const [bookedAt, setBookedAt] = useState<Date | null>(null)
  const doneTitle = useRef<HTMLHeadingElement>(null)

  const service = serviceId ? serviceById(serviceId) : undefined
  const services = novia.client.services()
  const phase: Phase = done ? 'done' : sending ? 'confirming' : 'edit'

  const days = useMemo(() => {
    const out: { date: Date; count: number }[] = []
    const base = novia.now()
    base.setHours(0, 0, 0, 0)
    for (let i = 0; i < 21; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      out.push({ date: d, count: serviceId ? novia.client.availableSlots(d, serviceId).length : 0 })
    }
    return out
    // `step` : recalcul en revenant sur l'étape (l'agenda a pu changer)
  }, [serviceId, step])

  const selectedDay = day ?? (slot ? new Date(new Date(slot).setHours(0, 0, 0, 0)) : null) ?? days.find((d) => d.count > 0)?.date ?? null
  const slots = selectedDay && serviceId ? novia.client.availableSlots(selectedDay, serviceId) : []
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
    if (!service || !slot || sending || done) return
    const create = () => {
      const a = novia.client.book({ serviceId: service.id, start: slot, contact, source: 'site', origin: 'site' })
      setBookedAt(novia.now())
      setDone(a)
    }
    // Le bouton réagit, le décor se calme et le ticket se recentre, puis la réservation se pose.
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    if (prefersReducedMotion()) create()
    else {
      setSending(true)
      window.setTimeout(create, CONFIRM_DELAY)
    }
  }

  useEffect(() => {
    if (done) doneTitle.current?.focus({ preventScroll: true })
  }, [done])

  const next = () => {
    if (step === 'contact' && !contactValid) {
      setTouched(true)
      return
    }
    if (step === 'recap') return confirm()
    goTo(steps[idx + 1])
  }

  // Décor : la pose choisie, sinon la prestation (choisie ou première de la liste).
  const sceneIds = inspo ? [inspo.id] : [(service ?? services[0])?.coverImageId ?? 'g-pose-01']
  const fictional = inspo ? resolveMedia(inspo.id)?.provenance === 'fictif' : false
  const subjectTitle = inspo ? inspo.title : service?.name
  const contactName = `${contact.firstName} ${contact.lastName}`.trim()

  return (
    <main className="bk" data-step={step} data-phase={phase}>
      <Scene ids={sceneIds} vtName={inspo ? 'pose' : undefined} />

      <div className="bk__top">
        <div className="wrap bk__bar">
          {phase === 'done' ? (
            <span className="bk__icon bk__icon--ghost" />
          ) : (
            <button type="button" className="bk__icon glass" onClick={back} aria-label="Étape précédente" disabled={phase !== 'edit'}>
              <Icon name="arrowLeft" size={18} />
            </button>
          )}
          <div className="bk__steps">
            <span>{phase === 'done' ? 'Réservation simulée' : `Étape ${idx + 1} / ${steps.length}`}</span>
            <strong>{phase === 'done' ? 'Confirmé' : stepTitles[step]}</strong>
          </div>
          <Link to="/" className="bk__icon glass" aria-label="Fermer">
            <Icon name="x" size={18} />
          </Link>
        </div>
        <div className="bk__progress" aria-hidden="true">
          {steps.map((s, i) => (
            <i key={s} className={i <= idx || phase === 'done' ? 'is-on' : undefined} />
          ))}
        </div>
      </div>

      <div className="wrap bk__step" data-dir={dir} key={step}>
        {step === 'service' && (
          <>
            <header className="bk-stage bk-stage--short">
              {inspo && <span className="bk-eyebrow">Pour votre inspiration « {inspo.title} »</span>}
              <h1 className="display bk-title">Quelle séance ?</h1>
              <p className="bk-lead">Prix et durées de démonstration.</p>
            </header>
            <div className="bk-sheet">
              <div className="bk-choices">
                {services.map((s) => {
                  const on = serviceId === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`bk-choice ${on ? 'is-selected' : ''}`}
                      onClick={() => {
                        if (s.id !== serviceId) {
                          setServiceId(s.id)
                          setDay(null)
                          setSlot(null)
                        }
                      }}
                      aria-pressed={on}
                    >
                      <Photo imageId={s.coverImageId} sizes="56px" />
                      <span className="bk-choice__text">
                        <strong>{s.name}</strong>
                        <span>
                          {fmt.duration(s.durationMin)} · {fmt.eur(s.price)}
                        </span>
                      </span>
                      <span className="bk-choice__radio">{on && <Icon name="check" size={13} stroke={2.6} />}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {step === 'when' && service && (
          <>
            <header className="bk-stage bk-stage--tall">
              <span className="bk-eyebrow">{inspo ? 'Je réserve cette inspiration' : 'Votre prestation'}</span>
              <h1 className="display bk-title bk-title--xl">{subjectTitle}</h1>
              <p className="bk-lead">
                {inspo ? `${service.name} · ` : ''}
                {fmt.duration(service.durationMin)} · {fmt.eur(service.price)}
              </p>
              {fictional && <span className="bk-prov">Visuel fictif, à titre d’inspiration</span>}
            </header>
            <div className="bk-sheet bk-sheet--glass">
              <h2 className="bk-sheet__title">Quand venez-vous ?</h2>
              <DayStrip
                days={days}
                selected={selectedDay}
                onPick={(d) => {
                  setDay(d)
                  if (slot && !sameDay(slot, d)) setSlot(null)
                }}
              />
              <div className="bk-slots" key={selectedDay?.toDateString()}>
                {selectedDay && <p className="bk-slots__day">{capitalize(fmt.dayLong(selectedDay))}</p>}
                {Object.entries(grouped).map(([label, list]) => (
                  <div className="bk-slots__group" key={label}>
                    <h3>
                      {label} <small>{list.length}</small>
                    </h3>
                    <div className="bk-slots__grid">
                      {list.map((s) => {
                        const on = slot?.getTime() === s.getTime()
                        return (
                          <button key={s.toISOString()} type="button" className={`bk-slot ${on ? 'is-selected' : ''}`} onClick={() => setSlot(s)} aria-pressed={on}>
                            {fmt.time(s)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {slots.length === 0 && <div className="bk-empty">Aucun créneau ce jour-là.</div>}
              </div>
            </div>
          </>
        )}

        {step === 'contact' && service && (
          <>
            <header className="bk-stage bk-stage--mid">
              <span className="bk-eyebrow">{inspo ? 'Je réserve cette inspiration' : 'Votre prestation'}</span>
              <h1 className="display bk-title">{subjectTitle}</h1>
              {slot && (
                <p className="bk-lead">
                  {capitalize(fmt.dayShort(slot))} · <strong>{fmt.time(slot)}</strong>
                </p>
              )}
            </header>
            <div className="bk-sheet bk-sheet--glass">
              <h2 className="bk-sheet__title">À quel nom ?</h2>
              <p className="bk-sheet__lead">Pour vous confirmer le rendez-vous. Rien n’est transmis dans cette démonstration.</p>
              <form
                id="contact-form"
                className="bk-form"
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
                  <div className="bk-field" key={key}>
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
                      <span className="bk-field__error" id={`${key}-err`}>
                        {errors[key]}
                      </span>
                    )}
                  </div>
                ))}
              </form>
            </div>
          </>
        )}

        {step === 'recap' && service && slot && (
          <>
            <header className="bk-stage bk-stage--recap">
              <div className="bk-swap" key={phase === 'done' ? 'done' : 'recap'}>
                {phase === 'done' ? (
                  <>
                    <span className="bk-eyebrow">Réservation simulée · démo</span>
                    <h1 className="display bk-title bk-title--done" ref={doneTitle} tabIndex={-1}>
                      C’est réservé.
                    </h1>
                  </>
                ) : (
                  <>
                    <span className="bk-eyebrow">Dernière étape</span>
                    <h1 className="display bk-title">Votre rendez-vous</h1>
                  </>
                )}
              </div>
            </header>

            <Ticket
              phase={phase}
              service={service}
              slot={slot}
              inspo={inspo}
              contactName={contactName}
              appointment={done}
              onEdit={(what) => goTo(what)}
            />

            {phase !== 'done' && <p className="bk-note">Démonstration : aucun paiement, aucune réservation réelle, aucun message envoyé.</p>}

            {done && bookedAt && (
              <>
                <NextSteps appointment={done} bookedAt={bookedAt} />
                <div className="bk-actions">
                  <Link to={`/pro/rdv/${done.id}`} className="btn btn--light btn--block">
                    Voir ce rendez-vous côté pro
                  </Link>
                  <Link to="/" className="bk-link">
                    Retour à l’accueil
                  </Link>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {phase !== 'done' && (
        <div className={`bk__footer ${step === 'recap' ? 'bk__footer--confirm' : ''}`}>
          <div className="wrap bk__footer-row">
            {step !== 'recap' && (
              <div className="bk__sum" aria-live="polite" key={slot?.getTime() ?? serviceId ?? 'none'}>
                {service ? (
                  <>
                    <span>{service.name}</span>
                    <strong>{slot ? `${capitalize(fmt.dayShort(slot))} · ${fmt.time(slot)}` : `${fmt.duration(service.durationMin)} · ${fmt.eur(service.price)}`}</strong>
                  </>
                ) : (
                  <span>Choisissez une prestation</span>
                )}
              </div>
            )}
            <button
              // Un bouton par étape : sinon le même nœud, devenu « submit » pendant le clic, soumettrait aussitôt les coordonnées.
              key={step}
              type={step === 'contact' ? 'submit' : 'button'}
              form={step === 'contact' ? 'contact-form' : undefined}
              className={`btn ${step === 'recap' ? 'btn--lacquer bk__confirm' : 'btn--light'} ${sending ? 'is-sending' : ''}`}
              disabled={!canNext && step !== 'contact'}
              aria-busy={sending || undefined}
              onClick={step === 'contact' ? undefined : next}
            >
              {step === 'recap' ? (
                <>
                  <span className="bk__confirm-label">{sending ? 'Réservation…' : 'Confirmer la réservation'}</span>
                  {!sending && service && <span className="bk__confirm-price">{fmt.eur(service.price)}</span>}
                  <i className="bk__confirm-progress" aria-hidden="true" />
                </>
              ) : (
                <>
                  Continuer <Icon name="arrowRight" size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

/** Bande de jours : fermé / complet / nombre de créneaux, jour choisi ramené à l'écran. */
function DayStrip({ days, selected, onPick }: { days: { date: Date; count: number }[]; selected: Date | null; onPick: (d: Date) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const strip = ref.current
    const el = strip?.querySelector<HTMLElement>('.bk-day.is-selected')
    if (!strip || !el) return
    const left = el.offsetLeft - strip.offsetLeft
    if (left < strip.scrollLeft || left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: Math.max(0, left - 20), behavior: 'auto' })
    }
    // seulement à l'arrivée sur l'étape
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="bk-days" ref={ref} role="listbox" aria-label="Jour">
      {days.map(({ date, count }) => {
        const state = dayState(date, hours, count)
        const on = !!selected && sameDay(date, selected)
        return (
          <button
            key={date.toISOString()}
            type="button"
            role="option"
            className={`bk-day bk-day--${state.kind} ${on ? 'is-selected' : ''}`}
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
