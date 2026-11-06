/**
 * Réaction du système à une décision de la professionnelle.
 *
 * Après chaque validation (présente, absente, annulée, reportée), le domaine décrit
 * en étapes ce que NOVIA vient de faire, à partir de l'état RÉEL relu après l'action
 * (et non d'un texte figé). Le cockpit joue ces étapes une à une.
 */
import type { WorkflowRules } from "../config/schema";
import type { Appointment, ValidationOutcome } from "../core/types";
import type { NoviaSnapshot } from "../providers/types";

export type ReactionTone = "status" | "novia" | "slot" | "money" | "calm";

export interface ReactionStep {
  key: string;
  tone: ReactionTone;
  label: string;
  detail?: string;
  /** montant à faire défiler (euros) */
  amount?: number;
  amountLabel?: string;
}

export interface Reaction {
  outcome: ValidationOutcome;
  /** libellé court de l'état final, affiché sur la carte du RDV */
  stateLabel: string;
  appointmentId: string;
  /** RDV résultant (différent en cas de report) */
  resultAppointmentId: string;
  customerId: string;
  runId?: string;
  smartfillId?: string;
  steps: ReactionStep[];
}

const dayTime = (iso: string) =>
  new Date(iso)
    .toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(":", "h");

const shortSlot = (iso: string) =>
  new Date(iso)
    .toLocaleString("fr-FR", {
      weekday: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(".", "")
    .replace(":", "h");

const stateLabels: Record<ValidationOutcome, string> = {
  present: "Présente",
  absent: "Absente",
  cancelled: "Annulée",
  rescheduled: "Reportée",
};

export function reactionFor(
  outcome: ValidationOutcome,
  before: Appointment,
  after: Appointment,
  snap: Pick<NoviaSnapshot, "runs" | "opportunities" | "customers">,
  rules: WorkflowRules,
): Reaction {
  const run = [...snap.runs]
    .reverse()
    .find(
      (r) =>
        r.appointmentId === before.id &&
        (r.workflow === "W03" || r.workflow === "W04"),
    );
  const smartfill = snap.opportunities.find(
    (o) =>
      o.kind === "smartfill" &&
      o.status === "open" &&
      o.sourceAppointmentId === before.id,
  );
  const steps: ReactionStep[] = [];

  switch (outcome) {
    case "present":
      steps.push(
        {
          key: "status",
          tone: "status",
          label: "Présence enregistrée",
          detail: "Le rendez-vous est marqué « présente » dans l’agenda.",
        },
        {
          key: "novia",
          tone: "calm",
          label: "NOVIA clôt le suivi",
          detail: "Plus de rappel pour ce rendez-vous.",
        },
        {
          key: "money",
          tone: "money",
          label: "Revenu",
          amount: before.price,
          amountLabel: "en CA réservé",
          detail: "Il passera en CA confirmé avec une preuve de paiement.",
        },
      );
      break;

    case "absent":
      steps.push({
        key: "status",
        tone: "status",
        label: "Absence enregistrée",
        detail: "Marquée absente dans l’agenda. Aucune pénalité automatique.",
      });
      if (run?.state === "active")
        steps.push({
          key: "novia",
          tone: "novia",
          label: "NOVIA récupère cette absence",
          detail: `Dans ${rules.w04.waitBeforeRecoveryHours} h, un message bienveillant pour proposer un nouveau créneau (simulé).`,
        });
      else
        steps.push({
          key: "novia",
          tone: "calm",
          label: "NOVIA reste en retrait",
          detail: run?.actions.at(-1)?.label ?? "Aucune relance prévue.",
        });
      steps.push({
        key: "money",
        tone: "money",
        label: "À récupérer",
        amount: before.price,
        amountLabel: "à récupérer",
        detail: "Ajoutés au CA potentiel tant que la cliente n’a pas réservé.",
      });
      break;

    case "cancelled":
      steps.push({
        key: "status",
        tone: "status",
        label: "Annulation enregistrée",
        detail: "Les rappels de ce rendez-vous sont arrêtés.",
      });
      if (smartfill?.slotStart)
        steps.push({
          key: "slot",
          tone: "slot",
          label: "Créneau libéré",
          detail: `${shortSlot(smartfill.slotStart)} · ${smartfill.slotDurationMin ?? before.durationMin} min · NOVIA peut le proposer à une cliente.`,
        });
      if (run?.state === "active")
        steps.push({
          key: "novia",
          tone: "novia",
          label: "NOVIA récupère cette annulation",
          detail: `Dans ${rules.w03.waitBeforeRecoveryHours} h, un message pour reprendre rendez-vous (simulé).`,
        });
      else if (run)
        steps.push({
          key: "novia",
          tone: "calm",
          label: "Pas de relance",
          detail: run.actions.at(-1)?.label,
        });
      steps.push({
        key: "money",
        tone: "money",
        label: "À récupérer",
        amount: before.price,
        amountLabel: "à récupérer",
        detail: "Ajoutés au CA potentiel.",
      });
      break;

    case "rescheduled":
      steps.push(
        {
          key: "status",
          tone: "status",
          label: "Rendez-vous reporté",
          detail: `Nouveau créneau : ${dayTime(after.start)}.`,
        },
        {
          key: "novia",
          tone: "novia",
          label: "Rappels recalculés",
          detail: `Anciens rappels annulés. Nouveaux rappels ${rules.w02.remindersHoursBefore.map((h) => `${h} h`).join(" et ")} avant (simulés).`,
        },
        {
          key: "money",
          tone: "money",
          label: "Revenu",
          amount: before.price,
          amountLabel: "toujours réservés",
          detail: "Un report ne crée pas de deuxième vente.",
        },
      );
      break;
  }

  return {
    outcome,
    stateLabel: stateLabels[outcome],
    appointmentId: before.id,
    resultAppointmentId: after.id,
    customerId: before.customerId,
    runId: run?.state === "active" ? run.id : undefined,
    smartfillId: smartfill?.id,
    steps,
  };
}
