# Indicateurs du cockpit NOVIA Pro

Calculés dans le domaine NOVIA (`src/domain/cockpit.ts`, `src/core/revenue.ts`), jamais dans un composant React ni chez un fournisseur (GHL ou autre). Les textes montrés à la professionnelle viennent de `src/domain/kpi.ts`.

## Trois niveaux de revenu, jamais mélangés

| Niveau | Ce que c'est | Règle |
|---|---|---|
| **Potentiel** | Ce qui peut encore être regagné | Opportunités ouvertes. Un rendez-vous perdu compte **une seule fois**, même s'il ouvre une relance et un créneau SmartFill. Il sort du potentiel dès qu'une de ses opportunités est gagnée. |
| **Réservé** | Un rendez-vous existe, rien n'est encaissé | RDV actif, ou présence attestée sans preuve de paiement. |
| **Confirmé** | Réellement réalisé | Présence attestée **et** preuve de paiement (fictive en démo). |

Chaque rendez-vous n'est compté qu'à un seul niveau et pour une seule source d'attribution. Un report ne crée pas de deuxième vente. Une absence ou une annulation ne produit aucun revenu.

## Indicateurs du panneau du jour

| Indicateur | Formule | Niveau |
|---|---|---|
| CA du jour | Σ RDV d'aujourd'hui de niveau réservé + Σ de niveau confirmé, affichés séparément en dessous | réservé + confirmé |
| À récupérer | `computeRevenue(...).totals.potential` sur tout l'historique | potentiel |
| Gagné par NOVIA (ce mois) | Σ réservé + confirmé des RDV du mois (date du RDV) attribués à `smartfill`, `cancellation_recovery`, `noshow_recovery` ou `voice` (RDV pris par NOVIA Voice, ajouté au Lot 6) ; la part confirmée est affichée à part | réservé + confirmé |
| Créneaux libérés | Opportunités SmartFill ouvertes sur un créneau à venir | aucun montant (déjà inclus dans « À récupérer ») |

## Ce que les actions font aux indicateurs

| Action | CA du jour | À récupérer | Gagné par NOVIA |
|---|---|---|---|
| Présente | inchangé (reste réservé) | inchangé | inchangé |
| Preuve de paiement | réservé → confirmé | inchangé | part confirmée ↑ si attribué à NOVIA |
| Absente | − prix | + prix | inchangé |
| Annulée (à venir) | − prix si aujourd'hui | + prix (une fois) | inchangé |
| Reportée | déplacé vers le nouveau jour | inchangé | inchangé |
| La cliente reprend RDV (récupération) | + prix le jour du nouveau RDV | − prix | + prix |
| SmartFill remplit le créneau | + prix le jour du créneau | − prix | + prix |
| NOVIA Voice crée un RDV | + prix le jour du RDV | inchangé | + prix |
| Garder le créneau libre | inchangé | − prix si plus aucune opportunité ouverte | inchangé |

Ces règles sont vérifiées par `src/domain/consistency.test.ts`.
