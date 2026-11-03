# Intégration future — préparation sans activation

Statut : **À PRÉPARER / À VALIDER**, aucune intégration réalisée. Sources : S2/S3.

## Contrainte actuelle

Ne pas activer GHL ni démarrer l'essai. L'intention historique est de préserver une période d'environ 30 jours ; sa durée et ses conditions actuelles ne sont pas vérifiées. La démo doit rester autonome.

## À préparer avant cette décision

1. Faire assimiler le pack et valider l'architecture de la démo.
2. Après autorisation, construire et vérifier les parcours locaux avec mocks.
3. Recueillir les informations réelles du salon et les dépendances à Planity.
4. Configurer les paramètres et rédiger les textes de W01–W04 ; concevoir et valider les autres parcours nécessaires au pilote.
5. Définir source de vérité, preuve de présence, reprise humaine et niveau de preuve du revenu.
6. Préparer les correspondances NOVIA/backend et une liste des capacités à vérifier.
7. Définir le périmètre du pilote et obtenir la décision explicite d'activer au moment utile.

## Passage futur d'un mock à une connexion

Évaluer les capacités et conditions du fournisseur au moment du choix. Pour chaque provider, identifier les opérations nécessaires, données, erreurs, source de vérité et preuves attendues. Tester sur un environnement nommé avant de déclarer CONNECTED. Une connexion réussie ne suffit pas à déclarer PRODUCTION READY.

Les tests devront couvrir notamment doublons, événements tardifs, annulation/report, interruption humaine, opposition, indisponibilité du fournisseur et absence de preuve financière. La stratégie technique précise reste à proposer et valider.

## Conditions métier avant réel

Identité et règles du salon approuvées ; disponibilité fiable ; canaux et règles d'envoi validés ; présence confirmable ; workflow sans relance obsolète ; reprise humaine utilisable ; données et accès maîtrisés ; limites connues et responsable opérationnel identifié.

Ces besoins ne constituent pas une nouvelle autorisation de connecter quoi que ce soit. Les règles juridiques et les capacités fournisseur ne sont pas certifiées par ce document. Aucune connexion Planity, migration, résiliation ou suppression de données n'est prévue sans décision spécifique.
