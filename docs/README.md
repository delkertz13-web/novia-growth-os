# NOVIA — Growth OS

Pack documentaire prêt à transmettre — **3 novembre 2026**.

## Démarrage

1. Créer le projet Claude **NOVIA — Growth OS**.
2. Copier les champs fournis dans [PROJECT_SETUP.md](PROJECT_SETUP.md).
3. Ajouter les Markdown extraits de ce dossier, ou le fichier unique `NOVIA_IMPORT_COMPLET.md` fourni séparément. Le ZIP est un format de transfert ; son import direct dans Claude n'a pas été vérifié.
4. Demander la lecture de [CLAUDE_START_HERE.md](CLAUDE_START_HERE.md).
5. Recevoir l'assimilation et l'audit, puis valider explicitement avant tout développement.

## Ce qui est livré

Documentation structurée et préremplie : vision, architecture, règles, roadmap, cœur métier, douze fiches workflows, modules, verticales, préparation GHL et cahier des charges de la démo. Aucun code de démo, aucune intégration, aucune donnée réelle du salon.

**W01–W04 :** spécifiés par le propriétaire le 3 novembre 2026 (source S6) ; délais, plafonds et textes restent À CONFIGURER / À RÉDIGER. W05–W12 sont À CONCEVOIR, sans séquence inventée. Voir [sources et décisions](00_CONTEXT/SOURCES_AND_DECISIONS.md).

## Décisions clés

- Pilates / Pilates Reformer : première niche commerciale. Nails : premier pilote terrain.
- NOVIA est un produit modulaire ; GHL est un moteur futur possible, non activé.
- Démo web mobile autonome après validation, avec données fictives remplaçables.
- État actuel, reprise humaine, preuve de présence et attribution prudente gouvernent le système.
- Pas de code maintenant, pas d'application native, pas d'autre projet modifié.

## Statut réel du pack

DECIDED et SPECIFIED concernent les orientations et documents. Aucun composant produit n'est livré comme MOCKED, IMPLEMENTED, TESTED, CONNECTED ou PRODUCTION READY. Une vérification de l'intégrité des fichiers du pack ne constitue pas un test de NOVIA.

Les mots À RENSEIGNER, À CONFIRMER, À CONCEVOIR et PROPOSITION À VALIDER indiquent une absence de décision ou de donnée. Ne pas les remplacer par des suppositions.

## Arborescence

```text
NOVIA/
├── CLAUDE_START_HERE.md
├── README.md
├── PROJECT_SETUP.md
├── 00_CONTEXT/
│   ├── NOVIA_VISION.md
│   ├── NOVIA_ARCHITECTURE.md
│   ├── NOVIA_RULES.md
│   ├── NOVIA_ROADMAP.md
│   └── SOURCES_AND_DECISIONS.md
├── 01_CORE/
│   ├── MASTER_CONFIG.md
│   ├── DATA_MODEL.md
│   ├── ATTRIBUTION_REVENUE.md
│   └── HUMAN_VALIDATION.md
├── 02_WORKFLOWS/
│   ├── W01_NEW_LEAD.md
│   ├── W02_APPOINTMENT.md
│   ├── W03_CANCELLATION.md
│   ├── W04_NO_SHOW.md
│   ├── W05_SATISFACTION.md
│   ├── W06_CONVERSION.md
│   ├── W07_ONBOARDING.md
│   ├── W08_REFERRAL.md
│   ├── W09_REPUTATION.md
│   ├── W10_REACTIVATION.md
│   ├── W11_RETENTION.md
│   └── W12_SMARTFILL.md
├── 03_MODULES/
│   ├── BOOKING.md
│   ├── VOICE.md
│   ├── CONVERSATION_AI.md
│   ├── SMARTFILL.md
│   └── REVENUE_DASHBOARD.md
├── 04_VERTICALS/
│   ├── NAILS/
│   │   ├── NAILS_CONFIG.md
│   │   ├── CUSTOMER_JOURNEY.md
│   │   └── DEMO_SPEC.md
│   └── PILATES/
│       └── PILATES_CONFIG.md
├── 05_GHL/
│   ├── GHL_ARCHITECTURE.md
│   ├── GHL_MOBILE.md
│   └── FUTURE_INTEGRATION.md
└── 06_DEMO/
    └── NOVIA_NAILS_DEMO/
        └── README.md
```

## Lecture recommandée

Instructions initiales → contexte et sources → cœur métier → W01–W04 → W05–W12 → modules → Nails et Pilates → GHL → README de préparation de la démo.

## Compléments utiles plus tard

Textes et valeurs de paramètres de W01–W04, documentation/formation GHL pertinente, informations validées de la professionnelle et éléments nécessaires à un audit local ciblé. Ne pas importer les autres projets ou l'usine iOS entière.
