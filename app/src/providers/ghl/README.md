# Providers GHL — préparés, non connectés

Le cockpit NOVIA Pro est le vrai front-end de NOVIA. GoHighLevel sera un backend parmi d'autres, derrière les interfaces de `src/providers/types.ts`.

```
UI React  →  domaine NOVIA (src/domain)  →  interfaces Providers  →  Mock (aujourd'hui) | GHL (plus tard)
```

Aucune connaissance de GHL ne doit sortir de ce dossier : ni identifiant, ni nom de champ, ni logique de workflow dans un composant React ou dans `src/domain`.

## Correspondances prévues (à confirmer au moment de l'intégration)

| Interface NOVIA | Côté GHL (pressenti) | Notes |
|---|---|---|
| `BookingProvider` | Calendars, Appointments | `validate` écrit le statut réel (présente, absente, annulée, reportée) dans un champ personnalisé, jamais déduit de l'heure. |
| `CRMProvider` | Contacts | Déduplication téléphone/email (W01). `setHumanTakeover` = champ personnalisé + pause des workflows. |
| `MessagingProvider` | Conversations | `simulateSend` deviendra un envoi réel uniquement hors mode DÉMO, avec consentement et plage d'envoi. |
| `AnalyticsProvider` | Opportunities + calcul NOVIA | Les trois niveaux (potentiel, réservé, confirmé) restent calculés par `src/core/revenue.ts`. |
| `AutomationProvider` | Workflows, Opportunities (pipeline NOVIA) | SmartFill et récupérations W03/W04. |
| `SyncProvider` | Cache local alimenté par l'API et les webhooks | Le cockpit lit un instantané et s'abonne aux changements. |
| `VoiceProvider` | Fournisseur voix à choisir (`src/providers/future`) | |
| `PaymentProvider` | Prestataire de paiement à choisir (`src/providers/future`) | Preuve de paiement pour le CA confirmé. |

`DemoControls` (avancer une séquence, simuler une réponse de cliente, réinitialiser) n'existe qu'en démonstration : un backend réel ne le fournit pas, et le cockpit masque alors ces boutons.

Les secrets (clé API, jetons) ne seront jamais dans le navigateur : l'implémentation réelle passera par un serveur NOVIA.
