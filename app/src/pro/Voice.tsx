import { useEffect, useState } from 'react'
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

const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const duration = (s: number) => `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`

/** Standard téléphonique NOVIA — entièrement simulé. */
export function Voice() {
  const st = useDemoState()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<CallFilter>('all')
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)
  const callId = params.get('appel')
  const calls = filterCalls(novia.pro.calls(), filter)
  const stats = novia.pro.voiceStats()
  const open = callId ? novia.pro.call(callId) : undefined

  const simulate = () => {
    setError('')
    const r = novia.demo?.previewIncomingCall()
    if (r && !r.ok) return setError(r.error)
    setLive(true)
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
        <button className="btn btn--lacquer btn--block voice-sim" onClick={simulate} disabled={live || !st.voice.active}>
          <Icon name="phone" size={18} /> Simuler un appel entrant
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
      <Sheet open={live} onClose={() => setLive(false)} label="Appel en cours (simulé)">
        {live && (
          <LiveCall
            onBooked={(id) => {
              setLive(false)
              setParams({ appel: id, nouveau: '1' })
            }}
            onError={(e) => {
              setLive(false)
              setError(e)
            }}
          />
        )}
      </Sheet>
    </main>
  )
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Appel en direct (simulé) : la transcription se déroule, puis l'appel aboutit et le RDV est
 * réellement créé dans NOVIA (même domaine, même store que l'agenda et les fiches).
 */
function LiveCall({ onBooked, onError }: { onBooked: (callId: string) => void; onError: (e: string) => void }) {
  const [plan] = useState(() => novia.demo?.previewIncomingCall())
  const [shown, setShown] = useState(() => (reduced() ? 99 : 0))
  const [phase, setPhase] = useState<'talking' | 'booking'>('talking')
  const lines = plan?.ok ? plan.value.transcript : []
  useEffect(() => {
    if (!plan?.ok) return
    if (shown < lines.length) {
      const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 500 : 950)
      return () => clearTimeout(t)
    }
    setPhase('booking')
    const t = setTimeout(() => {
      const r = novia.demo?.simulateIncomingCall()
      if (r?.ok) onBooked(r.value.call.id)
      else onError(r && !r.ok ? r.error : 'Appel impossible')
    }, reduced() ? 0 : 900)
    return () => clearTimeout(t)
  }, [shown, lines.length, plan, onBooked, onError])
  if (!plan?.ok) return null
  const { caller } = plan.value
  return (
    <div className="call" aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="eyebrow call__live">
          <span className="call__live-dot" aria-hidden="true" /> Appel en cours · NOVIA a décroché
        </span>
        <span className="badge badge--sim">Simulé</span>
      </div>
      <h2 className="display call__name">
        {caller.firstName} {caller.lastName}
      </h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {caller.phone} · numéro inconnu de NOVIA
      </p>
      <div className="call__transcript">
        {lines.slice(0, shown).map((l, i) => (
          <div key={i} className={`bubble bubble--${l.from === 'novia' ? 'novia' : 'client'} bubble--in`}>
            {l.from === 'novia' && (
              <span className="bubble__who">
                <Icon name="sparkle" size={11} /> NOVIA
              </span>
            )}
            <span className="bubble__text">{l.text}</span>
          </div>
        ))}
      </div>
      <div className={`call__outcome ${phase === 'booking' ? 'call__outcome--booking' : ''}`}>
        <strong>{phase === 'booking' ? 'NOVIA crée la cliente et le rendez-vous…' : 'NOVIA répond avec vos informations approuvées'}</strong>
        <span>Aucun appel réel : la conversation est simulée.</span>
      </div>
    </div>
  )
}

function CallDetail({ call: c, onClose }: { call: VoiceCall; onClose: () => void }) {
  const [params] = useSearchParams()
  const fresh = params.get('nouveau') === '1'
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
      <div className={`call__outcome call__outcome--${c.outcome} ${fresh ? 'is-fresh' : ''}`}>
        <strong>{callOutcomeLabels[c.outcome]}</strong>
        <span>{c.summary}</span>
        {fresh && appt && <span className="call__fresh">Ajouté à l’agenda, à sa fiche et à Revenue (réservé, pas encore confirmé).</span>}
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
        {appt && (
          <Link to={`/pro/agenda?jour=${dayKey(appt.start)}&rdv=${appt.id}`} className="btn btn--glass btn--sm" onClick={onClose}>
            <Icon name="calendar" size={15} /> Dans l’agenda
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
