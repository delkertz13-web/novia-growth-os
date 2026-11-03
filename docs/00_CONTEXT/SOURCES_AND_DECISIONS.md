# Sources, décisions et limites de reconstruction

Pack préparé le **3 novembre 2026** à partir de la demande actuelle et de la conversation « Référencement ChatGPT expliqué », identifiant `6ace23ba-2ea8-83eb-b7c6-babf36c31240`.

## Périmètre effectivement accessible

La lecture de la conversation a renvoyé cinq tours, sans pièce jointe, sans curseur vers des messages antérieurs. Le pack ne contient donc pas toute l'histoire initiale de NOVIA. La formation GHL / Notion évoquée n'a pas été fournie ni consultée. Aucun code existant, compte GHL, compte Planity ou environnement iOS n'a été audité.

| Référence | Élément accessible | Usage |
|---|---|---|
| S1 | Demande actuelle de création du pack | Livrables, absence de code, instructions initiales |
| S2 | Échange « Donne moi tout, les dossiers… » et réponse d'initialisation NOVIA | Vision, stratégie, règles communes, modules, statuts, organisation |
| S3 | Échange « Allez c'est parti » et prompt de démo NOVIA Nails | Cahier des charges cliente/pro, mocks, architecture future, critères de vérification |
| S4 | Échange précisant que l'activité concerne les ongles | Identité Nails, parcours, cycle de retour, attente |
| S5 | Échange proposant un site immersif d'exemple | Intention de démo autonome avant GHL |
| S6 | Message du propriétaire du 3 novembre 2026 (validation du périmètre) | Spécifications W01–W04, validation Demo V1, dépôt dédié, isolation |

## Limite particulière : W01 à W04

Historique : S2 affirmait que W01 à W04 avaient déjà été définis, sans reproduire leurs séquences détaillées. Les fiches du pack reprennent leur rôle, les règles communes retrouvées et les transitions explicitement évoquées. Elles n'inventent pas de délais, nombre de tentatives, templates de messages, tags, conditions GHL ou règles de priorité.

**Mise à jour du 3 novembre 2026 (S6)** : le propriétaire a fourni les spécifications de W01 à W04 issues de la conversation de conception. Elles sont intégrées dans `02_WORKFLOWS/W01` à `W04` au statut **SPECIFIED**. Les valeurs chiffrées (délais, nombre de relances, plages d'envoi) restent des paramètres du Master Config À CONFIGURER, et les textes de messages restent À RÉDIGER : S6 donne leur intention (court, humain, non culpabilisant), pas leur texte. Ces workflows sont des spécifications produit, à ne pas coder dans GHL à ce stade.

## Registre des décisions retrouvées

| ID | Décision / cadrage | Source |
|---|---|---|
| D01 | Produit NOVIA modulaire, au-delà d'une collection de workflows GHL | S2 |
| D02 | Pilates/Reformer première niche commerciale ; Nails premier pilote | S2, S4 |
| D03 | Démo autonome avant activation GHL | S2, S3, S5 |
| D04 | État actuel et reprise humaine gouvernent les actions | S2 |
| D05 | Présence/absence à confirmer, jamais déduites de l'heure | S2 |
| D06 | Validation Présente/Absente/Annulée/Reportée ; SMS avec identifiant si ambiguïté | S2 |
| D07 | Séparer revenu potentiel, réservé et confirmé | S2, S3 |
| D08 | Pas de review gating | S2 |
| D09 | Données salon inconnues, mocks explicitement fictifs et configurables | S2, S3 |
| D10 | Évaluer le mobile GHL au MVP, pas de natif obligatoire au lancement | S2 |
| D11 | W05 à W12 restent à concevoir ; démo avant leur conception détaillée | S3, S4, S1 |
| D12 | Audit et validation avant code ; autres projets isolés | S1, S2 |
| D13 | W01–W04 spécifiés comme spécifications produit, non codés dans GHL | S6 |
| D14 | Dépôt GitHub dédié `novia-growth-os`, isolé de app-factory, OpenCloud, OpenClaw, Snipustre, des apps iOS et de tout autre projet | S6 |
| D15 | Demo V1 : Vite + React + TypeScript, web autonome mobile-first, espace cliente + `/pro`, six providers en version Mock | S6 |
| D16 | NOVIA ne décide jamais seul d'une sanction après no-show | S6 |

## Arbitrages et éléments non vérifiés

- S3 finissait par « puis implémente ». S2 impose ensuite une phase d'initialisation sans code, confirmée par S1. La consigne active est donc : audit, puis attente de validation.
- Le nom Beauty d'une première proposition est précisé en Nails dans S4 ; Beauty reste une famille éventuelle.
- « Confirmed » pour un rendez-vous n'est pas « Confirmed Revenue ». La définition comptable exacte de ce dernier reste à valider.
- L'essai GHL d'environ 30 jours est une intention historique du propriétaire, pas une condition commerciale actuelle vérifiée.
- Les fonctions GHL décrites sont des cibles à évaluer, pas une certification de disponibilité, d'abonnement ou d'intégration.
- Les champs complémentaires du modèle de données sont des propositions documentaires nommées comme telles ; aucun schéma de base n'est arrêté.

Les décisions produit reprises de la synthèse historique restent des éléments de contexte transmis par le propriétaire. Une ancienne instruction d'exécution n'est pas une autorisation actuelle.
