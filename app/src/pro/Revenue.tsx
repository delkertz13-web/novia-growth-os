import { useState } from 'react'
import { formatEUR, levelLabels, sourceLabels, type RevenueLevel } from '../core/revenue'
import type { AttributionSource } from '../core/types'
import { novia } from '../domain'
import { Notice, useDemoState, useNow } from '../ui/common'

const defs: Record<RevenueLevel, string> = {
  potential: 'Opportunités ouvertes : créneaux à remplir, clientes à récupérer. Ni réservé, ni payé.',
  booked: 'Rendez-vous réservés, ou prestations attestées sans preuve de paiement. Pas encore encaissé.',
  confirmed: 'Prestation attestée ET preuve de paiement (fictive dans la démo).',
}

const shown: AttributionSource[] = ['acquisition', 'cancellation_recovery', 'noshow_recovery', 'reactivation', 'referral', 'smartfill']

export function Revenue() {
  useDemoState()
  const now = useNow()
  const [period, setPeriod] = useState<'month' | 'all'>('month')
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const r = novia.pro.revenueAttribution(period === 'month' ? { from, to } : undefined)
  const levels: RevenueLevel[] = ['potential', 'booked', 'confirmed']
  const cell = (n: number) => <td className={n ? '' : 'zero'}>{n ? formatEUR(n) : '—'}</td>

  return (
    <main className="wrap page">
      <header className="p-head">
        <div>
          <div className="p-head__date">Revenue Attribution</div>
          <h1 className="display">D’où vient le revenu</h1>
        </div>
      </header>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        <div className="seg" role="tablist" aria-label="Période">
          <button className={period === 'month' ? 'is-active' : ''} onClick={() => setPeriod('month')}>
            {now.toLocaleDateString('fr-FR', { month: 'long' })}
          </button>
          <button className={period === 'all' ? 'is-active' : ''} onClick={() => setPeriod('all')}>
            Tout l’historique démo
          </button>
        </div>
        <span className="badge badge--sim">Démonstration — aucune donnée financière réelle</span>
      </div>

      <div className="levels stagger">
        {levels.map((l) => (
          <section key={l} className={`card level level--${l}`}>
            <span className="eyebrow">{levelLabels[l]}</span>
            <span className="level__value">{formatEUR(r.totals[l])}</span>
            <span className="level__def">{defs[l]}</span>
          </section>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '12px 2px 0' }}>
        Les trois niveaux ne s’additionnent pas : une même opportunité peut passer de potentiel à réservé puis à confirmé. Chaque
        rendez-vous n’est compté qu’une fois, avec une seule source.
      </p>

      <section className="card" style={{ padding: 18, marginTop: 18, overflowX: 'auto' }}>
        <table className="src-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Potentiel</th>
              <th>Réservé</th>
              <th>Confirmé</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s}>
                <td>{sourceLabels[s]}</td>
                {cell(r.bySource[s].potential)}
                {cell(r.bySource[s].booked)}
                {cell(r.bySource[s].confirmed)}
              </tr>
            ))}
            <tr>
              <td className="muted">{sourceLabels.direct}</td>
              {cell(r.bySource.direct.potential)}
              {cell(r.bySource.direct.booked)}
              {cell(r.bySource.direct.confirmed)}
            </tr>
          </tbody>
        </table>
      </section>

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {r.awaitingProof > 0 && (
          <Notice>
            {formatEUR(r.awaitingProof)} de prestations attestées restent en « réservé » faute de preuve de paiement. La preuve recevable
            pour le CA confirmé reste à définir avec l’établissement.
          </Notice>
        )}
        <Notice>Une attribution n’est pas une preuve de causalité. Rétention et churn évité ne sont pas comptés en revenu.</Notice>
      </div>
    </main>
  )
}
