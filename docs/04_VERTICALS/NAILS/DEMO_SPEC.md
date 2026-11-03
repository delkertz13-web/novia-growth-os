# NOVIA Nails Demo V1 — cahier des charges préparatoire

**SPECIFIED — démo future. Développement non autorisé par ce fichier.** Sources : S3/S4, avec priorité à l'instruction actuelle S1 : audit et validation avant code.

## 1. Objectif et périmètre

Une démo commerciale web autonome, immersive et mobile-first. Deux expériences : la cliente découvre la Nail Artist et réserve ; la professionnelle voit le cockpit et comprend les automatismes envisageables. La présentation doit fonctionner sans GHL, Planity, Stripe, SMS réels, téléphonie réelle ou API payante.

Nom provisoire : **NOVIA Nails — Demo**. Identité et contenus fictifs entièrement remplaçables. Aucun code n'est livré dans ce pack.

## 2. Direction visuelle retrouvée

Univers Nail Artist premium, mode et luxe accessible : grandes photographies macro de manucures, typographie soignée, espace, transitions fluides, micro-interactions tactiles et profondeur subtile. Un effet de verre très léger est optionnel. Éviter une interface surchargée, les clichés rose bonbon/papillons/paillettes et un rendu SaaS froid.

Priorité smartphone, puis tablette et ordinateur. Les animations servent la compréhension et préservent performance/accessibilité. Le choix des polices, images et couleurs réelles n'est pas arrêté. Les images de démo ne doivent pas être présentées comme des réalisations du salon.

## 3. Espace cliente

| Zone | Comportement spécifié |
|---|---|
| Accueil | Hero immersif, identité provisoire, CTA Prendre rendez-vous et Voir les réalisations |
| Galerie | Navigation tactile, ouverture d'une réalisation ; catégories possibles Gel/French/Nail Art/Nude/Couleur/Semi-permanent |
| Prestations | Nom, description, durée, prix fictif, éventuel acompte, catégorie, retour recommandé, actif ; actions Voir/Réserver |
| Réservation | Prestation → date → créneau → prénom/nom/téléphone/email → récapitulatif → confirmation locale |
| Attente | Prestation, jours, matin/après-midi/soir, flexibilité éventuelle ; confirmation simulée |
| Retour | Illustration « Il est bientôt temps pour votre remplissage » et réservation suivante |
| Avis | Avis explicitement fictifs ; futur remplacement possible par de vrais avis |
| FAQ | Questions sur durée, préparation, ancienne pose, acompte, annulation et paiements ; réponses démo identifiées |
| Voice | Invitation à appeler ouvrant une simulation, sans vraie téléphonie |

Sur la confirmation, afficher les détails du rendez-vous et préciser qu'il s'agit d'une simulation. Les formulations historiques promettant « Vous recevrez une confirmation » doivent être accompagnées ou remplacées par une formulation explicite telle que « Démonstration : la confirmation et les rappels seraient envoyés automatiquement ». Cette adaptation évite de promettre un vrai envoi.

## 4. Espace professionnelle

Route conceptuelle `/pro`, mobile-first. Navigation : Accueil, Agenda, Clientes, Messages, NOVIA, Réglages. Cette route ne constitue pas une authentification ou un espace sécurisé de production.

### Accueil

Aujourd'hui : nombre de rendez-vous, CA réservé, créneaux disponibles, actions nécessaires. Exemple fictif de source : 7 rendez-vous, 315 € réservés, 1 créneau libre, 2 actions. Les données du scénario final devront rester cohérentes entre les écrans ; l'exemple n'impose pas de conserver ces nombres.

### À confirmer

Carte exemple : Julie Martin, Remplissage, 14h30, 45 € — données fictives. Actions : Présente, Absente, Annulée, Reportée.

- Présente : modifier le mock et illustrer la possibilité du suivi après prestation ; W05+ non conçu.
- Absente : illustrer la possibilité W04 après validation fiable.
- Annulée : illustrer récupération et créneau libéré pour SmartFill.
- Reportée : choisir un nouveau créneau ; l'ancien état ne doit plus conduire les actions.

Ne jamais transformer automatiquement une heure passée en présence ou absence. Les demandes de validation simulées peuvent montrer « Le rendez-vous de Julie est terminé. Était-elle présente ? », sans en conclure qu'elle est venue.

### Agenda

Vues Aujourd'hui et Semaine ; heure, cliente, prestation, durée, prix, statut. Valeurs citées : Booked, Confirmed, Showed, No-show, Cancelled, Rescheduled, Completed. Libellés français visibles ; distinctions détaillées dans le modèle de données. L'état de validation inconnu doit rester représentable.

