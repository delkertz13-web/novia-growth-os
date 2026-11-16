/**
 * Messages types du pilote : brouillon → approuvé → archivé, avec versions.
 * Aucun texte de la démonstration n'est repris : tout part vide. Rien n'est envoyé.
 */
import { useState } from 'react'
import type { TemplateId } from '../../config/profile'
import { fmt } from '../../ui/common'
import { pilotApi, type Onboarding, type TemplateRow } from '../client'
import { ActionMsg, isOwner, Loading, PilotPage, useAction, useLoad } from './kit'

const statusLabel = { DRAFT: 'Brouillon', APPROVED: 'Approuvé', ARCHIVED: 'Archivé' } as const
const statusTag = { DRAFT: 'estimated', APPROVED: 'ok', ARCHIVED: 'off' } as const
const fmtDate = (iso: string) => fmt.date(iso, { dateStyle: 'short', timeStyle: 'short' })

export function Templates() {
  const { data, error, reload } = useLoad(pilotApi.onboarding)
  if (!data) return <PilotPage title="Messages types">{<Loading error={error} />}</PilotPage>
  const keys = Object.keys(data.templateMeta) as TemplateId[]
  return (
    <PilotPage title="Messages types">
      <p className="pl-msg" style={{ marginTop: 12 }}>
        Seule une version approuvée par la propriétaire est utilisée par NOVIA (en shadow : elle décide, rien n’est envoyé). Sans version approuvée, le
        message est bloqué.
      </p>
      <div className="pl-grid" style={{ marginTop: 12 }}>
        {keys.map((k) => (
          <TemplateCard key={k} id={k} data={data} onChanged={reload} />
        ))}
      </div>
    </PilotPage>
  )
}

function TemplateCard({ id, data, onChanged }: { id: TemplateId; data: Onboarding; onChanged: () => void }) {
  const meta = data.templateMeta[id]
  const versions = data.templates.filter((t) => t.key === id)
  const approved = versions.find((t) => t.status === 'APPROVED')
  const [body, setBody] = useState('')
  const a = useAction()
  return (
    <section className="pl-card">
      <div className="pl-row pl-row--between">
        <h3>
          {meta.workflow} · {meta.label}
        </h3>
        <span className={`pl-tag pl-tag--${approved ? 'ok' : 'blocked'}`}>{approved ? `v${approved.version} approuvée` : 'Aucune version approuvée'}</span>
      </div>
      <p className="pl-msg">
        Canal : SMS · Finalité : {meta.purpose === 'transactional' ? 'service (lié au RDV)' : 'marketing'} · Variables : {meta.variables.map((v) => `{${v}}`).join(' ')}
      </p>
      {versions.map((t) => (
        <Version key={t.version} t={t} onChanged={onChanged} />
      ))}
      <label className="pl-label">
        Nouveau brouillon
        <textarea value={body} maxLength={640} placeholder="Texte rédigé avec la professionnelle" onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="pl-row">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={a.busy || !body.trim()}
          onClick={async () => {
            if (await a.run(() => pilotApi.draftTemplate(id, body), 'Brouillon enregistré.')) {
              setBody('')
              onChanged()
            }
          }}
        >
          Enregistrer le brouillon
        </button>
        <span className="pl-msg">{body.length}/640</span>
      </div>
      <ActionMsg msg={a.msg} />
    </section>
  )
}

function Version({ t, onChanged }: { t: TemplateRow; onChanged: () => void }) {
  const a = useAction()
  const op = (o: 'approve' | 'archive') => a.run(() => pilotApi.templateOp(t.key, t.version, o).then(onChanged))
  return (
    <div className="pl-card pl-card--inner">
      <div className="pl-row pl-row--between">
        <strong>Version {t.version}</strong>
        <span className={`pl-tag pl-tag--${statusTag[t.status]}`}>{statusLabel[t.status]}</span>
      </div>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{t.body}</p>
      <p className="pl-msg">
        Rédigé le {fmtDate(t.createdAt)}
        {t.approvedAt ? ` · approuvé le ${fmtDate(t.approvedAt)}` : ''}
      </p>
      {isOwner() && t.status !== 'ARCHIVED' && (
        <div className="pl-row">
          {t.status === 'DRAFT' && (
            <button type="button" className="btn btn--primary btn--sm" disabled={a.busy} onClick={() => op('approve')}>
              Approuver cette version
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" disabled={a.busy} onClick={() => op('archive')}>
            Archiver
          </button>
        </div>
      )}
      <ActionMsg msg={a.msg} />
    </div>
  )
}
