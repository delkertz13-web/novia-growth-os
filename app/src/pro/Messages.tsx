import { useEffect, useRef, useState } from 'react'
import { business } from '../config/business.demo'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { approvedAnswersList, channelLabels, conversationStateLabels, novia, type ConversationState, type InboxItem } from '../domain'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, sameDay, useDemoState, useNow } from '../ui/common'

type Filter = 'all' | ConversationState
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'needs_human', label: 'À traiter' },
  { id: 'human', label: 'Reprises' },
  { id: 'novia', label: 'NOVIA gère' },
]

const when = (iso: string, now: Date) => (sameDay(new Date(iso), now) ? fmt.time(iso) : capitalize(fmt.dayShort(iso)))

/** Collaboration NOVIA ↔ Léa : ce qui attend une réponse humaine d'abord. */
export function Messages() {
  useDemoState()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('filtre') as Filter | null) ?? 'all'
  const inbox = novia.pro.inbox()
  const list = filter === 'all' ? inbox : inbox.filter((i) => i.state === filter)
  const count = (f: Filter) => (f === 'all' ? inbox.length : inbox.filter((i) => i.state === f).length)
  const [faq, setFaq] = useState(false)

  return (
    <main className="wrap page ops">
      <header className="p-head">
        <div>
          <div className="p-head__date">Messages</div>
          <h1 className="display">Conversations</h1>
        </div>
      </header>
      <p className="ops-hint" style={{ marginTop: 0 }}>
        NOVIA répond seule avec vos réponses approuvées. Pour une question inconnue ou un sujet sensible, elle s’arrête et vous prévient.
      </p>

      <div className="ops-chips" role="group" aria-label="Filtrer">
        {filters.map((f) => (
          <button
            key={f.id}
            className={`ops-chip ${filter === f.id ? 'is-active' : ''} ${f.id === 'needs_human' && count(f.id) ? 'is-alert' : ''}`}
            aria-pressed={filter === f.id}
            onClick={() => setParams(f.id === 'all' ? {} : { filtre: f.id }, { replace: true })}
          >
            {f.label} <span className="ops-chip__n">{count(f.id)}</span>
          </button>
        ))}
      </div>

      <div className="ops-list">
        {list.map((i) => (
          <InboxLine key={i.conversation.id} item={i} now={now} />
        ))}
        {list.length === 0 && <div className="ops-empty">Rien ici pour l’instant.</div>}
      </div>

      <section className="p-section">
        <button className="cf__toggle" aria-expanded={faq} onClick={() => setFaq((v) => !v)}>
          <span className="p-section__title">Réponses approuvées ({approvedAnswersList().length})</span>
          <Icon name="chevronRight" size={18} className={faq ? 'is-open' : ''} />
        </button>
        {faq && (
          <div className="ops-faq">
            {approvedAnswersList().map((a) => (
              <div key={a.id} className="ops-faq__item">
                <strong>{a.topic}</strong>
                <span>{a.answer}</span>
              </div>
            ))}
            <p className="ops-hint">Exemples de démonstration. En production, chaque réponse est écrite ou validée par vous avant que NOVIA l’utilise.</p>
          </div>
        )}
      </section>
    </main>
  )
}

function InboxLine({ item: { conversation: c, customer, state, last }, now }: { item: InboxItem; now: Date }) {
  return (
    <Link to={`/pro/messages/${c.id}`} className={`ops-row ${c.unread ? 'is-unread' : ''}`}>
      <span className="ops-avatar" aria-hidden="true">
        {customer?.firstName.charAt(0)}
        {customer?.lastName.charAt(0)}
      </span>
      <span className="ops-row__main">
        <span className="ops-row__title">
          {customer?.firstName} {customer?.lastName}
          <span className="ops-row__channel">{channelLabels[c.channel]}</span>
        </span>
        <span className="ops-row__sub">
          {last ? `${last.from === 'novia' ? 'NOVIA : ' : last.from === 'pro' ? 'Vous : ' : ''}${last.body}` : 'Aucun message'}
        </span>
        <span className={`ops-state ops-state--${state}`}>{conversationStateLabels[state]}</span>
      </span>
      <span className="ops-row__at">{last ? when(last.at, now) : ''}</span>
    </Link>
  )
}

const samples = [
  { label: 'Prix d’un remplissage', text: 'Bonjour, c’est combien un remplissage ?' },
  { label: 'Combien de temps', text: 'Ça dure combien de temps une pose complète ?' },
  { label: 'Réaction après la pose', text: 'J’ai une irritation autour de l’ongle depuis hier, c’est normal ?' },
  { label: 'Question inconnue', text: 'Est-ce que vous faites des cartes cadeaux ?' },
]

