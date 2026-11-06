import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatEUR } from '../core/revenue'
import type { Reaction, ReactionTone } from '../domain'
import { Icon, type IconName } from '../ui/Icon'
import { Counter } from '../ui/motion/Counter'
import { useReducedMotion } from '../ui/motion'

const toneIcon: Record<ReactionTone, IconName> = {
  status: 'check',
  novia: 'sparkle',
  slot: 'bolt',
  money: 'chart',
  calm: 'check',
}

/** Délai entre deux étapes : assez lent pour être vu, assez court pour ne jamais faire attendre. */
export const STEP_MS = 520

/**
 * Les étapes de la réaction NOVIA s'allument une à une ; le montant défile quand son
 * étape arrive. En mouvement réduit, tout est affiché d'un coup.
 */
export function ReactionSteps({ reaction, onPlayed }: { reaction: Reaction; onPlayed?: () => void }) {
  const reduce = useReducedMotion()
  const n = reaction.steps.length
  const [shown, setShown] = useState(reduce ? n : 0)

  useEffect(() => {
    if (reduce) {
      setShown(n)
      onPlayed?.()
      return
    }
    let i = 0
    let t = window.setTimeout(function tick() {
      i++
      setShown(i)
      if (i < n) t = window.setTimeout(tick, STEP_MS)
      else onPlayed?.()
    }, 140)
    return () => window.clearTimeout(t)
  }, [reaction, reduce, n])

  return (
    <ol className="rx" aria-live="polite">
      {reaction.steps.map((s, i) => {
        const on = i < shown
        return (
          <li key={s.key} className={`rx__step rx--${s.tone} ${on ? 'is-on' : ''}`} aria-hidden={!on || undefined}>
            <span className="rx__dot">
              <Icon name={toneIcon[s.tone]} size={13} stroke={2.2} />
            </span>
            <div className="rx__body">
              <span className="rx__label">{s.label}</span>
              {s.amount != null && (
                <span className="rx__amount">
                  {on ? <Counter value={s.amount} format={formatEUR} fromZero /> : formatEUR(0)}
                  <small>{s.amountLabel}</small>
                </span>
              )}
              {s.detail && <span className="rx__detail">{s.detail}</span>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Suites possibles après une réaction : chacune mène à une intention ou une consultation. */
export function ReactionLinks({ reaction, onNavigate }: { reaction: Reaction; onNavigate?: () => void }) {
  return (
    <div className="rx-links">
      {reaction.smartfillId && (
        <Link className="btn btn--lacquer btn--sm" to={`/pro/novia?smartfill=${reaction.smartfillId}`} onClick={onNavigate}>
          <Icon name="bolt" size={15} /> Remplir ce créneau
        </Link>
      )}
      {reaction.runId && (
        <Link className="btn btn--glass btn--sm" to={`/pro/rdv/${reaction.appointmentId}`} onClick={onNavigate}>
          Suivre la récupération <Icon name="arrowRight" size={15} />
        </Link>
      )}
      {reaction.outcome === 'rescheduled' && (
        <Link className="btn btn--glass btn--sm" to={`/pro/rdv/${reaction.resultAppointmentId}`} onClick={onNavigate}>
          Voir le nouveau RDV <Icon name="arrowRight" size={15} />
        </Link>
      )}
    </div>
  )
}
