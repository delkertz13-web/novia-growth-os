# NOVIA Pilot — serveur (P2)

API NOVIA + ordonnanceur + front pilote, dans **un seul processus Node 22**, devant **PostgreSQL 16**.
Mode **shadow** uniquement : NOVIA décide et enregistre, **rien ne sort** (aucun SMS, appel, paiement, GHL, Planity).

```
navigateur (passkey, cookie HttpOnly) ──HTTPS──▶ API NOVIA ──▶ application ──▶ moteur (src/engine) ──▶ règles (src/core)
                                                     │                                  │
                                                     └──────── repositories ◀───────────┘
                                                                    │
                                                              PostgreSQL (RLS)
```

## Variables d'environnement (secrets : serveur uniquement)

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | rôle **applicatif** `novia_app_login` (membre de `novia_app`, sans BYPASSRLS, sans DELETE sur l'historique) |
| `MIGRATION_DATABASE_URL` | propriétaire du schéma (migrations et exploitation uniquement, jamais utilisé par l'API) |
| `NOVIA_ORIGIN` | origine publique, ex. `https://pilote.example.fr` (passkeys et anti-CSRF) |
| `NOVIA_RP_ID` | domaine des passkeys (par défaut : l'hôte de `NOVIA_ORIGIN`). **Ne plus le changer** une fois des passkeys créées |
| `PORT` | 8080 par défaut |
| `NOVIA_STATIC_DIR` | front pilote construit (`dist-pilot`, déjà réglé dans l'image) |
| `NOVIA_CRON_TOKEN` | jeton du déclencheur CRON (`POST /` avec `{"token": "…"}`), 32 caractères au moins ; absent = route désactivée |

## Construire et lancer

```sh
npm ci
npm run build:pilot      # front pilote → dist-pilot
npm run build:server     # serveur → dist-server (main.js, cli.js)
npm run start:pilot      # ou : docker build -t novia-pilot . && docker run -p 8080:8080 -e … novia-pilot
```

## Mise en place d'une base (base vide → pilote)

```sh
# 1. schéma (propriétaire)
MIGRATION_DATABASE_URL=postgres://owner@…/novia DATABASE_URL=… node dist-server/cli.js migrate
# 2. rôle applicatif (une fois, en administrateur) — mot de passe dans le gestionnaire de secrets
psql "$MIGRATION_DATABASE_URL" -c "create role novia_app_login login password '…'; grant novia_app to novia_app_login"
# 3. établissement : profil entièrement « inconnu » (rien n'est inventé ; toute automatisation est BLOQUÉE en shadow)
DATABASE_URL=… NOVIA_ORIGIN=… node dist-server/cli.js create-business --id pilot-001 --timezone Europe/Paris
# 4. invitation à usage unique (72 h) pour la propriétaire : lien à remettre en main propre
DATABASE_URL=… NOVIA_ORIGIN=… node dist-server/cli.js invite --business pilot-001 --role OWNER --label "iPhone"
# 5. (plus tard) profil vérifié avec l'établissement
DATABASE_URL=… node dist-server/cli.js set-profile --business pilot-001 --file profil-verifie.json
```

Les migrations sont **versionnées** (`server/migrations/NNNN_*.sql`), appliquées une seule fois, sous verrou,
avec empreinte : une migration déjà appliquée et modifiée ensuite est **refusée**. On n'édite jamais une
migration publiée ; on en ajoute une nouvelle.

## Hébergement recommandé : Scaleway, région Paris (fr-par)

Procédure complète, hypothèses fragiles et retour arrière : [`../DEPLOY-SCALEWAY.md`](../DEPLOY-SCALEWAY.md) ; coûts : [`../PILOT-INFRA-COSTS.md`](../PILOT-INFRA-COSTS.md).

- **Serverless Containers** : l'image ci-dessus, `min-scale = 1`, `max-scale = 1` pour le pilote. L'ordonnanceur a deux déclencheurs : un minuteur interne (30 s) et un **déclencheur CRON** chaque minute (`POST /` + jeton), car rien ne garantit que le CPU reste actif entre deux requêtes.
- **Managed Database for PostgreSQL 16** : sauvegardes automatiques quotidiennes activées, rétention 7 jours minimum, connexion TLS.
- **Secrets** : variables **secrètes du conteneur** (`DATABASE_URL`, `NOVIA_CRON_TOKEN`) ; Secret Manager sert de coffre de référence (la doc Scaleway indique que les deux ne sont pas encore reliés).
- Domaine HTTPS propre (les passkeys sont liées au domaine).
- Aucun SDK Scaleway dans le code : l'hébergeur est remplaçable (toute plateforme qui exécute une image Docker + un PostgreSQL 16).

## Sauvegarde et restauration

1. **Sauvegardes managées** (instance complète, automatiques) : restauration depuis la console Scaleway vers une nouvelle instance, puis bascule de `DATABASE_URL`.
2. **Sauvegarde logique des données** (en plus, portable) : `server/ops/backup.sh fichier.sql` — données seules, le schéma vient des migrations. Le fichier contient des données personnelles : chiffré, stocké en UE.
3. **Restauration logique** : `server/ops/restore.sh fichier.sql` sur une base **vide** : migrations, puis données, en une transaction.
   Les sessions ne sont pas restaurées (reconnexion par passkey).

La procédure 2→3 est **prouvée par un test** (`server/test/backup.test.ts`) : base vide → migrations → données → l'application relit exactement le même état, les mêmes échéances, le même journal, et continue de fonctionner.

## Menaces principales et parades

| Menace | Parade |
| --- | --- |
| Accès aux données d'un autre salon | entreprise jamais choisie par le navigateur : appartenance relue en base à chaque requête ; **RLS PostgreSQL** (FORCE) sur toutes les tables métier ; clés composites `(business_id, id)` ; tests d'isolation SQL réels |
| Vol de mot de passe / hameçonnage | **pas de mot de passe** : passkeys WebAuthn liées au domaine ; origine vérifiée |
| Vol de session | cookie HttpOnly, Secure, SameSite=Strict, 30 jours ; seule l'empreinte SHA-256 est en base ; déconnexion = suppression |
| CSRF | en-tête `x-novia` obligatoire + origine identique + SameSite=Strict |
| Invitation interceptée | usage unique, 72 h, empreinte seule en base ; jeton dans le fragment `#` (jamais envoyé dans les journaux HTTP) |
| Injection SQL | requêtes **paramétrées** uniquement |
| Entrée malveillante | liste blanche par commande (`http/validate.ts`) : champ inattendu = refus ; la source, l'identifiant d'événement et la date sont posés par le serveur |
| Envoi réel par erreur | aucun fournisseur enregistré ; base : `execution_mode = 'shadow'`, statuts « envoyé » interdits ; tests d'architecture (aucun `fetch`, aucun SDK) |
| Falsification de l'historique | consentement, actions de séquence, reprises humaines, décisions shadow, audit : **ajout seul** (déclencheurs) ; pas de DELETE pour le rôle applicatif |
| Force brute / abus | limites : 20 requêtes/min/IP sur l'authentification, 240/min/utilisatrice sur l'API |
| Fuite par les erreurs ou les journaux | erreurs génériques (500 sans détail) ; journaux sans identifiant d'entreprise ni de cliente, sans corps de message |
| Script injecté (XSS) | CSP stricte (scripts du domaine + empreintes des scripts en ligne du build), `frame-ancestors 'none'`, `nosniff` |
