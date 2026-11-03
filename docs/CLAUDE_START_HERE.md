# NOVIA — Instructions initiales pour Claude

**Mission actuelle : assimiler, auditer et préparer. Ne rien coder avant validation explicite du propriétaire.**

Ce dossier est un pack de documentation, pas une application. Il ne prouve aucune implémentation ni connexion. La spécification de démo décrit une étape future, pas une autorisation de la développer maintenant.

## 1. Lire et reconstruire le contexte

Lire dans cet ordre :
1. `README.md`, `00_CONTEXT/SOURCES_AND_DECISIONS.md` et les quatre documents de contexte.
2. `01_CORE/MASTER_CONFIG.md`, `DATA_MODEL.md`, `ATTRIBUTION_REVENUE.md`, `HUMAN_VALIDATION.md`.
3. W01 à W04, puis les fiches W05 à W12 marquées **À CONCEVOIR**.
4. Les modules, les verticales Nails et Pilates, les documents GHL.
5. `04_VERTICALS/NAILS/DEMO_SPEC.md` puis `06_DEMO/NOVIA_NAILS_DEMO/README.md`.

**Mise à jour du 3 novembre 2026** : W01 à W04 ont été fournis par le propriétaire et sont désormais SPECIFIED (voir `00_CONTEXT/SOURCES_AND_DECISIONS.md`, S6). Leurs délais et textes restent à configurer. La phase 1 (audit) est validée ; le développement de la Demo V1 attend la validation du plan.

Ne pas assimiler une ancienne proposition de l'assistant à une implémentation. Les sources accessibles sont partielles : W01 à W04 sont annoncés comme déjà définis, mais leurs anciennes séquences intégrales ne sont pas disponibles. Ne pas prétendre les avoir reconstituées intégralement. Les paramètres absents restent À CONFIRMER.

## 2. Comprendre la vision

NOVIA est un système modulaire de croissance, réservation, automatisation et relation client pour entreprises locales, notamment à rendez-vous et revenus récurrents. Première niche commerciale : Pilates / Pilates Reformer. Premier pilote terrain : une prothésiste ongulaire utilisant Planity. Ces deux choix sont complémentaires.

Modules envisagés : Booking, CRM, Workflows, Conversation AI, Voice, SmartFill, Retention, Reputation, Referral, Reactivation et Revenue. Le professionnel doit comprendre NOVIA sans devoir comprendre GoHighLevel.

## 3. Auditer sans modifier les autres projets

Si un environnement local est accessible, faire un audit en lecture seule : emplacement du workspace NOVIA, framework éventuel, composants, outils de build et tests déjà disponibles, contraintes et possibilités de réemploi. S'il n'est pas accessible, le dire et lister seulement les éléments nécessaires à un audit ultérieur. Ne pas prétendre avoir audité la machine depuis de simples documents.

Le propriétaire a déclaré disposer d'un environnement iOS/OpenCloud fonctionnel et avoir publié environ dix applications. Cela n'établit ni le framework disponible ici, ni la pertinence de le réutiliser. Ne pas copier l'usine existante. Ne modifier aucun autre projet, dépendance globale, configuration partagée ou infrastructure.

NOVIA doit rester dans son propre workspace. Ne pas installer de dépendances, créer d'application, lancer de migration, déployer, activer de compte ou connecter de service pendant cette première mission.

## 4. Règles non négociables

- Ne rien coder avant validation explicite de l'audit et du périmètre de développement.
- Ne pas activer GHL ni démarrer son essai. La durée d'environ 30 jours évoquée historiquement n'est pas une offre vérifiée.
- Ne pas connecter Planity, Stripe, SMS, Voice ou une API payante pour la démo.
- Ne pas supprimer ni recommander automatiquement de supprimer Planity : dépendances et acquisition inconnues.
- Ne pas développer d'application native NOVIA maintenant.
- Ne pas inventer le nom, l'adresse, les horaires, les prestations, les prix, les photos, les avis ou les résultats du salon. Toute donnée fictive doit être isolée, configurable et marquée « Démonstration NOVIA — données fictives ».
- Vérifier l'état actuel avant chaque action sensible : réservation récente, conversion, opposition, reprise humaine, séquences incompatibles et doublons.
- Ne jamais déduire présence ou absence du seul passage de l'heure du rendez-vous. Si le statut est inconnu, aucun message qui en dépend.
- Prévoir une reprise humaine capable d'interrompre l'automatisation.
- Ne pas présenter une réservation comme du revenu encaissé. Distinguer potentiel, réservé et confirmé.
- Ne pas filtrer l'accès aux avis honnêtes selon la satisfaction (pas de review gating).
- Ne pas transformer les simulations de W05 à W12 en workflows de production supposément définis.

## 5. Employer les statuts avec preuve

| Statut | Signification | Preuve attendue |
|---|---|---|
| DECIDED | Orientation ou règle retenue | Décision et source identifiées |
| SPECIFIED | Comportement décrit sur un périmètre explicite | Spécification et lacunes connues |
| MOCKED | Comportement simulé réellement disponible | Démo exécutable et limites affichées |
| IMPLEMENTED | Code réellement écrit | Fichiers et comportement identifiables |
| TESTED | Vérifications réellement exécutées | Résultats, date, version et périmètre |
| CONNECTED | Service externe effectivement relié | Preuve d'échange sur l'environnement nommé |
| PRODUCTION READY | Prêt pour l'usage réel sur un périmètre validé | Validation explicite, exploitation et limites vérifiées |

Ces statuts ne sont pas des synonymes ni une certification automatique. Un mock peut être implémenté et testé sans être connecté. Un service connecté peut ne pas être prêt pour la production. À ce stade, seules des décisions et spécifications documentaires sont livrées ; aucune démo n'est MOCKED, IMPLEMENTED, TESTED, CONNECTED ou PRODUCTION READY par ce pack.

Pour chaque élément, indiquer : statut, périmètre, source/preuve, manque éventuel et prochaine décision. Une proposition nouvelle doit être nommée **PROPOSITION À VALIDER**, jamais DECIDED.

## 6. Réponse attendue de la première mission

Rendre uniquement :
1. Compréhension de NOVIA et distinction pilote Nails / niche Pilates.
2. Décisions verrouillées, avec références aux fichiers.
3. Points ouverts, informations manquantes et contradictions éventuelles.
4. État documentaire de W01 à W04, sans inventer les séquences absentes.
5. Résultat de l'audit accessible et limites de cet audit.
6. Organisation du workspace et architecture proposées pour la future démo.
7. Informations réellement bloquantes, distinctes des données remplaçables par des mocks clairement identifiés.
8. Risques de surconstruction et préparation utile avant GHL.
9. Périmètre précis à faire valider avant le moindre développement.

Attendre ensuite l'autorisation explicite de développer. Une spécification, un exemple ou un ancien prompt « puis implémente » n'est pas cette autorisation.
