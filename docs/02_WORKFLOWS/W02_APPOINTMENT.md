# W02 — Rendez-vous réservé → statut réel

**SPECIFIED — spécification produit fournie par le propriétaire (S6, 3 novembre 2026).** Non implémenté. Les délais de rappel sont des valeurs du Master Config.

## Déclencheur

Un rendez-vous est réservé. **W01 s'arrête** pour ce contact.

## Données enregistrées

Contact, rendez-vous, date / heure, prestation, source, origine de la réservation, professionnel·le, statut, éventuel parrain, éventuelle origine Voice.

## Avant le rendez-vous

1. **Confirmation immédiate** de la réservation.
2. **Rappels configurables.** Exemples donnés : 24 h et 2 h avant. Ces valeurs appartiennent au Master Config (`w02.reminders`), elles ne sont pas codées en dur.
3. **Déplacement** : mettre à jour la date, annuler les anciens rappels, recalculer les nouveaux, **rester en W02**.
4. **Annulation** → **W03**.

## Après l'heure du rendez-vous

**Ne jamais supposer la présence ou l'absence.**

Sources de statut possibles :

| Code | Source |
|---|---|
| A | Intégration fiable / check-in |
| B | Validation professionnelle |
| C | Cockpit NOVIA |
| D | Validation SMS |
| E | Autre source fiable future |

Actions de validation : **PRÉSENTE**, **ABSENTE**, **ANNULÉE**, **REPORTÉE**.

| Statut validé | Suite |
|---|---|
| Présente | → W05 (À CONCEVOIR) |
| Absente | → W04 |
| Annulée | → W03 |
| Reportée | Rester / revenir en W02 avec la nouvelle date |
| Inconnu | Attente ; **aucun message dépendant de présence/absence** |

**Correction ultérieure** : l'état actuel écrase l'ancien ; les workflows devenus incompatibles sont stoppés.

**Achat immédiat après prestation** : ne pas lancer de séquence de conversion inutile.

## Validation SMS professionnelle (format prévu)

```
NOVIA — statut à confirmer
Julie Martin — 18h00
1 = Présente
2 = Absente
3 = Annulée
4 = Reportée
```

Julie Martin est un exemple fictif. Si plusieurs rendez-vous sont en attente, utiliser un **identifiant** empêchant qu'une réponse s'applique au mauvais rendez-vous. Le format exact de cet identifiant et le traitement d'une réponse ambiguë ou tardive restent À CONCEVOIR ; une réponse ambiguë n'est jamais appliquée arbitrairement.

## Paramètres (Master Config)

| Paramètre | Valeur |
|---|---|
| `w02.reminders` | Exemples 24 h, 2 h — À CONFIGURER |
| Délai de demande de validation après l'heure | À CONFIGURER |
| Textes de confirmation et de rappel | À RÉDIGER |
| Format d'identifiant SMS multi-RDV | À CONCEVOIR |

## Attribution

Le rendez-vous réservé = Booked Revenue. Le statut « RDV confirmé » ne vaut pas « CA confirmé ».

## Scénarios de vérification

1. Déplacement : anciens rappels annulés, nouveaux calculés, aucun rappel à l'ancien horaire.
2. Annulation avant un rappel : le rappel ne part pas, W03 démarre.
3. Heure passée sans validation : statut inconnu, aucun message de suivi ni de récupération.
4. Deux RDV en attente de validation : chaque réponse s'applique au bon RDV grâce à l'identifiant.
5. Absente corrigée en Présente : W04 stoppé, W05 éligible.
6. Achat juste après la prestation : pas de séquence de conversion.

## Niveau de réalisation

SPECIFIED. Non MOCKED, non IMPLEMENTED, non TESTED, non CONNECTED.
