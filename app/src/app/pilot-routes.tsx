/**
 * Écrans propres au PILOTE (préparation P3), ajoutés à NOVIA Pro par la composition
 * NOVIA_MODE=pilot. Absents du build de démonstration (qui n'a ni serveur ni API).
 */
import { Link, type RouteObject } from 'react-router-dom'
import { novia } from '../domain'
import { Icon } from '../ui/Icon'
import { Faq } from '../pilot/ui/Faq'
import { Import } from '../pilot/ui/Import'
import { ManualEntry } from '../pilot/ui/ManualEntry'
import { PilotHome } from '../pilot/ui/PilotHome'
import { Preparation } from '../pilot/ui/Preparation'
import { Readiness } from '../pilot/ui/Readiness'
import { Shadow } from '../pilot/ui/Shadow'
import { Summary } from '../pilot/ui/Summary'
import { Templates } from '../pilot/ui/Templates'

export const extraProRoutes: RouteObject[] = [
  { path: 'pilote', element: <PilotHome /> },
  { path: 'pilote/preparation', element: <Preparation /> },
  { path: 'pilote/preparation/:section', element: <Preparation /> },
  { path: 'pilote/readiness', element: <Readiness /> },
  { path: 'pilote/messages', element: <Templates /> },
  { path: 'pilote/faq', element: <Faq /> },
  { path: 'pilote/shadow', element: <Shadow /> },
  { path: 'pilote/saisie', element: <ManualEntry /> },
  { path: 'pilote/import', element: <Import /> },
  { path: 'pilote/resume', element: <Summary /> },
]

/** Tuiles de l'espace NOVIA */
export function ExtraHubTiles() {
  return (
    <>
      <Link to="/pro/pilote" className="hub__tile">
        <Icon name="sparkle" size={20} />
        <strong>Pilote</strong>
        <span>Préparation, readiness, shadow</span>
      </Link>
      <Link to="/pro/pilote/shadow" className="hub__tile">
        <Icon name="chart" size={20} />
        <strong>Shadow</strong>
        <span>Ce que NOVIA aurait fait</span>
      </Link>
    </>
  )
}

/** Agenda : observé (Planity fait foi) ou NOVIA ; et saisie des RDV. */
export function AgendaNotice() {
  const planity = novia.profile.schedule.authority.value === 'planity'
  return (
    <div className="pl-banner" role="note" style={{ display: 'grid', gap: 8 }}>
      <span>
        {planity
          ? 'Agenda observé : Planity fait foi. Ces RDV sont une copie saisie ou importée ; NOVIA n’affiche aucun créneau comme disponible.'
          : 'Agenda NOVIA.'}
      </span>
      <Link to="/pro/pilote/saisie" className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }}>
        Saisir un RDV
      </Link>
    </div>
  )
}
