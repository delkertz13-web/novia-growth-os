# P2 — NOVIA PILOT BACKEND + SHADOW MODE PERSISTANT

Rapport de fin de P2. Branche `pilot/p2-backend`, partie de P1 fusionné (`0d8690f`).

**Chaîne livrée :** NOVIA Pilot (navigateur) → API NOVIA → PostgreSQL 16 → shadow mode persistant.

Le Pilot ne dépend plus du stockage du navigateur comme source de vérité. Le seul élément local est l'établissement choisi sur l'appareil, qui est une préférence d'affichage.

**Rien n'est connecté :**
- ni GHL ;
- ni Planity ;
- ni SMS, ni Voice, ni paiement réels ;
- ni API marketing.

Aucune cliente réelle ne peut recevoir quoi que ce soit : le code n'a aucun transport et la base refuse tout statut « envoyé ».

---

## 1. Infra choisie et pourquoi

**Choix : Scaleway, région Paris (fr-par).**

| Brique | Service | Rôle |
| --- | --- | --- |
| API, ordonnanceur et front pilote | Serverless Containers | Une image Docker, `min-scale = 1`, `max-scale = 1` |
| Base | Managed Database for PostgreSQL 16 | Sauvegardes automatiques, TLS |
| Secrets | Secret Manager | `DATABASE_URL`, `MIGRATION_DATABASE_URL` |

**Pourquoi Scaleway :**
- les données restent en France, chez un hébergeur européen ;
- PostgreSQL est managé, avec sauvegardes automatiques ;
- les secrets sont gérés ;
- l'exploitation reste minimale ;
- aucun SDK propriétaire dans le code : l'hébergeur est remplaçable par toute plateforme qui exécute une image Docker et un PostgreSQL 16.

**Alternatives écartées :**
- **Render** : la région UE n'est pas affichée clairement sur sa page tarifaire.
- **VPS Hetzner** : sauvegardes et mises à jour à notre charge.

**Prérequis :** le déploiement réel demande un compte Scaleway créé par toi. Je n'en ai pas créé, et rien n'est déployé.

## 2. Coût estimé du pilote

Prix publics relevés le 2026-11-15. Hypothèse : un conteneur 0,25 vCPU / 512 Mo allumé en continu, soit environ 2,63 M s par mois.

