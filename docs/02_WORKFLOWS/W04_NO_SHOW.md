# W04 — No-show → recovery

**SPECIFIED — spécification produit fournie par le propriétaire (S6, 3 novembre 2026).** Non implémenté.

## Déclencheur

Ne démarre **que lorsque le no-show est confirmé** (sources A à E de W02). **Jamais uniquement parce que l'heure du rendez-vous est passée.**

## Séquence

1. Attente d'un **délai configurable**.
2. **Revérifier** :
   - statut toujours Absente ?
   - aucun nouveau RDV ?
   - cliente contactable ?
   - pas d'intervention humaine ?
   - pas d'opposition ?
3. **Message de récupération non culpabilisant.** Texte À RÉDIGER.
4. **Nouveau RDV** : `NO_SHOW_RECOVERED = TRUE`, STOP W04 → W02.
5. **Réponse** : Conversation AI (FAQ autorisées) ou humain.
6. **Refus** : STOP.
7. **Aucune réponse** : une dernière relance configurable, puis STOP.

## Historique et règles de l'établissement

Compteurs possibles : `NO_SHOW_COUNT_30D`, `NO_SHOW_COUNT_90D`, `NO_SHOW_COUNT_TOTAL`.

Après plusieurs no-shows, l'établissement **peut** configurer par exemple `DEPOSIT_REQUIRED` ou `HUMAN_APPROVAL_REQUIRED`. Seuils et règles : À CONFIGURER par l'établissement.

**NOVIA ne décide jamais seul d'une sanction.**

## Lien avec SmartFill

W04 peut alimenter **W12 SmartFill** lorsque le créneau est encore exploitable.

## Mesures

No-shows, no-shows récupérés, nouveaux RDV, prestations réellement effectuées, Confirmed Revenue réellement attribuable à la récupération.

## Paramètres (Master Config)

| Paramètre | Valeur |
|---|---|
| `w04.waitBeforeRecovery` | À CONFIGURER |
| `w04.lastFollowUpDelay` | À CONFIGURER (une seule relance finale) |
| Seuils de `DEPOSIT_REQUIRED` / `HUMAN_APPROVAL_REQUIRED` | À CONFIGURER par l'établissement |
| Texte de récupération et de relance | À RÉDIGER |

## Scénarios de vérification

1. Heure dépassée sans validation : W04 ne démarre pas.
2. Absente puis corrigée en Présente avant le message : W04 stoppé.
3. Nouveau RDV : `NO_SHOW_RECOVERED = TRUE`, retour W02.
4. Refus : STOP. Aucune réponse : une relance finale puis STOP.
5. Compteurs à jour après chaque absence confirmée ; aucune sanction appliquée sans configuration ou validation humaine.
6. RDV récupéré : Booked Revenue ; Confirmed Revenue seulement après prestation effectuée et preuve recevable.

## Niveau de réalisation

SPECIFIED. Non MOCKED, non IMPLEMENTED, non TESTED, non CONNECTED.
