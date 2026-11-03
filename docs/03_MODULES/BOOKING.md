# NOVIA Booking

Statut : **DECIDED — concept ; SPECIFIED — parcours démo ; non implémenté**. Sources : S2/S3.

## Périmètre

Page personnalisée : présentation, galerie, prestations, réservation, acompte éventuel, liste d'attente, SmartFill et retour/rebooking. Le parcours doit être générique, avec les particularités Nails dans la configuration.

## Parcours démo spécifié

Prestation → date → créneau → coordonnées (prénom, nom, téléphone, email) → récapitulatif → confirmation locale. Afficher prestation, date, heure, durée, prix et éventuel acompte fictif. Mentionner explicitement qu'aucun rendez-vous réel ni SMS réel n'est créé.

Si aucun créneau ne convient : liste d'attente par prestation, jours préférés, période de la journée et flexibilité éventuelle. Le retour peut s'appuyer conceptuellement sur `lastAppointmentDate`, `lastService`, `recommendedReturnDate`.

## Architecture prévue

Isoler `BookingProvider`, puis une implémentation `MockBookingProvider` lors du développement autorisé. Une intégration future pourra remplacer le mock ; GHL est une possibilité à vérifier. Pas de dépendance forte à Planity.

## Ouvert avant usage réel

Disponibilités de référence, ressources/professionnelles, durées et marges, simultanéité des réservations, acomptes, annulations, fuseau, confirmations et synchronisation. Aucune politique réelle du salon n'est connue.

## Vérification future

Parcours complet, créneau indisponible, liste d'attente, report, erreurs et affichage mobile. Les critères détaillés sont dans `../04_VERTICALS/NAILS/DEMO_SPEC.md`. Aucun test produit n'est exécuté ici.