| Poste | Calcul | €/mois |
| --- | --- | --- |
| Conteneur, CPU | 657 k vCPU·s − 200 k gratuits = 457 k × 0,00001 € | ≈ 4,6 |
| Conteneur, mémoire | 1,31 M Go·s − 400 k gratuits = 914 k × 0,000002 € | ≈ 1,8 |
| Secret Manager | 2 secrets × 0,04 € (+ appels négligeables) | ≈ 0,1 |
| PostgreSQL managé, plus petite instance | **à confirmer** (la page de prix n'a pas pu être lue) | ? |

**Total :** environ 6,5 € par mois, plus le prix de la base. Le prix de la base est à confirmer sur la page tarifaire de Scaleway avant commande. Je ne l'invente pas.

## 3. Architecture

```
Navigateur pilote ──HTTPS──▶ API (server/http)
   moteur DISTANT                │  auth passkey · validation liste blanche · rôle · limites
   (src/pilot/remote.ts)         ▼
                         Application (server/application/novia.ts)
                                 │  1 requête = 1 transaction de L'entreprise (verrou)
                                 ▼
                         Moteur NOVIA (src/engine) ──▶ règles pures (src/core)
                                 │  exécution « shadow », envois différés (outbox)
                                 ▼
                         Repositories (server/repositories) ──▶ PostgreSQL (RLS)
```

**Le moteur est le même que dans la démo.** Aucune règle n'est réécrite en SQL : STOP, attribution, SmartFill, reprise humaine et paiement restent dans le moteur.

**Déroulé d'une requête :**
1. Transaction PostgreSQL de l'entreprise : `set_config('novia.business_id')`, puis verrou `FOR UPDATE` sur la ligne entreprise.
2. Chargement de l'état.
3. Passage par le moteur.
4. Enregistrement de la différence.
5. Resynchronisation des échéances.
6. Révision + 1.

**Le domaine ne dépend d'aucun SDK d'hébergeur.** L'infrastructure n'est qu'un adaptateur (`server/infra`).

**Démo et pilote : un seul aiguillage au build.** `@novia/runtime` pointe vers `src/app/demo.ts` ou `src/app/pilot.ts`. Les écrans sont chargés après `bootstrap()` (`src/main.tsx` puis `src/router.tsx`).

## 4. Schéma de données

`server/migrations/0001_schema.sql` contient 27 tables.

| Famille | Tables |
| --- | --- |
| Métier | `businesses`, `business_profiles`, `business_settings`, `customers`, `consent_records`, `appointments`, `payments`, `sequences`, `sequence_actions`, `human_takeovers`, `opportunities`, `waitlist_entries`, `conversations`, `messages`, `voice_calls`, `external_refs` |
| Traçabilité | `audit_log`, `shadow_decisions` |
| Fiabilité | `inbox_events`, `outbox_messages`, `scheduled_jobs` |
| Accès | `users`, `memberships`, `webauthn_credentials`, `sessions`, `invitations`, `auth_challenges` |

**Clés et isolation :**
- clés composites `(business_id, id)` ;
- clés étrangères qui incluent toujours `business_id`.

**Ce que la base interdit elle-même :**
- `businesses.execution_mode` = `'shadow'` uniquement ;
- `outbox_messages.status` sans `sent` ni `done` ;
- `messages.status` sans `sent` ni `delivered` ;
- `payments.kind` = `'declared'` uniquement.

**Tables en ajout seul (déclencheurs) :** `consent_records`, `sequence_actions`, `human_takeovers`, `shadow_decisions` et `audit_log`.

Pas d'event sourcing complet : on stocke un état plus des journaux.

## 5. Migrations

**Fonctionnement :**
- fichiers versionnés `server/migrations/NNNN_*.sql` ;
- table `novia_schema_migrations` avec empreinte de chaque fichier ;
- verrou consultatif : deux démarrages simultanés ne migrent pas deux fois ;
- une migration déjà appliquée puis modifiée est **refusée**.

**Parcours prouvé :** base vide → `migrate` → `create-business` → état valide.
- Prouvé par `migrate.test.ts`.
- Rejoué pour de vrai avec le CLI construit (`dist-server/cli.js`) sur un PostgreSQL 16 neuf.

## 6. Auth

**Passkeys (WebAuthn), sans mot de passe, sans e-mail ni SMS.** Elles résistent à l'hameçonnage et, sur iPhone, se synchronisent par le trousseau iCloud. Bibliothèque : `@simplewebauthn` 14.

**Entrée par invitation :**
- à usage unique, valable 72 h ;
- seule l'empreinte SHA-256 du jeton est en base ;
- le lien passe le jeton dans le fragment `#`, qui n'est jamais journalisé et est effacé de l'adresse après usage ;
- l'invitation fixe l'entreprise et le rôle ;
- elle est créée par l'exploitant (CLI) ou par une OWNER connectée.

**Session :**
- jeton de 256 bits, cookie `HttpOnly`, `Secure` (en HTTPS), `SameSite=Strict`, durée 30 jours ;
- seule l'empreinte est en base ;
- la déconnexion supprime la session.

**Rôles :**
- **OWNER** : tout, plus les invitations, le profil, l'audit, les événements de test, l'export et l'anonymisation ;
- **PRO** : les commandes du cockpit.

Chaque requête relit l'appartenance en base. `businessId` n'est jamais sous le contrôle du seul navigateur.

## 7. Isolation métier

Trois couches :

1. **API.** L'appartenance est vérifiée à chaque requête. Une autre entreprise reçoit 403, sans indiquer si elle existe.
2. **Application.** Toute écriture passe par la transaction d'UNE entreprise. Le moteur refuse un état qui changerait d'entreprise.
3. **PostgreSQL.**
   - RLS `FORCE` sur toutes les tables métier ;
   - politique `business_id = current_setting('novia.business_id')` ;
   - l'API se connecte avec un rôle applicatif sans BYPASSRLS ;
   - ce rôle n'a pas de DELETE sur l'historique.

**Tests sur vraie base :**
- avec le contexte A, aucune lecture, modification ni insertion chez B ;
- sans contexte, zéro ligne ;
- côté HTTP, 403 sur une autre entreprise.

Rien n'est codé pour Nails : le profil de l'établissement est une donnée.

## 8. Repositories

| Fichier | Rôle |
| --- | --- |
| `state.ts` | Chargement de l'état et enregistrement de la différence, table par table, en requêtes paramétrées |
| `business.ts` | Création et profil |
| `jobs.ts` | Échéances |
| `audit.ts` | Journal |

**Mémoire de travail bornée :**
- 50 derniers messages par conversation ;
- 200 dernières entrées de journal ;
- l'export, lui, lit tout l'historique.

**Le store mémoire (`createMemoryStore`) reste disponible :**
- pour la démo ;
- pour les 214 tests du front ;
- pour le faux serveur du test du front pilote.

**Aller-retour prouvé :** l'état riche de la démo (clientes, RDV, séquences, conversations, consentements) est relu à l'identique depuis PostgreSQL (`persistence.test.ts`).

## 9. Inbox

**Table `inbox_events`.** Clé `(business_id, source, event_id)`.

**Champs :** source, eventId, businessId, occurredAt, receivedAt, type, payload minimisé (corps et coordonnées non conservés), statut (`received`, `processed`, `rejected` ou `failed`) et erreur.

**Dédoublonnage :** le même événement reçu 3 fois n'est traité qu'une fois. Les doublons sont tracés (`inbox.duplicate`). C'est testé.

**Origine des événements en P2 :** uniquement des événements de TEST du pilote (`POST /api/b/:id/test-events`, OWNER, source forcée `pilot-test`).

**Événement périmé :** une version plus ancienne que celle de l'entité est ignorée et journalisée. C'est testé.

## 10. Outbox

**Table `outbox_messages`.** Clé d'idempotence = clé de la décision.

**Champs :** idempotencyKey, statut, nombre de tentatives, dates, payload minimal (canal, finalité, ids, sans corps).

**Traitement :**
- la file est traitée APRÈS la validation de la transaction ;
- les éléments passent en `shadow` (« aurait envoyé ») ;
- aucun transport n'existe.

**Garanties testées :**
- une même échéance rejouée 3 fois ne donne qu'une ligne ;
- `update … set status = 'sent'` est refusé par la base.

## 11. Ordonnanceur

**Table `scheduled_jobs`.** Elle porte les rappels W02 et les étapes des séquences W03/W04.

**Calcul :** `expectedJobs(state)`, une fonction pure du moteur, est relue après chaque transaction. Elle crée, reporte et annule les échéances devenues sans objet (RDV annulé, reprise humaine…).

**Exécution :** dans le processus, toutes les 30 s. Une échéance est exécutée dans la transaction de son entreprise. Le moteur RELIT toutes les gardes au moment de l'exécution : une échéance n'est qu'un réveil, jamais une autorisation.

**Comportements testés :**
- survit à un redémarrage (nouvelle connexion, nouvelle application, même base) ;
- ne s'exécute qu'une fois ;
- reprend après une panne (délai croissant), puis passe `failed` après 5 essais ;
- un RDV annulé annule ses rappels.

**Correctif apporté pendant P2 :** une panne de la BASE pendant une échéance était transformée en simple refus par le moteur. Elle annule maintenant toute la transaction.

Pas d'infrastructure distribuée.

## 12. Shadow mode

**Table `shadow_decisions`.** Chaque décision NOVIA y est enregistrée.

**Champs :** quand, entreprise, cliente/RDV, workflow, action, résultat `WOULD_EXECUTE` ou `BLOCKED`, raison, gardes évaluées (`[{name, ok}]`), type d'entrée.

**Gardes évaluées :**
- RDV d'origine valable ;
- pas de nouveau RDV ;
- pas d'opposition (STOP) ;
- consentement ;
- pas de reprise humaine ;
- pas d'autre suivi ;
- plage d'envoi.

**Valeur de profil inconnue → `BLOCKED`.** Raison : « Donnée du profil inconnue : à fournir et vérifier avec l'établissement. »

Aucune donnée de démo. Lecture par `GET /api/b/:id/shadow-decisions`.

**Testé :**
- absence → relance W04 `WOULD_EXECUTE` (« aurait envoyé… rien n'est sorti du serveur ») ;
- STOP avant l'échéance → `BLOCKED` « opposition », avec la garde STOP à `false` ;
- reprise humaine → `BLOCKED` ;
- profil inconnu → `BLOCKED`.

## 13. Audit

**Table `audit_log`, en ajout seul.** Champs : qui, quoi, quand, entreprise, entité.

**Ce qui est journalisé :**
- chaque commande : consentement, STOP, réinscription, reprise humaine et rendu, présence/absence, changement de RDV, paiement déclaré, réglages ;
- chaque événement entrant et chaque doublon ;
- les pannes d'échéance ;
- les invitations et inscriptions ;
- les exports et anonymisations ;
- les profils vérifiés.

Les décisions shadow ont leur propre table.

**Aucune donnée personnelle inutile :** pas de corps de message ni de coordonnées. C'est testé : l'adresse e-mail n'apparaît pas dans le journal.

## 14. Consentement

**Registre `consent_records`, en ajout seul.** Champs : canal, finalité, état, source, date, preuve. Une modification est refusée par la base.

**Scénario testé de bout en bout sur vraie base :**
1. opt-in marketing ;
2. STOP reçu ;
3. demande de service de la cliente (NOVIA répond) ;
4. réservation volontaire ;
5. **STOP toujours actif** ;
6. tentative de réinscription sans preuve : refusée ;
7. réinscription explicite prouvée ;
8. nouvel état par finalité/canal.

Le registre final contient exactement les 4 lignes attendues.

## 15. Paiement déclaré

**Ce que NOVIA ne fait pas :** NOVIA n'encaisse rien. En pilote, le seul paiement possible est DÉCLARÉ par la professionnelle.

**Où c'est imposé :**
- validation de l'API : `method = 'declared'` ;
- la base : `kind = 'declared'`.

**Libellés du pilote :**
- bouton : « **Déclarer payé** → CA confirmé » ;
- note : « Vous déclarez avoir été payée. NOVIA n'encaisse rien et ne vérifie aucun paiement. » ;
- historique : « Déclaré payé ».

La démo garde ses libellés « preuve fictive ». Les libellés viennent de la composition, donc le bundle pilote ne contient pas ceux de la démo.

**Testé :**
- refus avant « présente » ;
- la déclaration fait passer le RDV en CA confirmé, **une seule fois**, même déclarée deux fois (une seule ligne `payments`, CA = 50 €, pas 100 €) ;
- `kind = 'online'` refusé par la base.

## 16. Multi-appareils

Le navigateur garde une copie de l'état **en mémoire seulement**. Après chaque écriture, il relit l'état du serveur. Il interroge la révision toutes les 20 s, et au retour sur l'onglet.

**Testé à trois niveaux :**
1. `http.test.ts` : deux appareils authentifiés, B voit l'écriture de A via la révision.
2. `remote.test.ts` : deux moteurs distants sur le moteur NOVIA réel. On vérifie aussi qu'aucune écriture ne va au stockage local et qu'aucune enveloppe n'est envoyée par le navigateur.
3. **Parcours réel dans Chromium, 14/14**, avec le serveur construit et un PostgreSQL 16 neuf :
   - invitation acceptée par passkey ;
   - invitation réutilisée refusée ;
   - appareil B connecté avec la même passkey (synchronisation simulée) ;
   - B voit la cliente créée sur A ;
   - 403 sur une autre entreprise ;
   - 403 sans en-tête anti-CSRF ;
   - déconnexion ;
   - aucune requête hors du serveur NOVIA.

## 17. Export / suppression

Les deux actions sont réservées à l'OWNER et limitées à son entreprise.

**Export** (`GET …/customers/:id/export`, JSON) : la fiche, le registre de consentement, les RDV, les séquences, les conversations, les appels et **tout** l'historique des messages.

**Anonymisation** (`POST …/customers/:id/anonymize`, confirmation par l'identifiant).

| | Contenu |
| --- | --- |
| **Effacé** | nom et prénom (→ « Cliente anonymisée ») ; téléphone ; e-mail ; références externes ; parrainage ; corps de tous les messages et conversations, y compris hors fenêtre chargée ; preuves textuelles de consentement ; résumés et transcriptions d'appels ; liste d'attente ; payload des événements entrants ; finalité dans l'outbox |
| **Arrêté** | séquences en cours ; échéances annulées |
| **Conservé (minimum légal)** | RDV (date, prestation, prix, statut) pour le CA et l'attribution ; registre de consentement sans preuve textuelle, qui prouve l'opposition ; journal d'audit (sans données personnelles) ; décisions shadow (identifiants seulement) |

**Testé :**
- coordonnées absentes de la table ;
- consentements conservés ;
- l'autre entreprise est intacte ;
- l'export d'une cliente d'une autre entreprise est impossible ;
- audit présent.

## 18. Sauvegarde / restauration

**Sauvegardes managées Scaleway** (instance complète, automatiques) : à activer à la création de la base, rétention de 7 jours minimum. Procédure dans `server/README.md`.

**Sauvegarde logique portable :**
- `server/ops/backup.sh` : données seules ; le schéma vient des migrations ; sessions exclues ;
- `server/ops/restore.sh` : base vide → migrations → données, en une transaction.

**Preuve (`backup.test.ts`) :** `pg_dump`, puis une base neuve migrée, puis la restauration. L'application relit **exactement** :
- le même état ;
- le même profil ;
- la même révision ;
- les mêmes échéances ;
- le même journal.

Elle accepte ensuite une nouvelle réservation (les séquences d'identifiants sont restaurées).

## 19. Sécurité

| Sujet | Mesure |
| --- | --- |
| Secrets | Côté serveur uniquement (variables d'environnement / Secret Manager). Aucune clé dans le front (test). |
| Authentification et autorisation | Sections 6 et 7. |
| Validation | Liste blanche par commande (`server/http/validate.ts`) : un champ inattendu est refusé. Source, identifiant d'événement et date sont posés par le serveur. Un STOP ne peut pas être forgé par l'API (il vient d'un message). |
| Requêtes SQL | Paramétrées uniquement. |
| CSRF | En-tête `x-novia`, origine identique, `SameSite=Strict`. |
| Limites de débit | Authentification : 20 req/min/IP. API : 240 req/min/utilisatrice. |
| Erreurs | 500 générique, sans détail. |
| Journaux | Sans identifiant d'entreprise ni de cliente dans les chemins, sans corps de message. |
| En-têtes | CSP stricte : les scripts en ligne du build sont autorisés par empreinte SHA-256, pas de `unsafe-inline` pour les scripts. `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, HSTS en HTTPS. |
| Menaces principales | Tableau complet dans `server/README.md` (accès inter-salons, hameçonnage, vol de session, CSRF, invitation interceptée, injection, envoi réel par erreur, falsification d'historique, force brute, fuites, XSS). |

**Garde-fou « aucun transport » (`guards.test.ts`, `architecture.test.ts`) :**
- seuls l'horloge et une messagerie qui REFUSE sont enregistrées ;
- le serveur n'importe aucun provider concret ni la démo ;
- aucun `fetch`, `http(s).request`, socket ou SDK (Twilio, Stripe, AWS, Scaleway…) dans le serveur ;
- aucune adresse GHL, Twilio ou Stripe ;
- aucune dépendance de messagerie, de téléphonie ou de paiement dans `package.json` ;
- le schéma verrouille le mode shadow ;
- le front pilote n'embarque aucun provider ;
- le navigateur n'importe jamais `pg`, `node:*` ni la partie serveur des passkeys.

**Ces tests échouent si un transport sortant entre dans le build P2.**

## 20. Tests

**250 tests verts au total** (`TZ=Europe/Paris npx vitest run`), soit les 208 de P1 plus les nouveaux. Ils sont aussi verts sous `npm run test:tz` (New York, Tokyo, Kiritimati).

| Partie | Nombre | Base |
| --- | --- | --- |
| Front | 214 | Les 208 de P1, conservés ; 4 adaptés (découpage `router.tsx`, client API pilote, front pilote sans état local) ; 6 nouveaux |
| Serveur | 36 | Vrai PostgreSQL 16 jetable, rôle applicatif, RLS active |

**Détail des tests serveur :**
- `migrate` : 2 ;
- `persistence` : 2 ;
- `http` : 9 (auth, 401, 403, invitation à usage unique, rôles PRO, CSRF, validation, hameçonnage, deux appareils) ;
- `pilot` : 16 ;
- `backup` : 1 ;
- `guards` : 6.

**Couverture de la liste minimale du brief :** tout est couvert. Sans PostgreSQL disponible, les tests serveur sont marqués « ignorés », pas faussement verts.

## 21. Build / performance

| Build | Commande | Résultat |
| --- | --- | --- |
| Démo | `npm run build` | JS 426 kB + 116 kB (138 + 30 kB gzip) ; les écrans se chargent après `bootstrap()`, qui est immédiat en démo |
| Pilote | `npm run build:pilot` → `dist-pilot` | JS 355 kB + 133 kB (113 + 39 kB gzip) |
| Serveur | `npm run build:server` → `dist-server` | `main.js` 105 kB, `cli.js` 23 kB ; dépendances : `pg`, `@simplewebauthn/server` |

**Dockerfile :** multi-étapes, Node 22 alpine, utilisateur non root, aucun secret dans l'image. **Il n'a pas été construit ici** : Docker n'existe pas dans mon environnement. Le serveur construit a été lancé directement avec Node 22 pour le parcours réel.

**Nouvelles dépendances :**
- `pg` ;
- `@simplewebauthn/server` ;
- `@simplewebauthn/browser` ;
- en développement : `@types/node`, `@types/pg`.

## 22. Démo après P2

La démo reste **indépendante** : pas de serveur, pas de PostgreSQL, pas d'auth, pas de réseau.

**Vérifications :**
- parcours commercial rejoué dans Chromium : **33/33** ;
- KPI de départ **295 / 35 / 80 / 245** ;
- reset et rechargement identiques ;
- aucune requête externe ;
- le bundle démo ne contient ni `/api/` ni code de passkey ;
- le bundle pilote ne contient ni « Julie », ni « NOVIA Nails », ni « exemple.demo », ni « Données de démonstration ».

## 23. Limites restantes

- **Pas déployé.** Il faut ton compte Scaleway, un domaine HTTPS, et le prix de la base managée à confirmer. Docker n'a pas été construit ici.
- **iPhone / Safari réel non testé.** Les passkeys ont été testées avec l'authentificateur virtuel de Chromium. La QA iPhone reste en attente.
- **Écrans manquants** (API et CLI seulement pour l'instant) :
  - décisions shadow, journal d'audit ;
  - export et anonymisation ;
  - édition du profil ;
  - événements de test.
- **Pas de réservation publique sans connexion en P2.** Le site cliente du pilote passe par la session de la pro. Une réservation publique demandera un point d'entrée dédié (anti-abus) plus tard.
- **Une seule instance.** Les limites de débit sont en mémoire. Les verrous de ligne rendent plusieurs instances sûres pour l'ordonnanceur, mais ce n'est pas le réglage prévu pour le pilote.
- **Perte de tous les appareils** : nouvelle invitation par l'exploitant (CLI). Pas de récupération automatique.
- **Question toujours ouverte :** les rappels de RDV envoyés à une cliente en STOP restent traités comme messages de service. J'attends ta décision.
- **Tag `demo-ready-v1`** : la poussée a échoué (le dépôt distant a coupé la connexion). Le commit `830c871` reste dans l'historique.
- **Hors périmètre, comme demandé :** pas de P3, pas de GHL, pas de Planity, pas d'essai GHL, aucune cliente contactée.

## 24. État exact de la PR

- **Branche :** `pilot/p2-backend`, partie de `0d8690f` (P1 fusionné).
- **PR :** ouverte vers `claude/project-thread-lcup8r`, **non fusionnée**. Elle attend ta validation.
- **Toutes les vérifications sont vertes :**
  - typecheck front et serveur ;
  - 250 tests, plus la matrice des fuseaux ;
  - builds démo, pilote et serveur ;
  - parcours démo 33/33 et KPI ;
  - parcours pilote réel 14/14.
- Tout ce qui précède est vrai au moment de l'ouverture de la PR. Le numéro de la PR est donné dans le message qui accompagne ce rapport.
