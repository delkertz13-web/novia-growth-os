import { Link, useSearchParams } from 'react-router-dom'
import { serviceById } from '../config/services.demo'
import { filterCustomers, novia, segmentCounts, segmentHelp, segmentLabels, type CustomerRow, type Segment } from '../domain'
import { Icon } from '../ui/Icon'
import { fmt, useDemoState, useNow } from '../ui/common'

const segmentOrder: Segment[] = ['active', 'to_follow_up', 'refill', 'new_lead', 'recent_no_show', 'human']
/** pastille affichée sur la ligne : la plus utile d'abord */
const tagPriority: Segment[] = ['human', 'recent_no_show', 'to_follow_up', 'refill', 'new_lead']
const tagShort: Record<Segment, string> = { active: 'Active', to_follow_up: 'À relancer', refill: 'Remplissage', new_lead: 'Nouveau', recent_no_show: 'Absence', human: 'Reprise' }

/** Trouver une cliente en deux secondes, ou voir qui demande de l'attention. */
export function Customers() {
  useDemoState()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const seg = (params.get('segment') as Segment | null) ?? null
  const rows = novia.pro.customers(now)
  const counts = segmentCounts(rows)
  const list = filterCustomers(rows, { query: q, segment: seg })

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true })
  }

  return (
    <main className="wrap page ops">
      <header className="p-head">
        <div>
          <div className="p-head__date">Clientes</div>
          <h1 className="display">{rows.length} clientes</h1>
        </div>
      </header>

      <label className="ops-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          inputMode="search"
          placeholder="Nom, téléphone ou e-mail"
          value={q}
          onChange={(e) => set({ q: e.target.value || null })}
          aria-label="Rechercher une cliente"
        />
      </label>

      <div className="ops-chips" role="group" aria-label="Segments">
        <button className={`ops-chip ${!seg ? 'is-active' : ''}`} aria-pressed={!seg} onClick={() => set({ segment: null })}>
          Toutes
        </button>
        {segmentOrder.map((s) => (
          <button key={s} className={`ops-chip ${seg === s ? 'is-active' : ''}`} aria-pressed={seg === s} onClick={() => set({ segment: seg === s ? null : s })}>
            {segmentLabels[s]} <span className="ops-chip__n">{counts[s]}</span>
          </button>
        ))}
      </div>
      {seg && <p className="ops-hint">{segmentHelp[seg]}</p>}

      <div className="ops-list">
        {list.map((r) => (
          <CustomerLine key={r.customer.id} row={r} />
        ))}
        {list.length === 0 && <div className="ops-empty">Aucune cliente ne correspond{q ? ` à « ${q} »` : ''}.</div>}
      </div>
    </main>
  )
}

function CustomerLine({ row: { customer: c, segments, next, last } }: { row: CustomerRow }) {
  const mine = novia.snapshot().appointments.filter((a) => a.customerId === c.id).sort((a, b) => b.start.localeCompare(a.start))
  const pending = mine.find((a) => a.status === 'booked' || a.status === 'confirmed')
  const latest = mine.find((a) => a.status === 'no_show' || a.status === 'cancelled')
  const tag = tagPriority.find((s) => segments.includes(s))
  const line = next
    ? `Prochain RDV ${fmt.dayShort(next.start)} · ${fmt.time(next.start)}`
    : pending
      ? `RDV ${fmt.dayShort(pending.start)} · ${fmt.time(pending.start)} · présence à confirmer`
      : last
        ? `Dernière visite ${fmt.dayShort(last.start)} · ${serviceById(last.serviceId)?.name ?? ''}`
        : latest
          ? `${latest.status === 'no_show' ? 'Absente' : 'Annulé'} le ${fmt.dayShort(latest.start)}`
          : 'Aucun rendez-vous'
  return (
    <Link to={`/pro/clientes/${c.id}`} className="ops-row">
      <span className="ops-avatar" aria-hidden="true">
        {c.firstName.charAt(0)}
        {c.lastName.charAt(0)}
      </span>
      <span className="ops-row__main">
        <span className="ops-row__title">
          {c.firstName} {c.lastName}
        </span>
        <span className="ops-row__sub">{line}</span>
      </span>
      {tag ? <span className={`ops-tag ops-tag--${tag}`}>{tagShort[tag]}</span> : <span />}
      <Icon name="chevronRight" size={16} className="ops-row__chev" />
    </Link>
  )
}
