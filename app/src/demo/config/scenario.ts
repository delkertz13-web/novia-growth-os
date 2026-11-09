/**
 * Scénario de DÉMONSTRATION.
 *
 * En mode démo, NOVIA ne lit jamais l'heure réelle : toute l'application (cockpit,
 * réservation, workflows, indicateurs) vit à cette date et à cette heure de référence.
 * La démonstration est donc identique le matin, le soir ou un autre jour.
 *
 * Heure MURALE du salon, lue dans son fuseau (BusinessProfile, Europe/Paris en démo) :
 * l'agenda affiche 15h10 quel que soit le fuseau de l'appareil qui présente la démo.
 * Choisir un jour ouvert, l'après-midi : scenario.test.ts vérifie que la référence
 * produit toutes les situations attendues (RDV à confirmer, créneau SmartFill, etc.).
 */
export const demoScenario = {
  /** jeudi 19 novembre 2026, 15h10 */
  referenceDate: '2026-11-19T15:10:00',
} as const
