# Master Config — configuration centrale

Statut : **SPECIFIED PARTIEL — catalogue documentaire**, aucun fichier de configuration exécuté. Sources : S2 et S3. Les chemins ci-dessous expriment un contrat conceptuel, pas un choix de langage ou de stockage.

## Identité et catalogue

| Champ / groupe | Valeur ou état | Règle |
|---|---|---|
| project.name | NOVIA — Growth OS | Nom du projet |
| demo.name | NOVIA Nails — Demo | Nom provisoire de présentation |
| vertical | Nails pour la démo ; Pilates première niche commerciale | Séparer stratégie et configuration active |
| business.name, tagline, logo, colors | À RENSEIGNER ; identité démo possible ultérieurement | Ne pas attribuer l'identité fictive au salon réel |
| business.address, phone, instagram, googleReviewUrl | À RENSEIGNER | Pas de coordonnées ni liens commerciaux inventés |
| business.openingHours, timezone | À CONFIRMER | Fuseau du business, pas celui supposé de la machine |
| services[] | Catalogue démo à créer après autorisation | id, name, description, duration, price, deposit, category, returnRecommendedAfterDays, active |
| gallery[], reviews[], faq[] | Contenus démo à créer et identifier | Photos/avis non présentés comme ceux du salon |
| verticalConfig | Particularités métier | Éviter de disperser les règles Nails dans l'interface |

## Paramètres opérationnels à confirmer

| Sujet | Décision retrouvée | Valeur effective |
|---|---|---|
| Plages d'envoi | Configurables ; 07:00–22:00 seulement envisagé | À VALIDER, aucun envoi |
| W01 relances | Délai et nombre maximal configurables (S6) | À CONFIGURER |
| W02 rappels | Configurables ; exemples 24 h et 2 h (S6) | À CONFIGURER |
| W03 / W04 récupération | Attente configurable, un message, une dernière relance puis STOP (S6) | Délais À CONFIGURER |
| Règles après no-shows répétés | `DEPOSIT_REQUIRED`, `HUMAN_APPROVAL_REQUIRED` possibles, décidés par l'établissement (S6) | Seuils À CONFIGURER |
| W05–W12 | Modules nommés | À CONCEVOIR, aucun workflow actif |
| Opposition / STOP | Pris en compte avant action | Mécanisme et sources à spécifier |
| Reprise humaine | Interrompt l'automatisation | Conditions de reprise auto à valider |
| Présence | Validation fiable nécessaire | Pas de valeur par défaut présente/absente |
| Règles d'acompte / annulation | Configurables si retenues | À demander à la professionnelle |
| Retour recommandé | Configurable selon prestation | Aucun délai Nails réel validé |
| SmartFill | Éligibilité et contactabilité contrôlées | Priorité, vagues et expiration à concevoir |
| Attribution | Potentiel / réservé / confirmé séparés | Preuve et fenêtre d'attribution à valider |

## Exécution de la future démo

Tous les providers seront des mocks tant qu'aucune connexion n'est autorisée. Réservations, messages, appels, notifications et paiements sont des simulations. Les réglages visuels ne doivent pas activer un service réel. Une mention de démonstration accompagne les écrans et chiffres concernés.

## À soumettre dans l'audit

Proposition à valider : distinguer dans la future configuration les valeurs `unknown`, les exemples `demo` et les données `verified` afin de ne pas remplacer silencieusement une inconnue par une invention. Le format exact, la persistance et la validation des champs restent à choisir.
