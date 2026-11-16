/**
 * PILOT READINESS : chaque capacité, son niveau et pourquoi. Pas de pourcentage.
 * Plafond de P3 : « Prêt pour le shadow » (aucun transport n'existe).
 */
import { Link } from 'react-router-dom'
import { pilotApi } from '../client'
import { assessReadiness, completeness, type ReadinessLevel } from '../readiness'
import { Loading, PilotPage, StatusTag, useLoad } from './kit'
import { factLabels } from './Preparation'

export const levelText: Record<ReadinessLevel, string> = {
  BLOCKED: 'Bloqué',
  NOT_CONFIGURED: 'Non configuré',
  READY_FOR_SHADOW: 'Prêt pour le shadow',
  READY_FOR_TEST: 'Prêt pour un test',
  READY_FOR_LIVE: 'Prêt pour le réel',
}
const levelTag: Record<ReadinessLevel, string> = { BLOCKED: 'blocked', NOT_CONFIGURED: 'off', READY_FOR_SHADOW: 'ok', READY_FOR_TEST: 'ok', READY_FOR_LIVE: 'ok' }

export function LevelTag({ level }: { level: ReadinessLevel }) {
  return <span className={`pl-tag pl-tag--${levelTag[level]}`}>{levelText[level]}</span>
}

export function Readiness() {
  const { data, error } = useLoad(pilotApi.onboarding)
  if (!data) return <PilotPage title="Readiness">{<Loading error={error} />}</PilotPage>
  // le moteur lit le profil AVEC les messages et réponses approuvés : la readiness aussi
  const caps = assessReadiness(data.engineProfile, data.facts, data.settings)
  const c = completeness(data.profile, data.facts, factLabels)
  return (
    <PilotPage title="Readiness du pilote">
      <p className="pl-msg" style={{ marginTop: 12 }}>
        Niveau maximal de cette étape : « Prêt pour le shadow ». NOVIA décide et explique, mais n’envoie rien, n’appelle personne et n’encaisse rien.
      </p>
      <div className="pl-grid" style={{ marginTop: 12 }}>
        {caps.map((cap) => (
          <section key={cap.id} className="pl-card">
            <div className="pl-row pl-row--between">
              <h3>{cap.title}</h3>
              <span className="pl-row">
                <LevelTag level={cap.level} />
                {cap.disabled && <span className="pl-tag pl-tag--off">Coupée</span>}
              </span>
            </div>
            <ul className="pl-list">
              {cap.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {cap.requirements.length > 0 && (
              <ul className="pl-list">
                {cap.requirements.map((r) => (
                  <li key={r.label}>
                    <span aria-hidden>{r.ok ? '✓' : '✗'}</span> {r.label} {r.status && <StatusTag status={r.status} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <h2 className="p-section__title" style={{ marginTop: 24 }}>
        Ce qui reste à apprendre
      </h2>
      <div className="pl-grid">
        {(['unknown', 'estimated'] as const).map((st) => (
          <section key={st} className="pl-card">
            <div className="pl-row pl-row--between">
              <h3>{st === 'unknown' ? 'Inconnu' : 'Estimé (à vérifier)'}</h3>
              <span>{c[st].length}</span>
            </div>
            <ul className="pl-list">
              {c[st].map((i) => (
                <li key={`${i.section}-${i.label}`}>
                  <span className="pl-msg">{i.section}</span> {i.label}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p style={{ marginTop: 16 }}>
        <Link to="/pro/pilote/preparation" className="btn btn--primary btn--sm">
          Compléter la préparation
        </Link>
      </p>
    </PilotPage>
  )
}
