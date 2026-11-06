/**
 * Mode présentation : le parcours commercial recommandé, en 18 étapes.
 * C'est une aide pour la personne qui présente la démo : rien ici ne modifie le
 * scénario NOVIA. L'état (actif, étape) vit dans le navigateur, pas dans le store.
 */
export interface PresentationStep {
  title: string
  /** ce qu'il faut toucher, en une phrase */
  hint: string
  /** page où se trouve l'étape */
  path: string
}

export const presentationSteps: PresentationStep[] = [
  { title: 'Accueil cliente', hint: 'Faites défiler : l’univers du salon, tel que le voit une cliente.', path: '/' },
  { title: 'Galerie', hint: 'Parcourez les poses, en plein écran au doigt.', path: '/galerie' },
  { title: 'Une inspiration', hint: 'Ouvrez une pose, puis « Je veux cette pose ».', path: '/galerie' },
  { title: 'Réservation', hint: 'Un jour, un créneau, ses coordonnées : moins d’une minute.', path: '/reserver' },
  { title: 'Confirmation', hint: 'Le récapitulatif, puis ce que NOVIA fera ensuite (rappels).', path: '/reserver' },
  { title: 'Côté pro', hint: 'Basculez sur « Pro » : la même réservation, vue par Léa.', path: '/pro' },
  { title: 'Accueil pro', hint: 'La journée, le chiffre du jour, ce que NOVIA a fait.', path: '/pro' },
  { title: 'Valider un RDV', hint: 'Sur une carte « À confirmer », touchez « Absente ».', path: '/pro' },
  { title: 'Récupération', hint: 'NOVIA récupère l’absence : « Le temps passe », puis « Elle réserve ».', path: '/pro/novia' },
  { title: 'Créneau libéré', hint: '« Remplir ce créneau » : NOVIA trouve une cliente.', path: '/pro/novia' },
  { title: 'Fiche cliente', hint: 'L’histoire d’Océane : absence, relance, ce qui l’attend.', path: '/pro/clientes/c13' },
  { title: 'Reprise humaine', hint: 'Océane demande Léa : « Reprendre la conversation ».', path: '/pro/messages/conv-c13' },
  { title: 'Rendre à NOVIA', hint: 'NOVIA revérifie tout avant de reprendre.', path: '/pro/messages/conv-c13' },
  { title: 'NOVIA Voice', hint: 'Les appels pris quand Léa ne peut pas répondre.', path: '/pro/voice' },
  { title: 'Appel → RDV', hint: '« Simuler un appel entrant » : NOVIA répond et réserve.', path: '/pro/voice' },
  { title: 'Agenda', hint: 'Le nouveau rendez-vous, étiqueté Voice.', path: '/pro/agenda' },
  { title: 'Revenue', hint: 'Ce que NOVIA a rapporté : potentiel, réservé, confirmé.', path: '/pro/revenue' },
  { title: 'Réglages', hint: 'Ce que NOVIA a le droit de faire, en quelques interrupteurs.', path: '/pro/reglages' },
]

/* ---------------- État du mode présentation (navigateur uniquement) ---------------- */

const KEY = 'novia-presentation'
type State = { on: boolean; step: number }
let state: State = read()
const listeners = new Set<() => void>()

function read(): State {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (raw) {
      const s = JSON.parse(raw) as State
      return { on: !!s.on, step: Math.min(Math.max(0, s.step | 0), presentationSteps.length - 1) }
    }
  } catch {
    /* stockage indisponible : mode présentation désactivé */
  }
  return { on: false, step: 0 }
}

export const presentation = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
  set(patch: Partial<State>) {
    state = { ...state, ...patch, step: Math.min(Math.max(0, patch.step ?? state.step), presentationSteps.length - 1) }
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l())
  },
}
