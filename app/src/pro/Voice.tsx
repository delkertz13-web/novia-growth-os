import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { callOutcomeLabels, filterCalls, novia, voiceModeLabels, type CallFilter, type VoiceCall, type VoiceMode } from '../domain'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, sameDay, Sheet, useDemoState, useNow } from '../ui/common'
import { StatTile } from './parts'

const filters: { id: CallFilter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'missed', label: 'Manqués' },
  { id: 'after_hours', label: 'Hors horaires' },
]

const duration = (s: number) => `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`

/** Standard téléphonique NOVIA — entièrement simulé. */
export function Voice() {
  const st = useDemoState()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<CallFilter>('all')
  const [error, setError] = useState('')
  const [ringing, setRinging] = useState(false)
  const callId = params.get('appel')
  const calls = filterCalls(novia.pro.calls(), filter)
  const stats = novia.pro.voiceStats()
  const open = callId ? novia.pro.call(callId) : undefined

  const simulate = () => {
    setError('')
    setRinging(true)
    // le délai rend la scène lisible ; rien n'est appelé
    setTimeout(() => {
      setRinging(false)
      const r = novia.demo?.simulateIncomingCall()
      if (!r) return
      if (r.ok) setParams({ appel: r.value.call.id })
      else setError(r.error)
    }, 1200)
  }

  return (
    <main className="wrap page ops">
      <header className="p-head">
        <Link to="/pro/novia" className="icon-btn" aria-label="Retour à NOVIA">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <div>
          <div className="p-head__date">NOVIA Voice</div>
          <h1 className="display">Le téléphone</h1>
        </div>
      </header>
      <div className="sim-strip" role="note">
        <strong>SIMULATION</strong> — aucun appel réel n’est passé ni reçu.
      </div>

      <div className="stats">
        <StatTile label="Appels reçus" value={stats.received} />
        <StatTile label="Pris par NOVIA" value={stats.takenByNovia} />
        <StatTile label="RDV créés" value={stats.booked} variant="dark" />
        <StatTile label="Transferts vers vous" value={stats.transferred} />
      </div>

      <VoiceControls />

      {novia.demo && (
        <button className={`btn btn--lacquer btn--block voice-sim ${ringing ? 'is-ringing' : ''}`} onClick={simulate} disabled={ringing || !st.voice.active}>
          <Icon name="phone" size={18} /> {ringing ? 'Appel entrant… NOVIA décroche' : 'Simuler un appel entrant'}
        </button>
      )}
      {!st.voice.active && <p className="ops-hint">NOVIA Voice est en pause : les appels sonnent normalement chez vous.</p>}
      {error && <p className="ops-hint ops-hint--alert">{error}</p>}

      <section className="p-section">
        <div className="p-section__head">
          <h2 className="p-section__title">Journal des appels</h2>
        </div>
        <div className="seg seg--wide" role="radiogroup" aria-label="Filtrer les appels">
          {filters.map((f) => (
            <button key={f.id} role="radio" aria-checked={filter === f.id} className={filter === f.id ? 'is-active' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="ops-list" style={{ marginTop: 12 }}>
          {calls.map((c) => (
            <button key={c.id} className="ops-row" onClick={() => setParams({ appel: c.id })}>
              <span className={`ops-avatar ops-avatar--call ${c.outcome === 'booked' ? 'is-booked' : ''}`} aria-hidden="true">
                <Icon name="phone" size={16} />
              </span>
              <span className="ops-row__main">
                <span className="ops-row__title">
                  {c.callerName}
                  <span className="ops-row__channel">{c.handledBy === 'novia' ? 'NOVIA' : 'Vous'}</span>
                </span>
                <span className="ops-row__sub">{c.summary}</span>
                <span className={`ops-state ops-state--call-${c.outcome}`}>{callOutcomeLabels[c.outcome]}</span>
              </span>
              <span className="ops-row__at">{sameDay(new Date(c.at), now) ? fmt.time(c.at) : capitalize(fmt.dayShort(c.at))}</span>
            </button>
          ))}
          {calls.length === 0 && <div className="ops-empty">Aucun appel dans ce mode.</div>}
        </div>
      </section>

      <Sheet open={!!open} onClose={() => setParams({}, { replace: true })} label="Détail de l’appel">
        {open && <CallDetail call={open} onClose={() => setParams({}, { replace: true })} />}
      </Sheet>
    </main>
  )
}

function CallDetail({ call: c, onClose }: { call: VoiceCall; onClose: () => void }) {
  const appt = c.appointmentId ? novia.pro.appointment(c.appointmentId) : undefined
  return (
    <div className="call">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="eyebrow">
          Appel · {capitalize(fmt.dayShort(c.at))} · {fmt.time(c.at)}
        </span>
        <span className="badge badge--sim">Simulé</span>
      </div>
      <h2 className="display call__name">{c.callerName}</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {c.phone} · {duration(c.durationSec)} · {c.handledBy === 'novia' ? `NOVIA (${voiceModeLabels[c.trigger === 'all' ? 'all' : c.trigger].title.toLowerCase()})` : 'pris par vous'}
      </p>
      <div className={`call__outcome call__outcome--${c.outcome}`}>
        <strong>{callOutcomeLabels[c.outcome]}</strong>
        <span>{c.summary}</span>
      </div>
      {c.transcript.length > 0 ? (
        <div className="call__transcript" aria-label="Transcription">
          {c.transcript.map((l, i) => (
            <div key={i} className={`bubble bubble--${l.from === 'novia' ? 'novia' : 'client'}`}>
              {l.from === 'novia' && (
                <span className="bubble__who">
                  <Icon name="sparkle" size={11} /> NOVIA
                </span>
              )}
              <span className="bubble__text">{l.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="ops-hint">Appel pris par vous : pas de transcription.</p>
      )}
      <div className="call__links">
        {appt && (
          <Link to={`/pro/rdv/${appt.id}`} className="btn btn--primary btn--sm" onClick={onClose}>
            <Icon name="calendar" size={15} /> Voir le RDV · {capitalize(fmt.dayShort(appt.start))} {fmt.time(appt.start)}
          </Link>
        )}
        {c.customerId && (
          <Link to={`/pro/clientes/${c.customerId}`} className="btn btn--glass btn--sm" onClick={onClose}>
            <Icon name="user" size={15} /> Fiche cliente
          </Link>
        )}
      </div>
    </div>
  )
}

const modes: VoiceMode[] = ['missed', 'after_hours', 'all']

/** Activer NOVIA Voice et choisir quand elle décroche (intention métier, aucun appel réel). */
export function VoiceControls() {
  const v = useDemoState().voice
  return (
    <article className="card voice">
      <label className="voice__switch">
        <span>
          <strong>{v.active ? 'NOVIA répond au téléphone' : 'NOVIA Voice est en pause'}</strong>
          <span className="muted">{v.active ? voiceModeLabels[v.mode].help : 'Les appels sonnent normalement.'}</span>
        </span>
        <input type="checkbox" role="switch" checked={v.active} onChange={(e) => novia.pro.configureVoice({ active: e.target.checked })} />
      </label>
      <div className="seg" role="radiogroup" aria-label="Quand NOVIA répond" aria-disabled={!v.active || undefined}>
        {modes.map((m) => (
          <button key={m} role="radio" aria-checked={v.mode === m} className={v.mode === m ? 'is-active' : ''} disabled={!v.active} onClick={() => novia.pro.configureVoice({ mode: m })}>
            {voiceModeLabels[m].short}
          </button>
        ))}
      </div>
    </article>
  )
}
