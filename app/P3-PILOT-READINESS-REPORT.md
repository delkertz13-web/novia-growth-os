# P3 · PILOT 001 OPERATIONAL READINESS : rapport

16/11/2026 · branche `pilot/p3-readiness` → PR vers `claude/project-thread-lcup8r` · **à valider, rien n'est déployé**

**En une phrase :** NOVIA Pro sait désormais préparer PILOT-001 avec la professionnelle, dire ce qui bloque chaque
capacité et pourquoi, observer en shadow, recueillir son avis et importer ses clientes. Elle reste incapable d'envoyer
un SMS, d'appeler, d'encaisser, de publier ou de déclencher GHL. Aucune information sur la Nail Artist n'a été
inventée : PILOT-001 démarre vide, tout « Inconnu ».

## 1. État de la PR

- P2 (PR #5) fusionnée après la vérification finale (commit `74fa29f`).
- P3 : nouvelle branche `pilot/p3-readiness`, nouvelle PR, non fusionnée.
- Vérifié sur cette branche :
  - 276 tests verts, dont les 250 existants, intacts ;
  - les mêmes 276 tests verts dans 3 fuseaux horaires ;
  - les deux vérifications de types passent ;
  - les trois builds passent (démo, pilote, serveur) ;
  - parcours démo 33/33, KPI 295 / 35 / 80 / 245 ;
  - parcours pilote P3 21/21 (Chromium, iPhone émulé, passkey virtuelle).

## 2. Préparation du déploiement

- **Aucun déploiement effectué** : il n'existe ni compte ni identifiant Scaleway. Rien n'a été simulé.
- Tout est décrit dans `DEPLOY-SCALEWAY.md` :
  - ressources à créer dans la console ;
  - variables et secrets ;
  - commandes (image versionnée, migrations, PILOT-001, invitation) ;
  - vérifications après déploiement ;
  - retour arrière (tags immuables) ;
  - sauvegarde et restauration.
- Hypothèses fragiles, signalées **avant** le déploiement :
  - **Ordonnanceur.** Avec `min-scale = 1`, la documentation ne garantit pas que le CPU reste actif entre deux requêtes.
    - Parade codée : un **déclencheur CRON** chaque minute → `POST /` + jeton (`NOVIA_CRON_TOKEN`, ≥ 32 caractères, comparaison à temps constant).
    - Le minuteur de 30 s reste en complément. Les échéances vivent en base : jamais de double traitement.
  - **Secrets.** La doc Scaleway indique que les secrets des Serverless Containers ne sont pas encore reliés à Secret Manager.
    - On utilise donc les variables secrètes du conteneur ; Secret Manager sert de coffre de référence.
  - **Autres points à vérifier dans la console** :
    - le CRON n'envoie pas d'en-tête : le jeton est dans le corps ;
    - le point d'accès public reste ouvert ;
    - le health check ne redémarre pas le conteneur ;
    - TLS vers PostgreSQL ;
    - limites du conteneur ;
    - adresse IP vue derrière le proxy.
- Robustesse ajoutée : une coupure de la base (maintenance, bascule) n'arrête plus le processus. Vérifié en redémarrant PostgreSQL pendant le parcours.

## 3. Coûts connus et inconnus

Détail dans `PILOT-INFRA-COSTS.md`.

- **Conteneur** : ≈ 6 € / mois. Hypothèse : 0,25 vCPU et 0,5 Go permanents. Tarifs lus dans la FAQ Scaleway, **à reconfirmer**.
- **À CONFIRMER DANS LA CONSOLE SCALEWAY** :
  - PostgreSQL managé ;
  - sauvegardes ;
  - Secret Manager ;
  - registre d'images ;
  - CRON ;
  - domaine.
- **Total mensuel : inconnu** tant que ces prix ne sont pas lus dans la console. Aucun prix n'a été inventé.

## 4. Préparation (mode rendez-vous)

Accès : NOVIA → **Pilote** → **Préparation**.

- 10 sections : Identité, Prestations, Horaires, Planity, Annulation / no-show, Communications, Clientes / consentement, Paiement, Voice, Objectifs.
- Tout se remplit avec des champs simples : aucun JSON, aucun SQL, aucun code.
- Chaque bloc a son bouton « Enregistrer le brouillon » et un signal « Modifications non enregistrées ».
- On peut s'arrêter et reprendre plus tard, sur un autre appareil (testé).
- L'accueil de la préparation montre, par section, le nombre d'éléments vérifiés, estimés et inconnus.

## 5. BusinessProfile

- Nouveau statut **ESTIMÉ** à côté d'INCONNU et VÉRIFIÉ. Il est affiché partout, avec un sélecteur à 3 choix.
- Une valeur estimée n'est **jamais** traitée comme vérifiée : seul « vérifié » débloque une capacité. C'est testé.
- Règles de saisie :
  - « estimé » ou « vérifié » sans contenu : refusé ;
  - le statut « démo » est refusé en pilote ;
  - chaque section est validée par le serveur, avec les mêmes règles qu'à l'écran.
- Ajouts au profil :
  - l'agenda de référence (Planity ou NOVIA) ;
  - « l'agenda envoie déjà des rappels » ;
  - pour chaque prestation : battement et « réservable en ligne ».
- Les informations que le moteur ne lit pas (formule Planity, objectifs, paiement…) vont dans une fiche à part, chacune avec son statut, sa note, sa date et son auteur.

## 6. Readiness par capacité

- Pas de pourcentage : un niveau par capacité, avec ses raisons et ses exigences cochées.
- Plafond de P3 : **Prêt pour le shadow**. « Prêt pour un test » et « Prêt pour le réel » sont inatteignables (testé).
- Une seule table d'exigences (`config/requirements.ts`), lue à la fois par le moteur et par l'écran : les raisons affichées sont exactement celles des blocages.
- PILOT-001 au départ :
  - tout est **Bloqué**, sauf Voice **Non configuré** ;
  - Réservation : « Planity fait foi pour l'agenda » ;
  - Rappel W02 : « Rappels déjà envoyés par l'agenda (Planity) : inconnu » ;
  - SmartFill : « Consentement marketing des clientes : inconnu » ;
  - W04 devient Prêt pour le shadow dès que ses règles et son texte sont vérifiés (avec la mention « coupée » tant que l'automatisation est désactivée).

## 7. Messages types

- Champs :
  - workflow, canal, finalité ;
  - contenu, version ;
  - statut BROUILLON / APPROUVÉ / ARCHIVÉ ;
  - auteur, date.
- Règles :
  - une seule version approuvée par message : approuver une nouvelle version archive l'ancienne ;
  - une variable inconnue est refusée ;
  - le moteur ne lit **que** la version approuvée : un brouillon ne sert à rien (testé).
- Aucun texte de la démo n'est repris : PILOT-001 démarre sans aucun message.
- La PRO rédige ; seule la propriétaire approuve.

## 8. FAQ approuvée

- Champs : question / intention, mots-clés, réponse approuvée, statut, date, auteur.
- Question inconnue, ou réponse non approuvée : la conversation passe en **besoin d'un humain**, et aucune réponse n'est inventée.
- Aucune IA générative. Testé de bout en bout : sans réponse approuvée, transmise à la pro ; une fois approuvée, NOVIA répond avec ce texte exact.

## 9. Planity, scénario A

- Par défaut : `Planity = SOURCE_OF_TRUTH_FOR_SCHEDULE`.
- Côté NOVIA :
  - aucun créneau présenté comme disponible ;
  - la réservation en ligne est refusée par le moteur ;
  - le site cliente affiche « La réservation en ligne n'est pas ouverte… ».
- Agenda : bandeau « Agenda observé : Planity fait foi ».
- Report d'un RDV : saisie libre de la date « telle que dans votre agenda », sans calcul de créneau.
- Testé même avec horaires et prestations vérifiés. Si NOVIA est vérifiée comme agenda, les créneaux réapparaissent.

## 10. Saisies manuelles

Accès : NOVIA → **Pilote** → **Saisies**.

- Créer une cliente.
- Saisir un RDV observé : date et heure libres, plus la façon dont la cliente a réservé.
- Corriger une erreur de saisie : aucun message, rappels recalculés, ce n'est pas un report.
- Inscrire en liste d'attente.
- Présente / absente / annulée / reportée, « déclarer payé », consentement et opposition restent sur les fiches existantes.
- Tout passe par API → moteur → base.

## 11. Provenance

- Valeurs : PRO_MANUAL, OWNER_MANUAL, PLANITY_EXPORT, PLANITY_NOTIFICATION, NOVIA_BOOKING, VOICE, GHL, IMPORT.
- Posée **par le serveur** :
  - saisie : selon le rôle connecté ;
  - réservation NOVIA : NOVIA_BOOKING ;
  - import : provenance déclarée.
- Le navigateur ne peut pas la choisir : refus 400 (testé).
- Une saisie manuelle n'est jamais présentée comme venant de Planity.

## 12. Shadow Control Center

- Chaque décision est racontée, par exemple : « lun. 16 nov. 14h00 · Ana A. · Nouveau RDV saisi → NOVIA aurait : Message W02 · confirmation → ✗ Texte de confirmation de RDV, ✗ Nom commercial → Résultat : bloqué… ».
- Les noms des vérifications sont en français ; le détail technique est repliable.
- Filtres : cliente, workflow, résultat, dates (validés par le serveur), et texte de la raison.

## 13. Avis

- Trois réponses : « Oui, j'aurais fait pareil », « Non, je n'aurais pas fait ça », « Je ne sais pas ».
- Commentaire facultatif.
- Une réponse par personne et par décision ; elle peut être modifiée.
- Enregistré : décision, utilisatrice, réponse, commentaire, date.
- L'avis **ne modifie aucune règle** : le profil est identique avant et après (testé).

## 14. Métriques

- Contenu :
  - nombre de décisions ;
  - « auraient été exécutées » ;
  - bloquées ;
  - les 10 raisons de blocage les plus fréquentes ;
  - avis ;
  - workflows observés.
- **Aucun revenu, aucun montant** : vérifié dans la réponse de l'API.
- Écran : « aucun montant gagné n'est affiché en shadow ».

## 15. Import CSV

- Déroulé : fichier, correspondance des colonnes (devinée puis confirmée), **provenance obligatoire** (export Planity ou autre fichier), aperçu, puis import.
- Aperçu : nouvelles, déjà dans NOVIA, en double dans le fichier, invalides.
- Avant d'importer, le serveur **recalcule** l'aperçu : il ne fait jamais confiance à celui du navigateur.
- Ce que l'import ne fait jamais : créer un consentement marketing (testé). Ni scraping, ni automatisation Planity.
- Limites : 2 000 lignes, 1 Mo. Rejouer un import n'ajoute rien.

## 16. Connexion (UX)

- Passkeys conservées. Les mots « passkey » et « WebAuthn » ont disparu de l'écran.
- Nouveaux libellés :
  - connexion : « Se connecter avec Face ID, empreinte ou code » ;
  - première connexion : « Activer Face ID / empreinte / code » ;
  - annulation : « Connexion annulée. Vous pouvez réessayer. »

## 17. Tests

- **276 au total = 250 existants + 26 nouveaux.** Le compte n'a pas été gonflé : chaque test vérifie un comportement.
- Côté serveur, 13 tests de bout en bout (vrai HTTP, vraie base, vraies passkeys) :
  - entreprise vide ;
  - lecture sans effet ;
  - fait estimé repris sur un autre appareil ;
  - droits OWNER / PRO ;
  - isolation ;
  - cycle de vie des messages ;
  - FAQ approuvée ou inconnue ;
  - Planity fait foi ;
  - provenance ;
  - correction et liste d'attente ;
  - Shadow Control Center, avis et métriques ;
  - import ;
  - CRON.
- Partie pure, 11 tests : inconnu, estimé, vérifié, readiness, validation, CSV, récit des décisions.
- 1 test moteur : aucune disponibilité inventée.
- 1 test d'architecture : les écrans pilote sont branchés seulement par la composition pilote.

## 18. Mobile

- Parcours P3 en iPhone émulé (390 px) : aucun défilement horizontal sur la readiness, la préparation et le Shadow Control Center. Captures faites.
- Les écrans P3 suivent le thème sombre de NOVIA Pro. Le résumé s'imprime en clair (Imprimer → PDF).
- **QA réel iPhone / Safari : PENDING QA.** Ne bloque pas P3, mais reste requis avant la première utilisation autonome de la pro.

## 19. Démo

- Intacte : parcours 33/33, KPI 295 / 35 / 80 / 245.
- Le build démo ne contient ni les écrans pilote ni aucun appel `/api/` (vérifié dans le bundle).
- Le build pilote ne contient aucune donnée de démo.

## 20. Limites restantes

- **Pas de déploiement réel** tant que le compte Scaleway n'existe pas. Coûts de la base inconnus.
- **Profil dans le cockpit** : une modification faite dans la Préparation s'applique au serveur tout de suite. Dans l'appareil, l'affichage du cockpit (horaires, bandeau d'agenda) ne la montre qu'après rechargement de la page.
- **Import des RDV** (en plus des clientes) : non fait. Les RDV se saisissent un par un.
- **Question ouverte (rappel)** : un rappel de RDV à une cliente qui a répondu STOP est-il un message de service ? Toujours en attente de ta décision.
- **Rien n'est envoyé :**
  - ni SMS, ni appel, ni Voice ;
  - ni paiement, ni publication ;
  - ni GHL, ni Planity connecté ;
  - aucune vraie cliente contactée.

**P3 s'arrête ici.** P4 n'est pas commencé : ni GHL, ni Planity, aucune cliente contactée. En attente de ta validation.
