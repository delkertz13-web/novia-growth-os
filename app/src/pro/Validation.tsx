import { useCallback, useState } from 'react'
import type { Appointment, ValidationOutcome } from '../core/types'
import { customerName, novia, type Reaction } from '../domain'
import { Sheet, SimBadge, useDemoState } from '../ui/common'
import { ReschedulePicker } from './parts'
import { ReactionLinks, ReactionSteps } from './Reaction'

/**
 * Statut réel d'un rendez-vous (Présente / Absente / Annulée / Reportée), déclaré par
 * la professionnelle via les intentions du domaine NOVIA. Le report passe d'abord par
 * le choix d'un nouveau créneau.
 *
 * `onReaction` permet à l'appelant d'afficher la réaction sur place (tableau de bord) ;
 * sans lui, la réaction s'affiche dans une feuille (fiche rendez-vous).
 */
export function useValidation(onReaction?: (r: Reaction, before: Appointment) => void) {
  const [reschedule, setReschedule] = useState<Appointment | null>(null)
  const [result, setResult] = useState<Reaction | null>(null)
  const [error, setError] = useState('')

  const run = useCallback(
    async (a: Appointment, outcome: ValidationOutcome, newStart?: Date) => {
      const res = await novia.pro.recordOutcome(a.id, outcome, newStart)
      if (!res.ok) return setError(res.error)
      setError('')
      if (onReaction) onReaction(res.value, a)
      else setResult(res.value)
    },
    [onReaction],
  )

  const pick = useCallback(
    (a: Appointment, outcome: ValidationOutcome) => {
      if (outcome === 'rescheduled') setReschedule(a)
      else run(a, outcome)
    },
    [run],
  )

  const ui = (
    <>
      {reschedule && (
        <ReschedulePicker
          a={reschedule}
          open
          onClose={() => setReschedule(null)}
          onPick={(d) => {
            const a = reschedule
            setReschedule(null)
            run(a, 'rescheduled', d)
          }}
        />
      )}
      <Sheet open={!!result} onClose={() => setResult(null)} label="Réaction NOVIA">
        {result && <ReactionSheet r={result} onClose={() => setResult(null)} />}
      </Sheet>
      {error && (
        <div className="toast" role="alert" onClick={() => setError('')}>
          {error}
        </div>
      )}
    </>
  )
  return { pick, ui }
}

function ReactionSheet({ r, onClose }: { r: Reaction; onClose: () => void }) {
  const st = useDemoState()
  const c = st.customers.find((x) => x.id === r.customerId)
  const a = st.appointments.find((x) => x.id === r.resultAppointmentId)
  const [paid, setPaid] = useState(false)
  return (
    <div className="rx-sheet">
      <div className="rx-sheet__head">
        <span className="eyebrow">
          {customerName(c)} · {r.stateLabel}
        </span>
        <SimBadge />
      </div>
      <h2 className="display rx-sheet__title">NOVIA réagit</h2>
      <ReactionSteps reaction={r} />
      <ReactionLinks reaction={r} onNavigate={onClose} />
      {r.outcome === 'present' && a && !a.paymentProof && (
        <button
          className="btn btn--ghost"
          disabled={paid}
          onClick={async () => {
            if ((await novia.pro.recordPaymentProof(a.id)).ok) setPaid(true)
          }}
        >
          Simuler une preuve de paiement (fictive)
        </button>
      )}
      {paid && <div className="run__result">Preuve fictive enregistrée : CA confirmé.</div>}
      <button className="btn btn--ghost" onClick={onClose}>
        Fermer
      </button>
    </div>
  )
}
