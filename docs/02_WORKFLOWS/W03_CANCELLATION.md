# W03 — Annulation → recovery

**SPECIFIED — spécification produit fournie par le propriétaire (S6, 3 novembre 2026).** Non implémenté.

## Déclencheur

Statut confirmé **ANNULÉ**.

## Séquence

1. **Stopper les rappels W02.**
2. **Vérifier immédiatement** :
   - un nouveau RDV existe-t-il déjà ?
   - la cliente souhaite-t-elle explicitement déplacer ?
   - intervention humaine en cours ?
   - opposition ?
   - workflow incompatible ?
3. **Nouveau RDV** : STOP W03 → W02.
4. **Demande de déplacement** : proposer / réserver un nouveau créneau → W02.
5. **Sinon** : attente configurable, puis **nouvelle vérification**.
6. **Message de récupération** proposant une nouvelle réservation. Texte À RÉDIGER.
7. **Réservation** : STOP W03 → W02.
8. **Réponse** : Conversation AI (FAQ autorisées) ou humain.
9. **Refus** : STOP.
10. **Aucune réponse** : une dernière relance configurable, puis STOP.

## Lien avec SmartFill

Le créneau libéré par une annulation peut également alimenter **W12 SmartFill** (À CONCEVOIR). Récupérer la cliente (W03) et remplir le créneau (W12) sont deux objectifs distincts ; la règle d'attribution doit éviter le double compte.

## Mesures

Potential Revenue, Booked Revenue, Confirmed Revenue, séparés. **Ne jamais déclarer du revenu encaissé uniquement parce qu'un rendez-vous a été réservé.**

## Paramètres (Master Config)

| Paramètre | Valeur |
|---|---|
| `w03.waitBeforeRecovery` | À CONFIGURER |
| `w03.lastFollowUpDelay` | À CONFIGURER (une seule relance finale) |
| Texte de récupération et de relance | À RÉDIGER |

## Scénarios de vérification

1. Annulation puis nouvelle réservation avant le message : W03 stoppé, aucun message.
2. Cliente demande à déplacer : proposition de créneau, retour W02.
3. Refus explicite : STOP immédiat.
4. Aucune réponse : exactement une relance finale, puis STOP.
5. Même annulation reçue deux fois : une seule prise en charge.
6. Réservation récupérée : comptée en Booked, jamais en encaissé.

## Niveau de réalisation

SPECIFIED. Non MOCKED, non IMPLEMENTED, non TESTED, non CONNECTED.
