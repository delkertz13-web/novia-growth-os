import { useState } from 'react'
import { Link } from 'react-router-dom'
import { business } from '../config/business.demo'
import { novia, type NoviaSettings } from '../domain'
import { Icon } from '../ui/Icon'
import { fmt, useDemoState } from '../ui/common'
import { VoiceControls } from './Voice'

const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const weekOrder = [1, 2, 3, 4, 5, 6, 0]
const hours = Array.from({ length: 15 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`)

type AutoKey = keyof NoviaSettings['automations']
const automations: { key: AutoKey; title: string; help: string; soon?: boolean }[] = [
  { key: 'cancellationRecovery', title: 'Récupérer les annulations', help: 'Après une annulation, NOVIA propose un nouveau créneau à la cliente.' },
  { key: 'noShowRecovery', title: 'Récupérer les absences', help: 'Après une absence, un message bienveillant pour reprendre rendez-vous.' },
  { key: 'smartFill', title: 'Remplir les créneaux libérés', help: 'Quand un créneau se libère, NOVIA le propose aux clientes en attente ou proches d’un remplissage.' },
  { key: 'rebooking', title: 'Rappeler les remplissages', help: 'NOVIA repère les clientes dont le remplissage approche.' },
  { key: 'reviews', title: 'Demander un avis', help: 'Après la prestation.', soon: true },
  { key: 'referral', title: 'Parrainage', help: 'Une cliente recommande une amie.', soon: true },
]

const channels: { key: keyof NoviaSettings['channels']; label: string }[] = [
  { key: 'sms', label: 'SMS' },
  { key: 'email', label: 'E-mail' },
  { key: 'instagram', label: 'Instagram' },
]

/** Quelques réglages compréhensibles, pas un panneau technique. */
export function Settings() {
  const st = useDemoState()
  const s = st.settings
  const [error, setError] = useState('')
  const update = (patch: Parameters<typeof novia.pro.updateSettings>[0]) => {
    const r = novia.pro.updateSettings(patch)
    setError(r.ok ? '' : r.error)
  }
  const takenOver = st.customers.filter((c) => c.humanTakeover)

  return (
    <main className="wrap page ops settings">
      <header className="p-head">
        <Link to="/pro/novia" className="icon-btn" aria-label="Retour à NOVIA">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <div>
          <div className="p-head__date">Réglages</div>
          <h1 className="display">{business.name.value}</h1>
        </div>
      </header>
      <p className="ops-hint" style={{ marginTop: 0 }}>
        Les changements s’appliquent tout de suite à la démonstration (stockés sur cet appareil uniquement).
      </p>
      {error && (
        <p className="ops-hint ops-hint--alert" role="alert">
          {error}
        </p>
      )}

      <section className="p-section">
        <h2 className="p-section__title">Mon activité</h2>
        <div className="card set-card">
          <div className="set-row set-row--static">
            <span>
              <strong>Horaires d’ouverture</strong>
            </span>
          </div>
          <dl className="set-hours">
            {weekOrder.map((d) => {
              const h = business.openingHours.value[d]
              return (
                <div key={d} className={h ? '' : 'is-closed'}>
                  <dt>{days[d]}</dt>
                  <dd>{h ? `${h.open.replace(':', 'h')} – ${h.close.replace(':', 'h')}` : 'Fermé'}</dd>
                </div>
              )
            })}
          </dl>
        </div>
        <div className="card set-card">
          <div className="set-row set-row--static">
            <span>
              <strong>Prestations</strong>
            </span>
          </div>
          <ul className="set-services">
            {novia.client.services().map((sv) => (
              <li key={sv.id}>
                <span>{sv.name}</span>
                <span className="muted">{fmt.duration(sv.durationMin)}</span>
                <strong>{fmt.eur(sv.price)}</strong>
              </li>
            ))}
          </ul>
        </div>
        <p className="ops-hint">Horaires et prestations de démonstration : modifiables en production depuis cet écran.</p>
      </section>

      <section className="p-section">
        <h2 className="p-section__title">
          <Icon name="sparkle" size={18} /> Ce que NOVIA fait pour vous
        </h2>
        <div className="card set-card">
          {automations.map((a) => (
            <label key={a.key} className={`set-row ${a.soon ? 'is-soon' : ''}`}>
              <span>
                <strong>
                  {a.title} {a.soon && <span className="badge">Bientôt</span>}
                </strong>
                <span className="muted">{a.help}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={s.automations[a.key]}
                disabled={a.soon}
                onChange={(e) => update({ automations: { [a.key]: e.target.checked } })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="p-section">
        <h2 className="p-section__title">Communications</h2>
        <div className="card set-card">
          <div className="set-row set-row--static">
            <span>
              <strong>Horaires d’envoi</strong>
              <span className="muted">NOVIA n’écrit jamais en dehors de cette plage.</span>
            </span>
          </div>
          <div className="set-window">
            <label>
              De
              <select value={s.sendWindow.start} onChange={(e) => update({ sendWindow: { start: e.target.value } })}>
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {h.replace(':', 'h')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              à
              <select value={s.sendWindow.end} onChange={(e) => update({ sendWindow: { end: e.target.value } })}>
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {h.replace(':', 'h')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="set-row set-row--static">
            <span>
              <strong>Canaux</strong>
              <span className="muted">Par où NOVIA peut écrire (simulé).</span>
            </span>
          </div>
          <div className="ops-chips set-channels">
            {channels.map((c) => (
              <button key={c.key} className={`ops-chip ${s.channels[c.key] ? 'is-active' : ''}`} aria-pressed={s.channels[c.key]} onClick={() => update({ channels: { [c.key]: !s.channels[c.key] } })}>
                {s.channels[c.key] && <Icon name="check" size={13} />} {c.label}
              </button>
            ))}
          </div>
          <Link to="/pro/clientes?segment=human" className="set-row set-row--link">
            <span>
              <strong>Reprise humaine</strong>
              <span className="muted">
                Quand vous reprenez une conversation, NOVIA se tait et met ses relances en pause.{' '}
                {takenOver.length ? `${takenOver.length} cliente${takenOver.length > 1 ? 's' : ''} en reprise.` : 'Aucune en ce moment.'}
              </span>
            </span>
            <Icon name="chevronRight" size={16} />
          </Link>
        </div>
      </section>

      <section className="p-section">
        <h2 className="p-section__title">
          <Icon name="phone" size={18} /> NOVIA Voice
        </h2>
        <VoiceControls />
        <Link to="/pro/voice" className="link-arrow" style={{ marginTop: 6 }}>
          Journal des appels <Icon name="arrowRight" size={16} />
        </Link>
      </section>
    </main>
  )
}
