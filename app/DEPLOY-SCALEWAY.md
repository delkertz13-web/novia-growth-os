# Déployer NOVIA Pilot sur Scaleway (Paris) : dossier prêt, déploiement NON effectué

> **État au 16/11/2026 : rien n'est déployé.** Aucun compte ni identifiant Scaleway n'est disponible dans
> l'environnement de travail. Ce dossier décrit ce qu'il faut créer et dans quel ordre ; aucune étape
> n'a été exécutée ni simulée. Les points marqués **À VÉRIFIER** viennent de la documentation publique
> de Scaleway et doivent être confirmés dans la console au moment du déploiement.

Cible : région **Paris (fr-par)**, **Serverless Containers** + **Managed Database for PostgreSQL 16**,
secrets en variables secrètes du conteneur. Aucun SDK Scaleway dans le code : l'hébergeur reste remplaçable.

## 1. Hypothèses fragiles, à lever AVANT le déploiement

| # | Hypothèse | Ce que dit la doc publique | Parade prévue dans le code |
|---|---|---|---|
| 1 | Le minuteur interne (toutes les 30 s) tourne en continu | `min-scale = 1` garde une instance allouée, mais **aucune garantie documentée que le CPU reste actif entre deux requêtes** | Déclencheur **CRON Scaleway** chaque minute → `POST /` avec un jeton (`NOVIA_CRON_TOKEN`). Les échéances vivent en base : CRON + minuteur ne font jamais double emploi. |
| 2 | Secret Manager injecte les secrets dans le conteneur | « Secrets on Serverless Containers are not linked with Secret Manager product yet » (doc Scaleway) | Utiliser les **variables d'environnement secrètes du conteneur** ; garder Secret Manager comme coffre de référence (copie manuelle, rotation tracée). **À VÉRIFIER** si l'intégration existe désormais. |
| 3 | Le déclencheur CRON peut envoyer un en-tête d'authentification | Format documenté : expression cron en UTC (`* * * * *`), `POST /` avec les arguments **dans le corps** ; en-têtes non documentés | Le jeton est lu **dans le corps JSON** (`{"token": "…"}`), comparaison à temps constant, 10 appels/min max par IP. |
| 4 | Le point d'accès public peut être fermé | La FAQ indique qu'il ne peut pas être désactivé (le changelog dit autre chose) | Toute l'API exige session + appartenance ; la route CRON exige son jeton ; rien n'est exposé sans authentification. |
| 5 | La vérification de santé redémarre un conteneur malade | Les health checks (TCP ou HTTP + chemin ; défauts : seuil 30, intervalle 10 s, délai 1 s) **ne redémarrent pas** le conteneur ; la directive Docker `HEALTHCHECK` est ignorée | Health check HTTP sur `/api/health` (réponse sans base). Surveillance : journaux JSON (`level: error`, `msg: scheduler`). |
| 6 | TLS vers PostgreSQL | La base managée propose une connexion TLS avec certificat | `DATABASE_URL` avec `sslmode=require` (**À VÉRIFIER** au premier déploiement : certificat de l'autorité Scaleway si `verify-full` est exigé). |
| 7 | Délais et mémoire du conteneur | Page « limitations » non consultable lors de la préparation | **À VÉRIFIER** : délai maximal de requête, mémoire minimale. L'import CSV est borné à 2 000 lignes / 1 Mo. |
| 8 | L'adresse IP vue par le serveur est celle de l'appareil | Derrière le proxy de la plateforme, l'adresse peut être celle du proxy (**À VÉRIFIER** dans les journaux) | La limitation de débit par IP deviendrait alors globale (20 connexions/min) : suffisant pour 2 appareils, à revoir avant d'élargir. |

## 2. Ressources à créer (console Scaleway)

1. **Projet** dédié « novia-pilot » (isolation des droits et de la facturation).
2. **Container Registry** (namespace privé, fr-par) pour l'image.
3. **Managed Database for PostgreSQL 16** (fr-par), plus petite offre disponible, **sauvegardes automatiques activées**
   (rétention ≥ 7 jours), accès restreint (réseau privé ou liste d'adresses autorisées), TLS.
   - base `novia` ; utilisateur propriétaire (migrations) ; puis rôle applicatif `novia_app_login` (voir §4).
4. **Serverless Containers** : namespace fr-par, puis conteneur :
   - image : `rg.fr-par.scw.cloud/<namespace>/novia-pilot:<version>` (**tag immuable**, jamais `latest`) ;
   - port 8080 ; `min-scale = 1`, `max-scale = 1` (une instance : limitation de débit en mémoire, ordonnanceur unique) ;
   - ressources : la plus petite taille qui démarre l'image (à mesurer ; **À VÉRIFIER**) ;
   - health check HTTP : chemin `/api/health` ;
   - variables (§3).
5. **Déclencheur CRON** sur le conteneur : `* * * * *` (UTC), corps `{"token": "<NOVIA_CRON_TOKEN>"}`.
6. **Domaine** : CNAME vers le conteneur (ex. `pilote.<domaine>`), certificat géré. Les passkeys sont liées à ce domaine :
   **le choisir définitivement avant d'inviter la pro**.
7. **Secret Manager** : y ranger `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `NOVIA_CRON_TOKEN` (référence), puis les recopier en
   variables secrètes du conteneur (hypothèse 2).

## 3. Variables du conteneur

| Variable | Type | Valeur |
|---|---|---|
| `DATABASE_URL` | **secrète** | `postgres://novia_app_login:<mdp>@<hôte>:<port>/novia?sslmode=require` |
| `NOVIA_ORIGIN` | normale | `https://pilote.<domaine>` |
| `NOVIA_RP_ID` | normale | `pilote.<domaine>` (ne plus jamais changer : les passkeys en dépendent) |
| `NOVIA_CRON_TOKEN` | **secrète** | 32 caractères aléatoires au moins (ex. `openssl rand -hex 32`) ; le serveur refuse de démarrer s'il est plus court |
| `PORT`, `NOVIA_STATIC_DIR` | déjà dans l'image | 8080, `/app/dist-pilot` |

`MIGRATION_DATABASE_URL` n'est **pas** donnée au conteneur : elle ne sert qu'à l'exploitant pour les migrations.

## 4. Commandes (poste de l'exploitant)

```sh
# image versionnée
VERSION=p3-$(git rev-parse --short HEAD)
docker build -t rg.fr-par.scw.cloud/<namespace>/novia-pilot:$VERSION app/
docker push rg.fr-par.scw.cloud/<namespace>/novia-pilot:$VERSION

# base : migrations (propriétaire), puis rôle applicatif (une fois)
cd app && npm ci && npm run build:server
MIGRATION_DATABASE_URL=… DATABASE_URL=… NOVIA_ORIGIN=https://pilote.<domaine> node dist-server/cli.js migrate
psql "$MIGRATION_DATABASE_URL" -c "create role novia_app_login login password '…'; grant novia_app to novia_app_login"

# PILOT-001 : profil entièrement inconnu, mode shadow, rien d'inventé
DATABASE_URL=… NOVIA_ORIGIN=… node dist-server/cli.js create-business --id pilot-001 --timezone Europe/Paris
# invitation à usage unique (72 h) : lien remis en main propre à la propriétaire
DATABASE_URL=… NOVIA_ORIGIN=… node dist-server/cli.js invite --business pilot-001 --role OWNER --label "iPhone"
```

Les migrations se lancent depuis le poste de l'exploitant (accès autorisé à la base) : le conteneur ne migre jamais
la base au démarrage. Alternative possible : un job Serverless avec la même image (**À VÉRIFIER** dans la console).

## 5. Vérifications après déploiement (dans cet ordre)

1. `GET https://pilote.<domaine>/api/health` → `{"ok":true}`.
2. Journaux : `NOVIA Pilot écoute sur 8080 (mode shadow, aucun envoi réel)`, aucune ligne `level: error`.
3. Déclencheur CRON : une ligne de journal `POST /` toutes les minutes, statut 200 (un 403 = jeton erroné).
4. Ouvrir le lien d'invitation sur l'iPhone de la propriétaire → Face ID → NOVIA Pro, bandeau « PILOTE · mode shadow ».
5. NOVIA → Pilote → Readiness : tout « Bloqué » sauf Voice « Non configuré » (entreprise vide, attendu).
6. **QA réel iPhone / Safari** (PENDING QA) avant la première utilisation autonome de la pro.

## 6. Retour arrière (rollback)

- **Code** : redéployer le tag précédent (`novia-pilot:<version précédente>`) dans le conteneur. Chaque tag est immuable ;
  « Redeploy » sur le même tag ne fait que rafraîchir le digest.
- **Schéma** : les migrations sont additives ; une version précédente du code fonctionne sur un schéma plus récent tant
  qu'aucune migration destructive n'a été publiée (règle : on n'en publie pas pendant le pilote). Pas de « down migration ».
- **Données** : restauration (§7) vers une **nouvelle** instance, puis bascule de `DATABASE_URL`.

## 7. Sauvegarde et restauration

1. **Managée** : sauvegardes automatiques quotidiennes de l'instance (console → base → sauvegardes), restauration vers une
   nouvelle instance. Rétention et prix : **À VÉRIFIER** (voir `PILOT-INFRA-COSTS.md`).
2. **Logique, portable** : `server/ops/backup.sh fichier.sql` (données seules ; chiffrer, stocker en UE) puis
   `server/ops/restore.sh fichier.sql` sur une base vide migrée. Procédure prouvée par `server/test/backup.test.ts`.
3. Avant chaque déploiement de schéma : une sauvegarde logique manuelle.

## 8. Ce que ce déploiement ne fait PAS

Aucun SMS, aucun appel, aucun Voice, aucun paiement, aucune connexion GHL ou Planity. Le serveur n'a aucun transport :
`outbox` et `messages` ne peuvent jamais passer à « envoyé » (contraintes en base). Mode shadow uniquement.
