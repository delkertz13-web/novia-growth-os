# NOVIA — P1 : refactoring pilot-ready, sans connexion

Branche `pilot/p1-refactor`, empilée sur la démo figée (`claude/project-thread-lcup8r`, commit 830c871, PR #3 non fusionnée).
P1 ne connecte **aucun** service réel : pas de GHL, pas de Planity, pas de SMS, pas d'appel, pas de paiement, pas de backend déployé.
Aucune dépendance ajoutée.

---

## 1. Architecture : avant / après

**Avant (démo figée)**

```
UI React ──► domain (façade synchrone) ──► SyncProvider « mock » (store + orchestration + règles d'envoi)
                                       └─► config/*.demo.ts importés partout
```

Le provider Mock portait à la fois les données, l'orchestration (statuts → workflows → messages) et des
morceaux de règles. Les calculs d'heure utilisaient le fuseau de l'appareil.

**Après (P1)**

```
UI React ──► domain (intentions métier async, lectures sync)
               └─► engine  : entrée → isolation → inbox → version → décision (Tx) → outbox → dispatch
                     ├─► core      : règles pures (workflows, consentement, revenu, triage, temps)
                     ├─► store     : port NoviaStore (mémoire aujourd'hui, API NOVIA + PostgreSQL en P2)
                     └─► providers : transport technique uniquement (Mock ; GHL / SMS direct / Voice / Paiement / Planity préparés, non connectés)
Composition choisie au build : NOVIA_MODE=demo|pilot (src/app/demo.ts | src/app/pilot.ts)
```

Frontières vérifiées automatiquement par `src/architecture.test.ts` (voir §10).

## 2. Orchestration déplacée

Tout ce que faisait le Mock est maintenant dans `src/engine/orchestration.ts`, en fonctions qui écrivent dans une
transaction (`Tx`) : création de contact et de RDV (contrôle de créneau au moment de l'écriture), statuts réels
(présente / absente / annulée / reportée), démarrage, pause, reprise et arrêt de W03/W04, SmartFill (entonnoir,
exclusion des opposées), conversations (tri sensible > FAQ > inconnu, STOP), Voice, paiement déclaré, réglages,
rappels W02.

- Le moteur décide, puis **l'outbox** porte les envois ; le dispatcher (`engine/dispatch.ts`) appelle les providers
  **hors** transaction et réapplique les résultats sur l'état frais.
- `core` reste pur (aucun import d'engine, de providers, de React ou de la démo).
- Les providers ne contiennent plus aucune règle métier.

## 3. Contrats providers V2

`src/providers/types.ts`. Toutes les méthodes sont asynchrones et renvoient `ProviderResult<T>` :
`{ ok: true, value }` ou `{ ok: false, error: { code, message, retryable } }`.

- Les requêtes d'écriture portent `businessId` et `idempotencyKey`. Les réponses portent `externalRef`.
- Codes d'erreur typés : `not_connected`, `rate_limited`, `unavailable`, `invalid_request`, `rejected`, `unexpected`…
  Une exception levée par un provider devient `unexpected` (retentable) : **aucune exception n'atteint l'UI**.
- Retentable : réessayé jusqu'à 5 fois, puis échec définitif. Non retentable : échec immédiat, jamais rejoué.
- Interfaces : `MessagingProvider.send`, `CrmMirrorProvider` (upsertContact, setOptOut), `VoiceProvider.configure`,
  `PaymentProvider.createPaymentLink`, `ExternalCalendarProvider.listBusy`, `ClockProvider`.
- `AnalyticsProvider` est **supprimé** : NOVIA calcule ses revenus elle-même.
- Implémentations :
  - Mock : seule implémentation active, avec un registre des écritures, un rejeu idempotent et une injection de pannes.
  - GHL (messaging, CRM miroir, Voice) et futurs (SMS direct, Voice, paiement, Planity) : chaque méthode répond `not_connected`.
- La messagerie est interchangeable : un test remplace la messagerie par un « SMS direct » sans toucher ni au moteur ni au domaine.
- GHL n'est pas figé en « simple fournisseur SMS » : les contrats CRM miroir et Voice existent déjà.

## 4. BusinessProfile

`src/config/profile.ts`, injecté dans le moteur. Il contient :

- l'identité, le fuseau, les prestations, les pauses, les règles de réservation et d'annulation ;
- les règles des workflows, SmartFill et Voice ;
- le consentement, l'attribution et les réglages par défaut ;
- les **textes des messages** (modèles), les réponses approuvées et les mots sensibles.

Chaque donnée porte son statut : `unknown`, `demo` ou `verified`.

- **Hors simulation, une donnée non vérifiée bloque l'automatisation qui en dépend.** La décision est journalisée « bloqué » et rien n'est envoyé.
- `businessId` est présent sur toutes les entités. Le store refuse de changer d'entreprise. Le moteur refuse un profil d'une autre entreprise et un événement d'une autre entreprise.
- Le profil pilote (`src/pilot/profile.ts`) n'invente rien : tout est `unknown`, il n'y a aucune prestation et toutes les automatisations sont coupées.
- Pas de grand écran de réglages : le profil est une donnée, saisie plus tard (P2/P3).

## 5. Fuseau horaire

`src/core/time.ts` : toutes les dates sont calculées dans le **fuseau du salon**, jamais dans celui de l'appareil ou du serveur. Cela couvre la journée, la semaine, les créneaux, la plage d'envoi, les rappels, le « mois » du revenu et l'affichage.

- La démo vit à l'heure murale « jeudi 19 novembre 2026, 15h10, Europe/Paris », quel que soit l'appareil.
- `core/time.test.ts` vérifie les allers-retours aux changements d'heure (mars et octobre), les journées de 23 h / 25 h, et des résultats identiques sous Paris, New York et Tokyo.
- Toute la suite de tests passe sous 6 fuseaux de processus : Paris, New York, Tokyo, UTC, Los Angeles, Kiritimati (UTC+14). La commande est `npm run test:tz`.
- Aucun appel `getHours` / `getDate` / … n'existe hors de `core/time.ts` dans core, engine, domain, providers, config, pilot ou app. Un test le garantit.
- Rejeu navigateur de la démo avec un iPhone réglé sur New York, puis sur Tokyo : 33/33, captures identiques.

## 6. Séparation démo / pilote

- Tout ce qui est démo vit dans `src/demo/` : configuration, seed, store, contrôles de simulation, appelants scriptés, bandeau et mode présentation.
- Il n'y a plus de `config/*.demo.ts`.
- `VITE_NOVIA_MODE=demo|pilot` choisit la composition au build. Les alias `@novia/runtime` et `@novia/shell` pointent vers `src/app/demo*` ou `src/app/pilot*`.
- Scripts : `npm run dev:pilot` et `npm run build:pilot`.
- Garde-fou : aucun fichier hors de `src/demo` et `src/app/demo*` n'importe la démo (test d'architecture).
- Bundle pilote vérifié :
  - aucune donnée de démo (« Julie », « NOVIA Nails », « Léa », la clé de stockage démo, les textes des messages) ;
  - 11 écrans ouverts sans erreur avec un profil vide ;
  - aucune requête réseau.
- Pilote P1 : exécution **shadow**, heure système lue dans le fuseau du salon, base locale au navigateur (en attendant l'API + PostgreSQL), providers Mock uniquement, `novia.demo = null`.

## 7. Événements et commandes

`src/engine/events.ts` : une enveloppe commune (`eventId`, `businessId`, `source`, `occurredAt`, `externalRefs`, `version`).

- **15 événements**, soit 13 externes et 2 internes :
  - `ContactUpserted`, `BookingCreated`, `BookingRescheduled`, `BookingCancelled`, `AttendanceRecorded` ;
  - `InboundMessageReceived`, `MessageDeliveryUpdated`, `ConsentChanged`, `HumanTakeoverChanged` ;
  - `VoiceCallCompleted`, `PaymentRecorded`, `OpportunityClosed`, `SettingsChanged` ;
  - `SequenceStepDue` et `ReminderDue` (internes).
- **4 commandes** : `LaunchSmartFill`, `ReplyAsPro`, `OpenConversation`, `MarkConversationRead`.
- Il n'y a pas d'event sourcing : l'état reste la vérité, et les événements sont dédupliqués et journalisés.
- Les RDV Voice, SmartFill et récupération passent tous par `BookingCreated` avec une `origin`. Il n'y a pas d'événement à part, donc pas de double comptage.

## 8. Consentement

`src/core/consent.ts` : un registre en **ajout seul** par cliente (canal, finalité, état, source, preuve, date). `optOut` n'est qu'une projection du registre.

Règle STOP inchangée :

- STOP bloque tout envoi **initié par NOVIA**.
- STOP ne bloque pas les réponses aux demandes de la cliente.
- STOP n'est **jamais** levé par une réservation (même case cochée) ni par une conversation.
- Seule une réinscription explicite **avec preuve** lève STOP. Sans preuve, la demande est refusée.

Un STOP reçu par SMS est inscrit avec la référence du message, puis reflété dans le miroir CRM (Mock).

## 9. Idempotence

- **Entrées** : inbox `(source, eventId)`. Un événement externe reçu deux fois n'est traité qu'une fois, et le doublon est journalisé.
- **Versions** :
  - un événement fondé sur une version de RDV plus ancienne est ignoré (« périmé ») ;
  - un statut de livraison « sent » arrivé après « delivered » est ignoré.
- **Sorties** : chaque envoi a une clé déterministe, ce qui empêche de rejouer deux fois la même décision :
  - `W02:confirmation:<rdv>`
  - `W02:reminder:<rdv>:<h>h:<début>` (un report change la clé)
  - `<workflow>:<run>:step<n>`
  - `reply:<conversation>:<message>`
  - `crm:upsert:<cliente>`
- Le Mock rejoue une écriture déjà faite sans second effet, comme le fera un fournisseur réel avec `idempotencyKey`.

## 10. Tests

- **208 tests verts**, contre 168 avant P1 :
  - les 168 d'origine passent, avec leurs assertions métier inchangées (seule leur mise en place a été adaptée au moteur async et au fuseau) ;
  - 40 nouveaux tests s'y ajoutent.
- `engine/engine.test.ts` (24) couvre :
  - l'orchestration hors des providers et la messagerie interchangeable ;
  - l'idempotence (inbox, clés, rejeu Mock), les versions et le désordre de livraison ;
  - les pannes retentables / définitives, l'exception imprévue et la limite de 5 essais ;
  - l'isolation de deux entreprises ;
  - le profil injecté et le blocage des données non vérifiées ;
  - le consentement ;
  - le mode shadow et l'ordonnanceur de rappels ;
  - le paiement déclaré et Voice jamais confirmé automatiquement.
- `core/time.test.ts` (7) couvre le fuseau, les changements d'heure, et un seed, des créneaux et des revenus identiques sous 3 fuseaux.
- `architecture.test.ts` (9) vérifie :
  - aucun import de la démo dans le code générique ;
  - core pur, engine sans UI, providers sans règle métier, UI sans provider ;
  - aucun `AnalyticsProvider` ;
  - aucun calcul dans le fuseau local ;
  - une composition pilote vide et en shadow.
- Tous les tests bloquent `fetch`, `XMLHttpRequest` et `WebSocket` : aucun réseau.

## 11. Build

- `tsc -b` et `vite build` passent en mode démo et en mode pilote.
- L'avertissement « chunk > 500 kB » existait déjà.

## 12. Poids (gzip, même méthode, démo figée 830c871 reconstruite)

| | Démo figée | P1 démo | P1 pilote |
|---|---|---|---|
| JS | 156,6 Ko | 163,3 Ko (+6,6 Ko, +4 %) | 153,8 Ko |
| CSS | 19,3 Ko | 19,3 Ko (identique) | 19,3 Ko |

## 13. Parcours DÉMO

Rejeu navigateur complet du parcours commercial (iPhone 13, Europe/Paris) : **33/33**.

- Côté cliente : réservation.
- Côté pro : absente, récupération, SmartFill, Voice, messages, revenus.
- Reset, rechargement, aucun réseau externe.
- KPI de référence intacts : **295 réservé / 35 confirmé / 80 à récupérer / 245 gagné**.

Captures comparées aux 27 captures du Lot 7 :

- 24 sont identiques au bit près.
- 3 diffèrent seulement sous le seuil de perception : la galerie, l'entonnoir animé et l'appel en cours. L'écart est un anti-aliasing d'image ou d'animation, au maximum 293 pixels, invisible côte à côte.

Le même rejeu avec l'appareil réglé sur New York, puis sur Tokyo, donne 33/33 et des captures identiques.

## 14. Limites (assumées, hors P1)

- **Base** : la composition pilote garde l'état dans le navigateur (store mémoire et persistance locale). Le port `NoviaStore` est prêt, mais l'API NOVIA et PostgreSQL relèvent de P2.
- **Ordonnanceur** : `engine.tick()` existe et il est testé (rappels dus, sans doublon). Rien ne l'appelle périodiquement en pilote. En démo, le temps avance par les contrôles de simulation.
- **Ordre des webhooks** : seules les versions et la règle « delivered » sont traitées. Le cas « annulation reçue avant la création » (audit §4.2) reste à faire avec le vrai webhook.
- **Voice** : l'outil de réservation exposé par NOVIA au fournisseur (`checkAvailability`, `requestBooking`) n'est pas écrit. En démo, l'appel réserve via `BookingCreated` d'origine `voice`.
- **Rapport shadow** : `shadowReport()` existe (« aurait envoyé », « aurait démarré », « éligible SmartFill », « bloqué par STOP »), mais sans écran.
- **Textes de l'UI** : en mode pilote, quelques libellés disent encore « démonstration » ou « simulation » (réglages, revenus, Voice, galerie). Ce sont des textes, pas des données. Ils seront à reprendre avec l'écran pilote.
- **Planity (scénario A)** : seul le contrat `ExternalCalendarProvider.listBusy` existe, non connecté.
- **Question encore ouverte** (6 nov.) : les rappels de RDV à une cliente STOP restent envoyés comme messages de service.
- **QA** : le test réel iPhone / Safari reste à faire. Il n'est pas bloquant.

## 15. État de la PR

- Nouvelle PR depuis `pilot/p1-refactor`, avec pour base `claude/project-thread-lcup8r` (la démo figée), afin que le diff ne montre que P1.
- **Non fusionnée.**
- PR #3 n'est pas modifiée.
- Pas de P2, pas de déploiement, pas de compte externe, pas d'essai GHL.

---

### Ajustements de l'audit (PILOT-ARCHITECTURE-AUDIT.md)

- **Commandes** : `LaunchSmartFill`, `ReplyAsPro`, `OpenConversation` et `MarkConversationRead` sont des commandes, pas des événements. L'audit le laissait entendre pour SmartFill. P1 l'étend aux actions de conversation.
- **MessagingProvider** : `deliveryStatus(id)` n'existe pas. Les statuts arrivent uniquement par l'événement `MessageDeliveryUpdated`, ce qui fait une seule voie et pas de lecture active.
- **CRM miroir** : il se limite à `upsertContact` et `setOptOut` (la « liste ne pas déranger »). `findByPhoneOrEmail` est inutile tant que NOVIA fait autorité sur les clientes. Il reviendra si GHL reçoit des contacts créés à la main.
- **Type d'entrée** : il s'appelle `InputSource`. Le nom `EventSource` entrait en conflit avec l'API navigateur du même nom, et le test « aucun réseau » le signalait.
- **Paiement** : la preuve est `demo_payment` (démo), `declared` (pilote, déclarée par la pro) ou `online` (plus tard). En pilote, « payé » signifie donc « déclaré par la pro », jamais encaissé par NOVIA.
- Aucune autre hypothèse de l'audit n'a été démentie.
