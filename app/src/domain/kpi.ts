/**
 * Définitions des indicateurs du cockpit, affichées telles quelles à la professionnelle
 * (« Comment sont calculés ces chiffres ? ») et documentées dans KPI.md.
 */
export interface KpiDefinition {
  id: "today" | "toRecover" | "noviaWon" | "freedSlots";
  label: string;
  level: "réservé + confirmé" | "potentiel" | "aucun montant";
  rule: string;
}

export const kpiDefinitions: KpiDefinition[] = [
  {
    id: "today",
    label: "CA du jour",
    level: "réservé + confirmé",
    rule: "Les rendez-vous d’aujourd’hui qui comptent : à venir, en cours, ou présence attestée. Le détail sépare le réservé (pas encore encaissé) du confirmé (présence attestée et preuve de paiement). Absences et annulations n’y figurent pas.",
  },
  {
    id: "toRecover",
    label: "À récupérer",
    level: "potentiel",
    rule: "Rendez-vous perdus (absence, annulation) que NOVIA peut encore regagner. Chaque rendez-vous perdu compte une seule fois, même s’il ouvre à la fois une relance et un créneau à remplir. Il sort du total dès qu’il est regagné. Ce n’est ni réservé, ni encaissé.",
  },
  {
    id: "noviaWon",
    label: "Gagné par NOVIA",
    level: "réservé + confirmé",
    rule: "Rendez-vous obtenus ce mois-ci (selon la date du rendez-vous) grâce à NOVIA : créneau libéré rempli, annulation ou absence récupérée, appel pris par NOVIA Voice. La part « confirmée » est celle dont la prestation est attestée avec une preuve de paiement. Une attribution n’est pas une preuve de causalité.",
  },
  {
    id: "freedSlots",
    label: "Créneaux libérés",
    level: "aucun montant",
    rule: "Créneaux à venir libérés par une annulation, que NOVIA peut proposer à une cliente. Leur valeur est déjà incluse dans « À récupérer ».",
  },
];
