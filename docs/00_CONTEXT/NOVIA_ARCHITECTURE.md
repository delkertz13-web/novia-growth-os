# Architecture NOVIA

Statut : **DECIDED — séparation des responsabilités ; SPECIFIED — architecture conceptuelle de la démo**. Framework et hébergement non sélectionnés. Sources : S2 et S3.

## Couches prévues

| Couche | Responsabilité | Situation actuelle |
|---|---|---|
| Expérience cliente | Site, galerie, prestations, réservation, attente, retour | Spécification uniquement |
| Expérience professionnelle | Cockpit mobile, agenda, validations, messages, revenu | Spécification uniquement |
| Cœur métier | États, règles communes, configurations, workflows | Documentation partielle |
| Services / providers | Isoler les échanges avec les moteurs techniques | Interfaces conceptuelles |
| Données de démo | Alimenter les interactions sans services externes | Jeu de données à créer après autorisation |
| Backend futur | CRM, calendrier, workflows, communications, paiements, reporting | GHL envisagé, non activé |

## Frontières à conserver

UI → logique métier → interfaces de services → implémentations mock ou futures intégrations.

Interfaces mentionnées dans la spécification historique : `BookingProvider`, `CRMProvider`, `MessagingProvider`, `VoiceProvider`, `PaymentProvider`, `AnalyticsProvider`. Les variantes `Mock…Provider` servent à la future démo. Des variantes `GHL…Provider` pourront être évaluées plus tard ; leur faisabilité n'est pas vérifiée ici et leur existence n'est pas revendiquée.

Les données business et les particularités Nails vivent dans une configuration centrale / `verticalConfig`. Employer des concepts génériques : `service`, `appointment`, `customer`. L'interface doit pouvoir évoluer vers un backend sans reconstruction complète, sans prétendre qu'aucune adaptation ne sera nécessaire.

## Démo autonome

Web, mobile-first, état mock/local ; pas de backend lourd, d'authentification complexe ou d'infrastructure cloud inutile. Persistance locale et mécanisme de remise à zéro : propositions d'implémentation à soumettre lors de l'audit, pas choix déjà verrouillés. PWA seulement si cohérente avec le framework retenu.

## Audit avant choix technique

Identifier les outils réellement disponibles et les composants pertinents dans un périmètre accessible en lecture seule. Expliquer ce qui peut être réutilisé sans affecter les autres projets. L'environnement iOS déclaré ne suffit pas à choisir la stack web. Aucun audit technique de cette usine n'a été effectué pour ce pack.
