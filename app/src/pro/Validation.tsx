import { useCallback, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { rules } from '../config/rules.demo'
import { outcomeLabels, ValidationError } from '../core/appointmentStatus'
import { formatEUR } from '../core/revenue'
import type { Appointment, ValidationOutcome } from '../core/types'
import { providers } from '../providers/mock'
import { getState } from '../providers/mock/store'
import { Icon } from '../ui/Icon'
import { capitalize, fmt, Sheet, SimBadge } from '../ui/common'
import { customerName, ReschedulePicker } from './parts'

interface Result {
  outcome: ValidationOutcome
  before: Appointment
  after: Appointment
}

/**
 * Validation Présente / Absente / Annulée / Reportée depuis le cockpit,
 * puis affichage de l'action NOVIA correspondante (spécification W02).
 */
export function useValidation() {
  const [reschedule, setReschedule] = useState<Appointment | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  const run = useCallback((a: Appointment, outcome: ValidationOutcome, newStart?: Date) => {
    try {
      const after = providers.booking.validate(a.id, outcome, { source: 'cockpit', newStart })
      setResult({ outcome, before: a, after })
      setError('')
    } catch (e) {
      setError(e instanceof ValidationError || e instanceof Error ? e.message : 'Action impossible')
    }
  }, [])

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
      <Sheet open={!!result} onClose={() => setResult(null)} label="Action NOVIA">
        {result && <Consequence r={result} onClose={() => setResult(null)} />}
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

function Step({ icon, children }: { icon: 'check' | 'clock' | 'message' | 'bolt' | 'chart' | 'x' | 'calendar'; children: ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span
        style={{
          flex: '0 0 auto',
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'var(--shell)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name={icon} size={15} />
      </span>
      <span style={{ fontSize: 14.5, lineHeight: 1.45, paddingTop: 4 }}>{children}</span>
    </li>
  )
}

function Consequence({ r, onClose }: { r: Result; onClose: () => void }) {
  const navigate = useNavigate()
  const st = getState()
  const c = st.customers.find((x) => x.id === r.before.customerId)
  const smartfill = st.opportunities.find((o) => o.kind === 'smartfill' && o.status === 'open' && o.sourceAppointmentId === r.before.id)
  const go = (to: string) => {
    onClose()
    navigate(to)
  }
  const [paid, setPaid] = useState(false)

  const titles: Record<ValidationOutcome, string> = {
    present: 'Présence enregistrée',
    absent: 'Absence enregistrée',
    cancelled: 'Annulation enregistrée',
    rescheduled: 'Rendez-vous reporté',
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span className="eyebrow">
            {customerName(c)} · {outcomeLabels[r.outcome]}
          </span>
          <SimBadge />
        </div>
        <h2 className="display" style={{ fontSize: 32, margin: '8px 0 0' }}>
          {titles[r.outcome]}
        </h2>
      </div>
      <div className="eyebrow" style={{ marginBottom: -8 }}>
        Ce que fait NOVIA
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        {r.outcome === 'present' && (
          <>
            <Step icon="check">Statut « Présente » appliqué au bon rendez-vous ({r.before.ref}). Les workflows incompatibles sont stoppés.</Step>
            <Step icon="message">Suite prévue : W05 Satisfaction. W05 est à concevoir : aucun message n’est préparé.</Step>
            <Step icon="chart">
              Revenu : {formatEUR(r.after.price)} restent en « CA réservé ». Ils passent en « CA confirmé » seulement avec une preuve.
            </Step>
          </>
        )}
        {r.outcome === 'absent' && (
          <>
            <Step icon="check">Absence confirmée par la professionnelle : W04 peut démarrer.</Step>
            <Step icon="clock">Attente de {rules.w04.waitBeforeRecoveryHours} h (paramètre démo), puis revérification : statut, nouveau RDV, opposition, reprise humaine.</Step>
            <Step icon="message">Message de récupération non culpabilisant, puis une dernière relance au maximum. Messages simulés.</Step>
            <Step icon="chart">{formatEUR(r.before.price)} ajoutés en « CA potentiel » (no-show à récupérer). Aucune sanction automatique.</Step>
          </>
        )}
        {r.outcome === 'cancelled' && (
          <>
            <Step icon="x">Rappels W02 stoppés. W03 vérifie : nouveau RDV, demande de déplacement, opposition, reprise humaine.</Step>
            <Step icon="clock">Attente de {rules.w03.waitBeforeRecoveryHours} h (paramètre démo), puis message proposant une nouvelle réservation (simulé).</Step>
            {smartfill && (
              <Step icon="bolt">
                Le créneau du {fmt.dayShort(smartfill.slotStart!)} à {fmt.time(smartfill.slotStart!)} est libre : il peut être proposé via SmartFill.
              </Step>
            )}
          </>
        )}
        {r.outcome === 'rescheduled' && (
          <>
            <Step icon="calendar">
              Nouveau créneau : {capitalize(fmt.dayLong(r.after.start))} à {fmt.time(r.after.start)} (réf. {r.after.ref}).
            </Step>
            <Step icon="x">Anciens rappels annulés, nouveaux rappels recalculés (24 h et 2 h avant, paramètres démo). Reste en W02.</Step>
            <Step icon="chart">Un seul rendez-vous compté en « CA réservé » : le report ne crée pas de deuxième vente.</Step>
          </>
        )}
      </ul>

      <div style={{ display: 'grid', gap: 8 }}>
        {(r.outcome === 'absent' || r.outcome === 'cancelled') && (
          <button className="btn btn--primary" onClick={() => go(`/pro/rdv/${r.before.id}`)}>
            Suivre la récupération <Icon name="arrowRight" size={18} />
          </button>
        )}
        {r.outcome === 'cancelled' && smartfill && (
          <button className="btn btn--lacquer" onClick={() => go(`/pro/novia?smartfill=${smartfill.id}`)}>
            <Icon name="bolt" size={18} /> Lancer SmartFill
          </button>
        )}
        {r.outcome === 'present' && (
          <button
            className="btn btn--ghost"
            disabled={paid}
            onClick={() => {
              providers.payment.recordDemoPayment(r.after.id)
              setPaid(true)
            }}
          >
            {paid ? 'Preuve fictive enregistrée · CA confirmé' : 'Simuler une preuve de paiement (fictive)'}
          </button>
        )}
        <button className="btn btn--ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  )
}
