# GoHighLevel — architecture future

Statut : **ENVISAGÉ / À VALIDER**, aucune connexion. Sources : S2/S3. Ce document décrit une cible NOVIA, pas une documentation technique GHL vérifiée.

## Rôle possible

GHL pourra servir de moteur pour CRM, calendrier, workflows, conversations, SMS, Voice AI, paiements et reporting. La disponibilité exacte, les restrictions, coûts et modalités d'intégration doivent être vérifiés lorsque cette étape devient pertinente.

L'expérience professionnelle doit rester simple et porter NOVIA. Le choix de GHL ne doit pas rendre l'interface cliente impossible à adapter à un autre backend.

## Mapping conceptuel à étudier

| Besoin NOVIA | Cible envisagée | Travail restant |
|---|---|---|
| Contacts et historique | CRM GHL possible | Modèle, dédoublonnage, droits et synchronisation |
| Réservations | Calendrier GHL possible | Disponibilités, statuts, reports, source de vérité |
| Automatisations | Workflows GHL possibles | Traduction des règles et contrôle de l'état actuel |
| Messages et reprise humaine | Conversations / SMS possibles | Canaux, consentements, STOP, escalade |
| Appels | Voice AI possible | Téléphonie, FAQ, limites, transfert |
| Acomptes / paiements | Moteur de paiement à évaluer | Fournisseur, preuve financière, erreurs |
| Revenue | Données métier et reporting | Attribution sans double compte |

Les noms `GHLBookingProvider`, `GHLCRMProvider`, `GHLMessagingProvider` et `GHLVoiceProvider` sont des concepts de séparation. Ils ne représentent pas des connecteurs déjà écrits.

## Inconnues techniques

Organisation des comptes, accès, mapping des champs/tags, API/événements disponibles, résolution des conflits, isolation des données et exploitation. Aucun snapshot, workflow importable, clé API ou credential n'est livré.

La formation GHL/Notion mentionnée dans la conversation n'a pas été fournie. Elle pourra servir de référence, sans être copiée aveuglément comme architecture NOVIA.
