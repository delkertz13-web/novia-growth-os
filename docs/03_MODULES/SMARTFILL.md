# NOVIA SmartFill

Statut : **DECIDED — concept ; SPECIFIED — scénario démo ; W12 À CONCEVOIR**. Sources : S2/S3/S4.

## Concept retrouvé

Lorsqu'un créneau se libère, identifier des clientes potentiellement éligibles et tenter de le remplir selon des règles configurées. Ne pas contacter automatiquement toute la base sans règles, consentement et contrôle.

La liste d'attente peut recueillir prestation, jours préférés, matin/après-midi/soir et flexibilité. La récupération d'une cliente ayant annulé (W03) et le remplissage d'un créneau (SmartFill) sont deux parcours à articuler.

## Scénario de démo fourni

Carte « Créneau libre » : vendredi 15h30, 60 minutes. Bouton « Lancer SmartFill ». Simulation : 8 éligibles → 5 contactables → 1 réservation. Ces nombres viennent d'un exemple de démonstration, pas d'un résultat réel ni d'un taux de conversion promis.

Le dialogue explique : « NOVIA contacterait les clientes éligibles selon les règles configurées ». Aucun message n'est envoyé. Le résultat doit rester signalé « Simulation ».

## Ce qui n'est pas décidé

Classement, vagues, taille de lot, fréquence, expiration, priorité, réservation concurrente et définition exacte de la contactabilité. Le principe « la première qui réserve récupère le créneau » est évoqué dans une proposition historique ; la gestion transactionnelle et la politique finale restent à concevoir, sans promettre un verrouillage réel.

Voir `../02_WORKFLOWS/W12_SMARTFILL.md` et `../01_CORE/ATTRIBUTION_REVENUE.md`. Une réservation de remplissage n'est jamais automatiquement un encaissement.
