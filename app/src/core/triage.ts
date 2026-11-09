/**
 * Tri d'un message entrant : NOVIA peut-elle répondre seule (réponse approuvée), ou la
 * question va-t-elle à la professionnelle ? Règle métier pure, utilisée par le moteur.
 */
import type { ApprovedAnswer, BusinessProfile } from '../config/profile'

/** minuscules, sans accents ni apostrophes typographiques */
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')

export type Triage =
  | { kind: 'faq'; answer: ApprovedAnswer }
  | { kind: 'sensitive'; reason: string }
  | { kind: 'unknown'; reason: string }

/**
 * Décide si NOVIA peut répondre seule. Le sensible passe TOUJOURS avant la FAQ :
 * « quel prix pour une réaction allergique ? » va à la professionnelle.
 */
export function triage(text: string, profile: Pick<BusinessProfile, 'approvedAnswers' | 'sensitiveKeywords'>): Triage {
  const t = normalize(text)
  if (profile.sensitiveKeywords.some((k) => t.includes(k))) return { kind: 'sensitive', reason: 'Sujet sensible : NOVIA ne répond pas seule.' }
  const answer = profile.approvedAnswers.value.find((a) => a.keywords.some((k) => t.includes(k)))
  if (answer) return { kind: 'faq', answer }
  return { kind: 'unknown', reason: 'Question sans réponse approuvée.' }
}