### SmartFill

Créneau libre fictif vendredi 15h30, 60 min ; bouton Lancer SmartFill. Simulation de source : 8 éligibles → 5 contactables → 1 réservation. Expliquer que NOVIA contacterait les personnes éligibles selon les règles configurées. Aucun message réel ; aucun W12 réel conçu.

### Retour et récupération

Cartes de remplissages à prévoir, avec exemples de derniers rendez-vous à 19 et 23 jours ; ces âges ne constituent pas une recommandation réelle de retour. Actions Relancer / Laisser NOVIA gérer uniquement simulées.

Section no-shows : exemple fictif 2 ce mois-ci, 1 récupéré, valeur potentielle 45 €. Afficher Simulation et distinguer potentiel, réservé et confirmé selon l'état du scénario.

### Messages et Voice

Conversations fictives : disponibilité samedi, déplacement d'un RDV, prix d'un remplissage. États NOVIA répond / Réponse humaine nécessaire / Professionnelle a repris. Bouton Reprendre la conversation.

Voice : appels reçus, traités, RDV créés et transferts humains ; modes Tous les appels/Appels manqués/Hors horaires ; interrupteur visuel **Actif — simulation** ou **Inactif — simulation**. Aucun vrai appel ou abonnement.

### Revenue

Catégories Acquisition, Annulations récupérées, No-shows récupérés, Réactivation, Parrainage, SmartFill. Niveaux séparés CA potentiel / réservé / confirmé. Mention « Démonstration — aucune donnée financière réelle ». Ne pas additionner les niveaux comme des ventes distinctes.

## 5. Architecture et qualité attendues après autorisation

Auditer l'existant avant de proposer le framework. Composants réutilisables, configuration centralisée, séparation UI/données/services, types/interfaces cohérents. Providers conceptuels Booking/CRM/Messaging/Voice/Payment/Analytics et variantes Mock ; aucune promesse de provider GHL déjà disponible.

Prévoir états vides, chargement, erreurs, accessibilité, performance et absence de secrets. Pas de dépendances inutiles. Un stockage local et une remise à zéro peuvent être proposés pour la présentation, mais ne sont pas encore des décisions techniques.

PWA optionnelle si cohérente avec le framework ; aucune application native exigée. Respecter les zones de sécurité iPhone, de grands boutons tactiles et l'absence de débordement horizontal.

## 6. Exclusions

Pas de paiement réel, téléphonie réelle, SMS réels, connexion Planity/GHL, authentification complexe, backend lourd ou infrastructure cloud inutile. Pas d'activation de l'essai GHL. Pas de modification des projets existants. Pas de réservation ou prise de contact extérieure depuis un bouton de démonstration.

## 7. Vérifications à exécuter lors du développement futur

| Parcours | Résultat attendu |
|---|---|
| Navigation cliente/pro | Écrans atteignables, retour compréhensible |
| Prestation/date/créneau/réservation | Récapitulatif cohérent, confirmation clairement simulée |
| Liste d'attente | Préférences prises en compte dans la simulation |
| Présente/Absente/Annulée/Reportée | Bon rendez-vous modifié, conséquences illustrées cohérentes |
| Statut inconnu | Aucun message fondé sur une présence/absence supposée |
| Report/nouvelle réservation | Ancienne séquence ne continue pas aveuglément |
| SmartFill et retour | Interaction locale, résultat fictif indiqué |
| Reprise humaine | État de conversation modifié, arrêt des actions incompatibles |
| Revenue | Niveaux distincts, aucune réservation présentée comme encaissée |
| Mobile/tablette/desktop | Lisibilité, navigation tactile, aucun débordement |
| Build et qualité | Commandes réellement exécutées et résultats rapportés |

Ce tableau est un plan de vérification, pas un rapport de tests passés. Préciser ultérieurement version, environnement, résultats et limites.

## 8. Livrables futurs attendus

Architecture effectivement créée, fichiers importants, procédure de lancement, emplacement des données à remplacer (nom, logo, couleurs, prestations, prix, horaires, galerie, FAQ), inventaire des mocks, intégrations futures possibles, limites, résultat du build et des vérifications.

Critère commercial : montrer sur un téléphone le site, la réservation, le suivi, le cockpit, SmartFill, les récupérations, le retour, Voice et l'attribution en quelques minutes, sans devoir expliquer GHL et sans donner l'impression d'une connexion réelle.
