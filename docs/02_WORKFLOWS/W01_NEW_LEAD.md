# W01 — Nouveau prospect → réservation

**SPECIFIED — spécification produit fournie par le propriétaire (S6, 3 novembre 2026).** Non implémenté dans GHL ni ailleurs. Les valeurs chiffrées (délais, nombre de relances, plages) relèvent du Master Config et restent À CONFIGURER.

## Entrées

Toutes les sources convergent vers ce même workflow :

- site / formulaire ;
- Instagram, Facebook et autres réseaux sociaux ;
- chatbot ;
- import ou saisie manuelle, uniquement lorsque légalement exploitable ;
- appel entrant ;
- NOVIA Voice ;
- parrainage.

## Données enregistrées

Identité, téléphone, email, source, date d'entrée, consentement / opposition, statut client, dernière activité, offre ou prestation souhaitée, établissement, origine NOVIA.

**Déduplication obligatoire** avant toute création de contact ou entrée dans le workflow.

## État initial

`NEW PROSPECT`

## Contrôles avant tout envoi

| Contrôle | Si non satisfait |
|---|---|
| Le contact est contactable (consentement, pas d'opposition / STOP) | Aucun envoi |
| Le workflow est actif | Aucun envoi |
| Le contact n'est pas déjà client / membre | Sortie de W01 ; son statut actuel prime |
| Aucun workflow incompatible en cours | Aucun envoi |
| Aucune intervention humaine en cours | Aucun envoi automatique |
| L'heure est dans la plage d'envoi autorisée | Attendre la prochaine plage autorisée |

## Séquence

1. **Premier message** : court, humain, orienté réservation. Texte exact À RÉDIGER.
2. **Si réservation** : STOP W01 → **W02**.
3. **Si réponse** : Conversation AI ne traite que les FAQ autorisées. Question inconnue ou sensible → **humain**.
4. **Si aucune réservation** : relance après un délai configurable.
5. **Avant chaque relance** : revérifier l'état actuel (tous les contrôles ci-dessus).
6. **Après le nombre maximal de relances** : STOP.
7. Le contact pourra éventuellement entrer plus tard dans **W10 Reactivation** s'il est éligible (W10 À CONCEVOIR).

**Raccourci Voice** : si le rendez-vous est pris directement pendant l'appel, Voice peut court-circuiter une partie de W01 et le contact passe en W02.

## Paramètres (Master Config)

| Paramètre | Valeur |
|---|---|
| `w01.followUpDelay` | À CONFIGURER |
| `w01.maxFollowUps` | À CONFIGURER |
| `messaging.sendWindow` + fuseau | À CONFIGURER (07:00–22:00 seulement envisagé) |
| Textes du premier message et des relances | À RÉDIGER |
| Liste des FAQ autorisées pour Conversation AI | À VALIDER avec l'établissement |

## Attribution

Source d'attribution : Acquisition. La création d'un prospect ne produit aucun revenu ; la réservation produit du Booked Revenue (voir `../01_CORE/ATTRIBUTION_REVENUE.md`).

## Scénarios de vérification

1. Le prospect réserve pendant l'attente d'une relance : la relance ne part pas, W01 s'arrête, W02 démarre.
2. Le même prospect arrive par deux sources : un seul contact, une seule entrée dans W01.
3. Opposition ou reprise humaine entre deux relances : aucune relance automatique.
4. Contact déjà client : pas d'entrée dans W01.
5. Relance due hors plage : décalée à la prochaine plage autorisée.
6. Nombre maximal de relances atteint : STOP, aucun message supplémentaire.

## Niveau de réalisation

SPECIFIED. Non MOCKED, non IMPLEMENTED, non TESTED, non CONNECTED. La Demo V1 pourra en illustrer les états, sans exécuter de séquence réelle.
