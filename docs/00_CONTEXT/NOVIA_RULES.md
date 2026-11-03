# Règles maîtresses

Statut : **DECIDED — règles retrouvées dans S2**, complétées par les limites de mission S1.

## Avant chaque action sensible

Contrôler l'état actuel, pas seulement l'événement initial :
- statut actuel de la personne et du rendez-vous concerné ;
- nouveau rendez-vous, modification récente ou report ;
- achat ou conversion intervenus depuis ;
- opposition, désinscription et STOP ;
- intervention / reprise humaine ;
- autre workflow incompatible ;
- doublons et répétition excessive.

Une réservation ou modification récente peut rendre une ancienne relance obsolète. Une action humaine doit pouvoir interrompre l'automatisation. Les plafonds et priorités exacts ne figurent pas dans la source accessible : ils restent à confirmer avant une exécution réelle. Pas de relances infinies.

## Réalité du rendez-vous

L'heure passée n'est pas une preuve de présence ou d'absence. Sources envisagées : professionnelle, cockpit, validation SMS ou intégration fiable. Si inconnu, bloquer les messages qui dépendent de la présence/absence. Distinguer annulation, report et absence ; ne pas utiliser l'un à la place de l'autre.

## Communication

Plages d'envoi et fuseau du business configurables. La plage 07:00–22:00 a été envisagée, sans constituer une autorisation légale ni un paramètre automatiquement validé. Distinguer transactionnel et marketing lorsque nécessaire ; prendre en compte consentement, opposition et STOP. Les règles applicables aux vrais canaux devront être vérifiées avant connexion. Cette documentation ne certifie aucune conformité juridique.

## Avis et revenu

Pas de review gating : une satisfaction faible peut ouvrir une action de service client, sans empêcher l'accès à un avis honnête. Les faux avis de démo sont explicitement fictifs.

Potential, Booked et Confirmed Revenue sont séparés. Une réservation n'est pas un encaissement. Une rétention supposée ne devient pas du revenu confirmé.

## Périmètre actuel

Documentation et préparation seulement. Aucune activation GHL, aucun envoi réel, appel réel, paiement réel, connexion Planity ou modification d'un autre projet. Données salon inconnues : laisser À RENSEIGNER ; exemples fictifs : signaler leur nature.
