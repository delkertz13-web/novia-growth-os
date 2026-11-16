/** Accueil de la préparation du pilote : les étapes, et où en est chaque capacité. */
import { Link } from 'react-router-dom'
import { pilotApi } from '../client'
import { assessReadiness } from '../readiness'
import { Loading, PilotPage, useLoad } from './kit'
import { LevelTag } from './Readiness'

const steps: [string, string, string][] = [
  ['/pro/pilote/preparation', 'Préparation', 'Checklist du rendez-vous, section par section'],
  ['/pro/pilote/readiness', 'Readiness', 'Ce qui bloque chaque capacité, et pourquoi'],
  ['/pro/pilote/messages', 'Messages types', 'Brouillons, approbation, versions'],
  ['/pro/pilote/faq', 'Réponses approuvées', 'Sinon : besoin d’un humain'],
  ['/pro/pilote/saisie', 'Saisies', 'Clientes, RDV observés, corrections, liste d’attente'],
  ['/pro/pilote/import', 'Import CSV', 'Clientes, avec aperçu et doublons'],
  ['/pro/pilote/shadow', 'Shadow Control Center', 'Ce que NOVIA aurait fait, et votre avis'],
  ['/pro/pilote/resume', 'Résumé imprimable', 'Le profil du pilote sur une page'],
]

export function PilotHome() {
  const { data, error } = useLoad(pilotApi.onboarding)
  return (
    <PilotPage title="Pilote 001">
      <p className="pl-banner">Mode shadow : NOVIA observe et décide, mais n’envoie aucun message, n’appelle personne et n’encaisse rien.</p>
      <div className="pl-tiles" style={{ marginTop: 12 }}>
        {steps.map(([to, title, help]) => (
          <Link key={to} to={to} className="pl-tile">
            <strong>{title}</strong>
            <span>{help}</span>
          </Link>
        ))}
      </div>
      <section className="pl-card" style={{ marginTop: 16 }}>
        <h3>Capacités</h3>
        {!data ? (
          <Loading error={error} />
        ) : (
          <ul className="pl-list">
            {assessReadiness(data.engineProfile, data.facts, data.settings).map((c) => (
              <li key={c.id}>
                <LevelTag level={c.level} /> <span>{c.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PilotPage>
  )
}
