/**
 * Réponses approuvées : NOVIA ne répond seule qu'avec une réponse APPROUVÉE dont les
 * mots-clés reconnaissent la question. Sinon : « besoin d'un humain », jamais une réponse
 * inventée. Aucune IA générative.
 */
import { useState } from 'react'
import { pilotApi, type FaqRow } from '../client'
import { ActionMsg, isOwner, Loading, PilotPage, useAction, useLoad } from './kit'

const statusLabel = { DRAFT: 'Brouillon', APPROVED: 'Approuvée', ARCHIVED: 'Archivée' } as const
const statusTag = { DRAFT: 'estimated', APPROVED: 'ok', ARCHIVED: 'off' } as const

export function Faq() {
  const { data, error, reload } = useLoad(pilotApi.onboarding)
  if (!data) return <PilotPage title="Réponses approuvées">{<Loading error={error} />}</PilotPage>
  return (
    <PilotPage title="Réponses approuvées">
      <p className="pl-msg" style={{ marginTop: 12 }}>
        Une question non reconnue, ou dont la réponse n’est pas approuvée, est transmise à la professionnelle (« besoin d’un humain »). NOVIA n’invente
        jamais de réponse.
      </p>
      <div className="pl-grid" style={{ marginTop: 12 }}>
        <FaqEditor onSaved={reload} />
        {data.faq.map((f) => (
          <FaqCard key={f.id} f={f} onChanged={reload} />
        ))}
        {!data.faq.length && <p className="pl-msg">Aucune réponse pour l’instant.</p>}
      </div>
    </PilotPage>
  )
}

function FaqEditor({ f, onSaved, onDone }: { f?: FaqRow; onSaved: () => void; onDone?: () => void }) {
  const [intent, setIntent] = useState(f?.intent ?? '')
  const [keywords, setKeywords] = useState(f?.keywords.join(', ') ?? '')
  const [answer, setAnswer] = useState(f?.answer ?? '')
  const a = useAction()
  const list = keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  return (
    <section className="pl-card">
      <h3>{f ? 'Modifier le brouillon' : 'Nouvelle réponse (brouillon)'}</h3>
      <label className="pl-label">
        Question / intention
        <input type="text" value={intent} maxLength={120} placeholder="ex. Parking à proximité" onChange={(e) => setIntent(e.target.value)} />
      </label>
      <label className="pl-label">
        Mots-clés (séparés par des virgules)
        <input type="text" value={keywords} placeholder="ex. parking, garer, stationnement" onChange={(e) => setKeywords(e.target.value)} />
      </label>
      <label className="pl-label">
        Réponse validée par la professionnelle
        <textarea value={answer} maxLength={640} onChange={(e) => setAnswer(e.target.value)} />
      </label>
      <div className="pl-row">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={a.busy || !intent.trim() || !answer.trim() || !list.length}
          onClick={async () => {
            if (await a.run(() => pilotApi.saveFaq({ id: f?.id, intent, keywords: list, answer }), 'Brouillon enregistré.')) {
              if (!f) {
                setIntent('')
                setKeywords('')
                setAnswer('')
              }
              onSaved()
              onDone?.()
            }
          }}
        >
          Enregistrer le brouillon
        </button>
        {onDone && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>
            Annuler
          </button>
        )}
      </div>
      <ActionMsg msg={a.msg} />
    </section>
  )
}

function FaqCard({ f, onChanged }: { f: FaqRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const a = useAction()
  if (editing) return <FaqEditor f={f} onSaved={onChanged} onDone={() => setEditing(false)} />
  return (
    <section className="pl-card">
      <div className="pl-row pl-row--between">
        <h3>{f.intent}</h3>
        <span className={`pl-tag pl-tag--${statusTag[f.status]}`}>{statusLabel[f.status]}</span>
      </div>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{f.answer}</p>
      <p className="pl-msg">Mots-clés : {f.keywords.join(', ')}</p>
      <div className="pl-row">
        {f.status === 'DRAFT' && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
            Modifier
          </button>
        )}
        {isOwner() && f.status === 'DRAFT' && (
          <button type="button" className="btn btn--primary btn--sm" disabled={a.busy} onClick={() => a.run(() => pilotApi.faqOp(f.id, 'approve').then(onChanged))}>
            Approuver
          </button>
        )}
        {isOwner() && f.status !== 'ARCHIVED' && (
          <button type="button" className="btn btn--ghost btn--sm" disabled={a.busy} onClick={() => a.run(() => pilotApi.faqOp(f.id, 'archive').then(onChanged))}>
            Archiver
          </button>
        )}
      </div>
      <ActionMsg msg={a.msg} />
    </section>
  )
}
