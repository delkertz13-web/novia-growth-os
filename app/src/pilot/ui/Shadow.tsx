/**
 * Shadow Control Center : ce que NOVIA aurait fait, raconté en français, avec les
 * vérifications et l'avis de la professionnelle. Les avis servent à apprendre : ils ne
 * modifient AUCUNE règle. Les métriques ne sont jamais présentées comme un revenu gagné.
 */
import { useState } from 'react'
import { novia } from '../../domain'
import { fmt, salon, useDemoState } from '../../ui/common'
import { pilotApi, type DecisionQuery, type ShadowDecisionRow, type Verdict } from '../client'
import { narrate, verdictText } from '../narrative'
import { pilotSession } from '../session'
import { ActionMsg, Loading, PilotPage, useAction, useLoad } from './kit'

const WORKFLOWS = [
  ['W02', 'Messages de RDV'],
  ['W03', 'Relance annulation'],
  ['W04', 'Relance absence'],
  ['SmartFill', 'SmartFill'],
  ['FAQ', 'Réponses'],
] as const

export function Shadow() {
  const st = useDemoState()
  const [q, setQ] = useState<DecisionQuery>({})
  const [reason, setReason] = useState('')
  const metrics = useLoad(pilotApi.metrics)
  const list = useLoad(() => pilotApi.decisions({}))
  const [rows, setRows] = useState<ShadowDecisionRow[] | null>(null)
  const a = useAction()
  const shown = (rows ?? list.data?.decisions ?? []).filter((d) => !reason || d.reason.toLowerCase().includes(reason.toLowerCase()))
  const nameOf = (id: string | null) => {
    const c = id ? st.customers.find((x) => x.id === id) : undefined
    return c ? `${c.firstName} ${c.lastName.charAt(0)}.`.trim() : undefined
  }
  const apply = (next: DecisionQuery) => {
    setQ(next)
    void a.run(async () => setRows((await pilotApi.decisions(next)).decisions), 'Filtre appliqué.')
  }
  const day = (v: string, end = false) => {
    if (!v) return undefined
    const d = salon.parseLocal(v)
    return d ? (end ? salon.addDays(d, 1) : d).toISOString() : undefined
  }
  const m = metrics.data

  return (
    <PilotPage title="Shadow Control Center">
      <p className="pl-msg" style={{ marginTop: 12 }}>
        Mode shadow : NOVIA observe et décide, mais n’envoie aucun message, n’appelle personne et n’encaisse rien. Ces chiffres ne sont pas des revenus.
      </p>

      <section className="pl-card" style={{ marginTop: 12 }}>
        <h3>Métriques du pilote</h3>
        {!m ? (
          <Loading error={metrics.error} />
        ) : (
          <>
            <div className="pl-fields">
              <div className="pl-stat">
                <strong>{m.decisions}</strong>
                <span>décisions observées</span>
              </div>
              <div className="pl-stat">
                <strong>{m.wouldExecute}</strong>
                <span>auraient été exécutées</span>
              </div>
              <div className="pl-stat">
                <strong>{m.blocked}</strong>
                <span>bloquées</span>
              </div>
              <div className="pl-stat">
                <strong>
                  {m.feedback.AGREE}/{m.feedback.DISAGREE}/{m.feedback.UNSURE}
                </strong>
                <span>avis : d’accord / pas d’accord / ne sait pas</span>
              </div>
            </div>
            {m.byWorkflow.length > 0 && (
              <div className="pl-scroll">
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>Workflow observé</th>
                      <th>Résultat</th>
                      <th>Nombre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.byWorkflow.map((r) => (
                      <tr key={`${r.workflow}-${r.result}`}>
                        <td>{r.workflow}</td>
                        <td>{r.result === 'BLOCKED' ? 'Bloqué' : 'Aurait été exécuté'}</td>
                        <td>{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {m.blockReasons.length > 0 && (
              <>
                <h3>Raisons de blocage les plus fréquentes</h3>
                <ul className="pl-list">
                  {m.blockReasons.map((r) => (
                    <li key={r.reason}>
                      <strong>{r.n}</strong> {r.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="pl-msg">Revenu : aucun montant « gagné » n’est affiché en shadow. Tout montant éventuel reste potentiel ou simulé, jamais confirmé.</p>
          </>
        )}
      </section>

      <section className="pl-card pl-noprint" style={{ marginTop: 12 }}>
        <h3>Filtres</h3>
        <div className="pl-fields">
          <label className="pl-label">
            Cliente
            <select value={q.customer ?? ''} onChange={(e) => apply({ ...q, customer: e.target.value || undefined })}>
              <option value="">Toutes</option>
              {st.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </label>
          <label className="pl-label">
            Workflow
            <select value={q.workflow ?? ''} onChange={(e) => apply({ ...q, workflow: e.target.value || undefined })}>
              <option value="">Tous</option>
              {WORKFLOWS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="pl-label">
            Résultat
            <select value={q.result ?? ''} onChange={(e) => apply({ ...q, result: (e.target.value || undefined) as DecisionQuery['result'] })}>
              <option value="">Tous</option>
              <option value="WOULD_EXECUTE">Aurait été exécuté</option>
              <option value="BLOCKED">Bloqué</option>
            </select>
          </label>
          <label className="pl-label">
            Du
            <input type="date" onChange={(e) => apply({ ...q, from: day(e.target.value) })} />
          </label>
          <label className="pl-label">
            Au
            <input type="date" onChange={(e) => apply({ ...q, to: day(e.target.value, true) })} />
          </label>
          <label className="pl-label">
            Raison contient
            <input type="search" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        {a.msg && !a.msg.ok && <ActionMsg msg={a.msg} />}
      </section>

      <div className="pl-grid" style={{ marginTop: 12 }}>
        {!list.data && <Loading error={list.error} />}
        {list.data && !shown.length && <p className="pl-msg">Aucune décision pour l’instant. Saisissez des RDV et leurs statuts : NOVIA dira ce qu’elle aurait fait.</p>}
        {shown.map((d) => (
          <Decision key={d.id} d={d} customer={nameOf(d.customer_id)} />
        ))}
      </div>
      {novia.execution !== 'shadow' && <p className="pl-msg pl-msg--error">Attention : ce compte n’est pas en mode shadow.</p>}
    </PilotPage>
  )
}

function Decision({ d, customer }: { d: ShadowDecisionRow; customer?: string }) {
  const n = narrate(d, { time: `${fmt.dayShort(d.at)} ${fmt.time(d.at)}`, customer })
  const me = pilotSession()?.user.id
  const mine = d.feedback.find((f) => f.userId === me)
  const [verdict, setVerdict] = useState<Verdict | undefined>(mine?.verdict)
  const [comment, setComment] = useState(mine?.comment ?? '')
  const [open, setOpen] = useState(false)
  const a = useAction()
  return (
    <section className="pl-card">
      <div className="pl-row pl-row--between">
        <strong>{n.headline}</strong>
        <span className={`pl-tag pl-tag--${n.blocked ? 'blocked' : 'ok'}`}>{n.blocked ? 'Bloqué' : 'Aurait été exécuté'}</span>
      </div>
      <p className="pl-msg">{n.workflow}</p>
      <p style={{ margin: 0 }}>{n.wouldDo}</p>
      {n.checks.length > 0 && (
        <div className="pl-checks" aria-label="Vérifications">
          {n.checks.map((c) => (
            <span key={c.label} className={c.ok ? '' : 'is-ko'}>
              {c.ok ? '✓' : '✗'} {c.label}
            </span>
          ))}
        </div>
      )}
      <p style={{ margin: 0 }}>
        <strong>{n.blocked ? 'Résultat : bloqué. ' : 'Résultat : '}</strong>
        {n.blocked ? d.reason : n.outcome}
      </p>
      <button type="button" className="btn btn--ghost btn--sm pl-noprint" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Masquer le détail' : 'Détail technique'}
      </button>
      {open && (
        <pre className="pl-msg" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
          {JSON.stringify({ id: d.id, déclencheur: d.input_type, workflow: d.workflow, action: d.action, garde_fous: d.guards }, null, 2)}
        </pre>
      )}
      <div className="pl-row pl-noprint" role="group" aria-label="Votre avis">
        {(Object.keys(verdictText) as Verdict[]).map((v) => (
          <button key={v} type="button" className={`chip chip--sm ${verdict === v ? 'is-active' : ''}`} aria-pressed={verdict === v} onClick={() => setVerdict(v)}>
            {verdictText[v]}
          </button>
        ))}
      </div>
      {verdict && (
        <div className="pl-grid pl-noprint">
          <input type="text" aria-label="Commentaire" placeholder="Commentaire (facultatif)" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          <button type="button" className="btn btn--primary btn--sm" disabled={a.busy} onClick={() => a.run(() => pilotApi.feedback(d.id, verdict, comment), 'Avis enregistré. Il ne change aucune règle.')}>
            Enregistrer mon avis
          </button>
        </div>
      )}
      {d.feedback.length > 0 && (
        <p className="pl-msg">
          Avis : {d.feedback.map((f) => verdictText[f.verdict] + (f.comment ? ` (« ${f.comment} »)` : '')).join(' · ')}
        </p>
      )}
      <ActionMsg msg={a.msg} />
    </section>
  )
}
