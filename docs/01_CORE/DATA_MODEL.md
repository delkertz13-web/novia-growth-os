# Modèle de données conceptuel

Statut : **SPECIFIED PARTIEL**. Les concepts et quelques champs sont retrouvés dans S2/S3 ; les relations ci-dessous sont une **PROPOSITION À VALIDER**, pas un schéma implémenté.

## Éléments explicitement décrits

| Concept | Données retrouvées | Limites |
|---|---|---|
| Business | Nom, slogan, logo, couleurs, adresse, téléphone, Instagram, lien avis, horaires | Valeurs salon inconnues |
| Service | id, name, description, duration, price, deposit, category, returnRecommendedAfterDays, active | Tarifs, durée et acompte réels inconnus |
| Customer | Prénom, nom, téléphone, email dans le parcours de réservation | Pas de clientes réelles fournies |
| Appointment | Heure, cliente, prestation, durée, prix, statut | Statut présent/absent à confirmer |
| Waitlist | Prestation, jours préférés, matin/après-midi/soir, flexibilité éventuelle | Priorité non spécifiée |
| Return cycle | lastAppointmentDate, lastService, recommendedReturnDate | Recommandation métier à valider |
| Conversation | NOVIA répond / réponse humaine nécessaire / professionnelle a repris | Automatisation réelle non conçue |
| Revenue | Potential / Booked / Confirmed et source d'attribution | Preuve financière et arbitrage à valider |

## Relations proposées pour préserver les règles

- Un rendez-vous relie un business, une cliente et une prestation ; un report doit pouvoir être relié au rendez-vous initial.
- Une validation de présence référence sans ambiguïté le rendez-vous, sa source et le moment de confirmation.
- Une exécution de workflow référence le contact, le rendez-vous éventuel, l'état courant et les actions déjà effectuées pour éviter les doublons.
- Une préférence de communication distingue canal, finalité, opposition et source de l'information ; le détail reste à concevoir avant connexion.
- Une attribution relie une action, une réservation et, lorsqu'elle existe, une preuve de revenu. Plusieurs vues ne doivent pas compter plusieurs fois le même résultat.

Identifiants, dates d'événements, historique des changements et pièces de preuve sont des besoins proposés pour rendre ces liens vérifiables. Aucun nom de table, type SQL ou index n'est décidé.

## Statuts de rendez-vous cités dans la démo

| Valeur conceptuelle | Libellé français proposé | Interprétation à garder distincte |
|---|---|---|
| Booked | Réservé | Rendez-vous enregistré |
| Confirmed | Confirmé | Confirmation du rendez-vous ; pas de revenu encaissé |
| Showed | Présente | Présence attestée |
| No-show | Absente | Absence attestée |
| Cancelled | Annulé | Annulation connue |
| Rescheduled | Reporté | Modification vers un nouveau créneau |
| Completed | Terminé | État de prestation à définir précisément |

Le vocabulaire vient de S3. La matrice des transitions n'est pas intégralement fournie. La fin horaire ne doit attribuer automatiquement ni Showed, ni No-show, ni revenu confirmé. L'absence de validation doit être représentable même si son nom technique reste à choisir.

## Points à décider avant données réelles

Source de vérité des rendez-vous, résolution des événements concurrents, dédoublonnage des contacts, règles de report, corrections de présence, preuve du revenu, droits d'accès et durée de conservation. Ces points sont des besoins de conception ; ce pack ne fixe pas de politique ni ne certifie sa conformité.
