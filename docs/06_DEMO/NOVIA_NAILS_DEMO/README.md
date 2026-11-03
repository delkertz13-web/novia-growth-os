# Préparation de NOVIA Nails Demo

**Ce dossier ne contient volontairement aucun code, aucune dépendance et aucun exécutable.** La démo n'est pas encore construite. Aucun lancement, build ou test produit n'est possible à partir de ce README.

## À lire avant tout développement

1. `../../CLAUDE_START_HERE.md` : mission initiale et validation avant code.
2. `../../00_CONTEXT/NOVIA_ARCHITECTURE.md` : séparation UI/métier/providers.
3. `../../04_VERTICALS/NAILS/DEMO_SPEC.md` : cahier des charges complet.
4. `../../04_VERTICALS/NAILS/NAILS_CONFIG.md` : inconnues et contenus fictifs.
5. `../../01_CORE/HUMAN_VALIDATION.md` et `ATTRIBUTION_REVENUE.md` : règles centrales.

## Mission préparatoire

Auditer en lecture seule l'environnement accessible, identifier le framework et les composants pertinents, proposer une architecture proportionnée, préciser les mocks et les données nécessaires. Si aucun environnement n'est accessible, ne pas inventer l'audit. Soumettre ce périmètre au propriétaire et attendre sa validation explicite avant de créer du code.

## Après autorisation seulement

Développer ici une démo web autonome comprenant espace cliente, réservation simulée, cockpit `/pro`, validations, SmartFill, retour, messages, Voice et Revenue. Ne pas connecter GHL/Planity/Stripe/SMS/téléphonie. Toute intégration reste simulée et identifiée.

## À documenter lors du futur développement

Choix technique justifié, procédure réelle de lancement, fichiers de configuration, inventaire des mocks, limites, résultat du build et des vérifications. Ne pas ajouter aujourd'hui des commandes `npm` ou autres supposant un framework non choisi.

État actuel : documentation SPECIFIED ; démo non MOCKED, non IMPLEMENTED, non TESTED, non CONNECTED, non PRODUCTION READY.

## Mise à jour du 3 novembre 2026

Le développement a été autorisé par le propriétaire. Le code de la démo vit dans `app/` à la racine du dépôt (voir `app/README.md`). Premier jalon : parcours cliente (accueil → réservation → confirmation) et parcours professionnelle (dashboard → validation → action NOVIA → SmartFill / récupération → Revenue), tout en mocks.
