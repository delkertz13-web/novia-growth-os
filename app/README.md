# NOVIA Nails — Demo V1

Démonstration web autonome, mobile-first. **Toutes les données sont fictives. Aucun service externe n'est connecté** : ni GoHighLevel, ni Planity, ni Stripe, ni SMS, ni téléphonie.

## Lancer

Prérequis : Node 20 ou plus récent.

```bash
cd app
npm install
npm run dev        # http://localhost:5173 (accessible en Wi-Fi depuis un téléphone via l'adresse « Network » affichée)
npm test           # tests des règles métier
npm run build      # contrôle de types + build de production dans dist/
npm run preview    # sert le build
```

Espace cliente : `/`. Cockpit professionnel : `/pro`. Le bandeau « DÉMO » permet de passer de l'un à l'autre et de **réinitialiser la démo** (icône ↻).

## Remplacer les données de démonstration

| Quoi | Où |
|---|---|
| Nom, slogan, prénom, ville, adresse, téléphone, horaires, liens | `src/config/business.demo.ts` |
| Prestations, durées, prix, acomptes, délai de remplissage | `src/config/services.demo.ts` |
| Galerie, FAQ, politique d'annulation, avis fictifs | `src/config/content.demo.ts` |
| Visuels réalistes | déposer les fichiers dans `public/demo-media/gallery/` (voir le README de ce dossier) |
| Paramètres W01–W04 (rappels, délais, plafonds, plage d'envoi) | `src/config/rules.demo.ts` |
| Clientes, rendez-vous et scénario | `src/providers/mock/seed.ts` |

Chaque valeur de `business` porte un statut `unknown`, `demo` ou `verified`.

## Architecture

```
src/
├── config/      configuration centrale (données de démo remplaçables)
├── core/        règles métier pures et testées : statuts, validation, gardes W01–W04,
│                récupérations W03/W04, validation SMS, revenu, créneaux, SmartFill
├── providers/   6 interfaces (Booking, CRM, Messaging, Voice, Payment, Analytics)
│   └── mock/    6 implémentations Mock + store localStorage + jeu de données
├── ui/          composants partagés (bandeau démo, photo/placeholder, feuille, pastilles)
├── client/      espace cliente
└── pro/         cockpit /pro
```

## Inventaire des simulations

| Élément | Nature |
|---|---|
| Réservations, reports, annulations | Store local du navigateur (MockBookingProvider) |
| Contacts et déduplication | MockCRMProvider |
| Confirmations, rappels, messages de récupération | Consignés, jamais envoyés (MockMessagingProvider) |
| Preuve de paiement | Fictive, déclenchée à la main (MockPaymentProvider) |
| Séquences W03 / W04 | Avancées pas à pas par le bouton « Avancer le scénario » ; aucun minuteur réel |
| SmartFill | Simulation : règle d'éligibilité de démonstration, W12 reste à concevoir |
| Voice | Réglages seulement (MockVoiceProvider), pas d'écran dans ce jalon |