/** Une conversation : qui gère, et les gestes pour reprendre ou rendre la main. */
export function Conversation() {
  const { id = '' } = useParams()
  useDemoState()
  const now = useNow()
  const item = novia.pro.conversation(id)
  const [draft, setDraft] = useState('')
  const [toast, setToast] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const unread = item?.conversation.unread
  const count = item?.conversation.messages.length

  useEffect(() => {
    if (unread && id) novia.pro.markRead(id)
  }, [id, unread])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [count])

  if (!item || !item.customer) {
    return (
      <main className="wrap page" style={{ paddingTop: 30 }}>
        <p>Conversation introuvable (la démo a peut-être été réinitialisée).</p>
        <Link to="/pro/messages" className="btn btn--primary">
          Retour aux messages
        </Link>
      </main>
    )
  }
  const { conversation: c, customer, state } = item
  const flash = (t: string) => {
    setToast(t)
    setTimeout(() => setToast(''), 2600)
  }
  const pausedCount = () => novia.snapshot().runs.filter((r) => r.customerId === customer.id && r.state === 'paused').length
  const takeOver = () => {
    novia.pro.takeOverConversation(customer.id)
    const n = pausedCount()
    flash(n ? `Vous avez la main. ${n} automatisation${n > 1 ? 's' : ''} en pause.` : 'Vous avez la main. NOVIA ne répond plus.')
  }
  const handBack = () => {
    novia.pro.letNoviaHandle(customer.id)
    flash('NOVIA reprend, avec revérification avant tout envoi.')
  }
  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const r = novia.pro.replyAsPro(c.id, draft)
    if (r.ok) setDraft('')
  }
  const simulate = (text: string) => {
    const r = novia.demo?.simulateClientMessage(c.id, text)
    if (r?.ok && r.value.kind === 'faq') flash('NOVIA a répondu avec une réponse approuvée.')
    else if (r?.ok && r.value.kind !== 'human') flash('NOVIA vous passe la main.')
  }

  return (
    <main className="wrap page conv">
      <div className="conv__top">
        <Link to="/pro/messages" className="icon-btn" aria-label="Retour aux messages">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <Link to={`/pro/clientes/${customer.id}`} className="conv__who">
          <strong>
            {customer.firstName} {customer.lastName}
          </strong>
          <span>
            {channelLabels[c.channel]} · voir la fiche <Icon name="chevronRight" size={12} />
          </span>
        </Link>
      </div>

      <section className={`conv-state conv-state--${state}`} aria-live="polite">
        <div className="conv-state__text">
          <strong>{state === 'needs_human' ? `Intervention de ${business.artistFirstName.value} nécessaire` : conversationStateLabels[state]}</strong>
          <span>
            {state === 'needs_human'
              ? c.needsHumanReason
              : state === 'human'
                ? 'NOVIA ne répond plus et ses automatisations pour cette cliente sont en pause.'
                : 'NOVIA répond avec vos réponses approuvées.'}
          </span>
        </div>
        {state === 'human' ? (
          <button className="btn btn--primary btn--sm" onClick={handBack}>
            <Icon name="sparkle" size={15} /> Rendre à NOVIA
          </button>
        ) : (
          <button className={`btn btn--sm ${state === 'needs_human' ? 'btn--light' : 'btn--glass'}`} onClick={takeOver}>
            <Icon name="hand" size={15} /> Reprendre la conversation
          </button>
        )}
      </section>

      <div className="conv__msgs">
        {c.messages.map((m) => (
          <div key={m.id} className={`bubble bubble--${m.from}`}>
            {m.from !== 'client' && (
              <span className="bubble__who">
                {m.from === 'novia' ? (
                  <>
                    <Icon name="sparkle" size={11} /> NOVIA{m.faqId && ` · réponse approuvée`}
                  </>
                ) : (
                  'Vous'
                )}
              </span>
            )}
            <span className="bubble__text">{m.body}</span>
            <span className="bubble__at">{when(m.at, now)}</span>
          </div>
        ))}
        {state === 'needs_human' && <div className="conv__waiting">NOVIA attend votre réponse : elle n’a rien envoyé.</div>}
        <div ref={end} />
      </div>

      {novia.demo && (
        <details className="conv-sim">
          <summary>
            <Icon name="play" size={13} /> Simuler un message de {customer.firstName}
          </summary>
          <div className="conv-sim__chips">
            {samples.map((s) => (
              <button key={s.label} className="ops-chip" onClick={() => simulate(s.text)}>
                {s.label}
              </button>
            ))}
          </div>
        </details>
      )}

      <form className="conv__composer" onSubmit={send}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={state === 'human' ? 'Votre réponse (simulée)' : 'Répondre vous-même'} aria-label="Votre réponse" />
        <button className="btn btn--primary btn--sm" disabled={!draft.trim()} aria-label="Envoyer (simulé)">
          <Icon name="send" size={16} />
        </button>
      </form>
      <p className="conv__note">Démo : aucun SMS ni message Instagram n’est réellement envoyé.</p>
      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}
