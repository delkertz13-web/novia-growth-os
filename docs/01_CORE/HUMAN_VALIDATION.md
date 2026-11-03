# Validation humaine et reprise de contrôle

Statut : **DECIDED — règles et actions ; SPECIFIED PARTIEL — protocole technique à concevoir**. Sources : S2 et S3.

## Présence : règle centrale

Après un rendez-vous, la professionnelle peut confirmer **Présente**, **Absente**, **Annulée** ou **Reportée**. Le fait que l'heure soit passée peut motiver une demande de validation, jamais une conclusion automatique de présence/absence. Aucun délai de demande n'est fixé dans la source accessible.

Sources envisagées : professionnelle, cockpit, interface mobile GHL à évaluer, notification, SMS fallback ou intégration fiable. Toutes sont des options à concevoir ou tester, aucune n'est connectée.

## Conséquences métier retrouvées

| Réponse | Conséquence conceptuelle | Limite |
|---|---|---|
| Présente | Peut permettre le suivi après prestation | W05 et suivants restent à concevoir ; ne prouve pas le paiement |
| Absente | Peut permettre la récupération no-show W04 | Revérifier état actuel et gardes communes |
| Annulée | Peut permettre W03 et ouvrir une opportunité SmartFill | W12 non conçu, aucun contact automatique global |
| Reportée | Choisir/rattacher un nouveau créneau | Arrêter l'ancienne séquence devenue obsolète |
| Inconnue / aucune réponse | Rester en attente | Aucun message dépendant de présence/absence |

## Validation SMS : exemple de source, pas message actif

« NOVIA — Julie Martin — RDV 14h30 / 1 Présente / 2 Absente / 3 Annulée / 4 Reportée ».

Julie Martin est un exemple fictif. Si plusieurs rendez-vous attendent une validation, la source impose un identifiant empêchant une mauvaise attribution. La syntaxe exacte, l'identification du répondant, la validité d'une réponse et le traitement d'une réponse tardive restent à concevoir. Une réponse ambiguë ne doit pas être appliquée arbitrairement.

## Reprise d'une conversation

La démo doit montrer « NOVIA répond », « Réponse humaine nécessaire » et « Professionnelle a repris la conversation », avec un bouton « Reprendre la conversation ». Une intervention humaine peut interrompre les automatismes incompatibles. La reprise automatique éventuelle nécessite une règle à définir ; ne pas l'inventer.

## Audit proposé

Pour rendre une validation vérifiable, conserver conceptuellement le rendez-vous ciblé, l'ancien et le nouvel état, l'auteur/la source et le moment. Cette traçabilité est une proposition de conception. Corrections, validations contradictoires et conflits avec un report récent sont à arbitrer avant connexion réelle.
