import type { WorkflowRules } from "../config/schema";
import { isActiveBooking } from "./appointmentStatus";
import type {
  Appointment,
  Customer,
  WorkflowAction,
  WorkflowId,
  WorkflowRun,
} from "./types";

/* ------------------------------------------------------------------ */
/* Plage d'envoi                                                        */
/* ------------------------------------------------------------------ */

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function isWithinSendWindow(
  at: Date,
  window: WorkflowRules["sendWindow"],
): boolean {
  const m = at.getHours() * 60 + at.getMinutes();
  return m >= toMinutes(window.start) && m < toMinutes(window.end);
}

/** Prochaine ouverture de la plage d'envoi (ou `at` si déjà dans la plage). */
export function nextSendWindowStart(
  at: Date,
  window: WorkflowRules["sendWindow"],
): Date {
  if (isWithinSendWindow(at, window)) return at;
  const start = toMinutes(window.start);
  const d = new Date(at);
  const m = at.getHours() * 60 + at.getMinutes();
  if (m >= toMinutes(window.end)) d.setDate(d.getDate() + 1);
  d.setHours(Math.floor(start / 60), start % 60, 0, 0);
  return d;
}

/* ------------------------------------------------------------------ */
/* Contrôles communs avant tout envoi                                   */
/* ------------------------------------------------------------------ */

export interface GuardContext {
  customer: Customer;
  appointments: Appointment[];
  runs: WorkflowRun[];
  now: Date;
  rules: WorkflowRules;
  /** workflow qui demande l'envoi */
  workflow: WorkflowId;
  /** run concerné (exclu du contrôle d'incompatibilité) */
  runId?: string;
  /** RDV d'origine (annulé / absent) pour W03 / W04 */
  sourceAppointment?: Appointment;
}

export type GuardDecision =
  | { kind: "send" }
  | { kind: "wait"; reason: string; until: Date }
  | { kind: "stop"; reason: string; transition?: WorkflowId };

/** Workflows qui ne peuvent pas envoyer en même temps au même contact. */
const incompatible: Record<WorkflowId, WorkflowId[]> = {
  W01: ["W03", "W04"],
  W02: [],
  W03: ["W01", "W04"],
  W04: ["W01", "W03"],
  W05: [],
  W12: [],
};

export function hasFutureBooking(
  appointments: Appointment[],
  customerId: string,
  now: Date,
  excludeId?: string,
) {
  return appointments.some(
    (a) =>
      a.customerId === customerId &&
      a.id !== excludeId &&
      isActiveBooking(a.status) &&
      new Date(a.start).getTime() > now.getTime(),
  );
}

/**
 * Relit l'état ACTUEL avant chaque action sensible (règles communes + W01 à W04).
 * L'ordre reflète la priorité : ce qui rend la séquence obsolète d'abord.
 */
export function evaluateGuards(ctx: GuardContext): GuardDecision {
  const {
    customer,
    appointments,
    runs,
    now,
    rules,
    workflow,
    sourceAppointment,
  } = ctx;

  // État du RDV d'origine encore valable ?
  if (
    workflow === "W04" &&
    sourceAppointment &&
    sourceAppointment.status !== "no_show"
  ) {
    return {
      kind: "stop",
      reason:
        "Le rendez-vous n’est plus marqué « Absente » : plus rien à récupérer.",
    };
  }
  if (
    workflow === "W03" &&
    sourceAppointment &&
    sourceAppointment.status !== "cancelled"
  ) {
    return {
      kind: "stop",
      reason: "Le rendez-vous n’est plus annulé : plus rien à récupérer.",
    };
  }

  // Nouveau RDV déjà réservé → retour W02
  if (hasFutureBooking(appointments, customer.id, now)) {
    return {
      kind: "stop",
      reason: "La cliente a déjà un nouveau rendez-vous.",
      transition: "W02",
    };
  }

  // W01 : déjà cliente
  if (workflow === "W01" && customer.lifecycle === "client") {
    return { kind: "stop", reason: "Elle est déjà cliente." };
  }

  if (customer.optOut)
    return {
      kind: "stop",
      reason: "Opposition enregistrée : la cliente a répondu STOP.",
    };
  if (!customer.consent.transactional)
    return { kind: "stop", reason: "Pas de consentement pour lui écrire." };
  if (customer.humanTakeover)
    return { kind: "stop", reason: "Vous avez repris la conversation." };

  const blocking = runs.find(
    (r) =>
      r.id !== ctx.runId &&
      r.customerId === customer.id &&
      r.state === "active" &&
      incompatible[workflow].includes(r.workflow),
  );
  if (blocking) {
    return {
      kind: "wait",
      reason: "Un autre suivi NOVIA est déjà en cours pour elle.",
      until: now,
    };
  }

  if (!isWithinSendWindow(now, rules.sendWindow)) {
    return {
      kind: "wait",
      reason: "En dehors de vos horaires d’envoi : NOVIA attend.",
      until: nextSendWindowStart(now, rules.sendWindow),
    };
  }
  return { kind: "send" };
}

/* ------------------------------------------------------------------ */
/* W02 — rappels                                                        */
/* ------------------------------------------------------------------ */

/** Rappels encore à venir pour un RDV actif (recalculés à chaque déplacement). */
export function reminderTimes(
  a: Appointment,
  rules: WorkflowRules,
  now: Date,
): Date[] {
  if (!isActiveBooking(a.status)) return [];
  const start = new Date(a.start).getTime();
  return rules.w02.remindersHoursBefore
    .map((h) => new Date(start - h * 3_600_000))
    .filter((d) => d.getTime() > now.getTime());
}

/* ------------------------------------------------------------------ */
/* W03 / W04 — séquence de récupération                                 */
/* ------------------------------------------------------------------ */

/**
 * Identifiant déterministe : une séquence par RDV et par validation (l'historique du
 * statut grandit à chaque validation, une correction ouvre donc un nouvel identifiant).
 */
const runId = (wf: WorkflowId, source: Appointment) =>
  `run-${wf}-${source.id}-${source.history.length}`;

const act = (
  now: Date,
  kind: WorkflowAction["kind"],
  label: string,
): WorkflowAction => ({
  at: now.toISOString(),
  kind,
  label,
});

export function startRecovery(
  workflow: "W03" | "W04",
  source: Appointment,
  rules: WorkflowRules,
  now: Date,
): WorkflowRun {
  if (workflow === "W04" && source.status !== "no_show") {
    throw new Error("W04 ne démarre que sur une absence confirmée.");
  }
  if (workflow === "W03" && source.status !== "cancelled") {
    throw new Error("W03 ne démarre que sur une annulation confirmée.");
  }
  const wait =
    workflow === "W03"
      ? rules.w03.waitBeforeRecoveryHours
      : rules.w04.waitBeforeRecoveryHours;
  return {
    id: runId(workflow, source),
    workflow,
    customerId: source.customerId,
    appointmentId: source.id,
    state: "active",
    step: "wait",
    messagesSent: 0,
    startedAt: now.toISOString(),
    actions: [
      act(
        now,
        "info",
        workflow === "W03"
          ? "Annulation confirmée : les rappels sont arrêtés."
          : "Absence confirmée par vous.",
      ),
      act(now, "info", `NOVIA attend ${wait} h avant d’écrire.`),
    ],
  };
}

const stopRun = (
  run: WorkflowRun,
  now: Date,
  reason: string,
  outcome: string,
): WorkflowRun => ({
  ...run,
  state: outcome === "recovered" ? "completed" : "stopped",
  step: "done",
  endedAt: now.toISOString(),
  outcome,
  actions: [...run.actions, act(now, "stop", reason)],
});

/**
 * Fait avancer une séquence W03 / W04 d'une étape, en relisant l'état actuel.
 * Aucun message n'est envoyé : les messages sont SIMULÉS.
 */
export function advanceRecovery(
  run: WorkflowRun,
  ctx: Omit<GuardContext, "workflow" | "runId">,
): WorkflowRun {
  if (run.state !== "active") return run;
  const { now } = ctx;
  const guard = evaluateGuards({
    ...ctx,
    workflow: run.workflow,
    runId: run.id,
  });

  if (guard.kind === "stop") {
    const recovered = guard.transition === "W02";
    return stopRun(
      run,
      now,
      `NOVIA s’arrête : ${guard.reason}`,
      recovered ? "recovered" : "stopped",
    );
  }
  if (guard.kind === "wait") {
    return {
      ...run,
      actions: [
        ...run.actions,
        act(now, "blocked", `En attente : ${guard.reason}`),
      ],
    };
  }

  const label =
    run.workflow === "W04"
      ? "bienveillant, sans reproche, avec un nouveau créneau"
      : "proposant de reprendre rendez-vous";
  switch (run.step) {
    case "wait":
    case "recheck":
      return {
        ...run,
        step: "await_reply",
        messagesSent: run.messagesSent + 1,
        actions: [
          ...run.actions,
          act(
            now,
            "check_ok",
            "Vérification avant envoi : situation inchangée, pas de nouveau RDV, pas d’opposition.",
          ),
          act(
            now,
            "message_simulated",
            `Message ${label} (simulé, aucun envoi).`,
          ),
        ],
      };
    case "await_reply":
      return {
        ...run,
        step: "await_final",
        messagesSent: run.messagesSent + 1,
        actions: [
          ...run.actions,
          act(
            now,
            "check_ok",
            "Pas de réponse. Nouvelle vérification avant envoi : OK.",
          ),
          act(
            now,
            "message_simulated",
            "Dernière relance, toujours bienveillante (simulée).",
          ),
        ],
      };
    case "await_final":
      return stopRun(
        run,
        now,
        "Pas de réponse après la dernière relance : NOVIA s’arrête.",
        "no_response",
      );
    default:
      return run;
  }
}

/** La cliente refuse : STOP immédiat. */
const open = (run: WorkflowRun) =>
  run.state === "active" || run.state === "paused";

export const declineRecovery = (run: WorkflowRun, now: Date) =>
  open(run)
    ? stopRun(
        run,
        now,
        "La cliente ne souhaite pas reprendre rendez-vous : NOVIA s’arrête.",
        "declined",
      )
    : run;

/** La cliente réserve : STOP et retour W02. */
export const markRecovered = (run: WorkflowRun, now: Date) =>
  open(run)
    ? stopRun(
        run,
        now,
        "Nouveau rendez-vous réservé : récupération réussie.",
        "recovered",
      )
    : run;

/** Reprise humaine : la séquence se met en pause (aucun envoi), sans perdre son étape. */
export const pauseRun = (run: WorkflowRun, now: Date): WorkflowRun =>
  run.state === "active"
    ? {
        ...run,
        state: "paused",
        actions: [
          ...run.actions,
          act(now, "blocked", "En pause : vous avez repris la conversation."),
        ],
      }
    : run;

/** La professionnelle rend la main : la séquence reprend, et revérifie tout avant le prochain envoi. */
export const resumeRun = (run: WorkflowRun, now: Date): WorkflowRun =>
  run.state === "paused"
    ? {
        ...run,
        state: "active",
        actions: [
          ...run.actions,
          act(now, "info", "Vous avez rendu la main à NOVIA."),
        ],
      }
    : run;

/**
 * Rendre à NOVIA : la séquence en pause est relue contre l'état ACTUEL avant de reprendre
 * (statut du RDV d'origine, nouveau RDV, opposition, consentement). Si la situation est
 * devenue incompatible, elle s'arrête au lieu de reprendre. Aucun message n'est envoyé ici.
 */
export function resumeAfterRecheck(
  run: WorkflowRun,
  ctx: Omit<GuardContext, "workflow" | "runId">,
): WorkflowRun {
  if (run.state !== "paused") return run;
  const { now } = ctx;
  const guard = evaluateGuards({
    ...ctx,
    workflow: run.workflow,
    runId: run.id,
  });
  if (guard.kind === "stop") {
    const recovered = guard.transition === "W02";
    return stopRun(
      run,
      now,
      `Vérification au retour : ${guard.reason} NOVIA ne reprend pas.`,
      recovered ? "recovered" : "stopped",
    );
  }
  const resumed = resumeRun(run, now);
  return {
    ...resumed,
    actions: [
      ...resumed.actions,
      act(
        now,
        guard.kind === "send" ? "check_ok" : "blocked",
        guard.kind === "send"
          ? "Vérification au retour : situation inchangée, consentement et pas d’opposition. NOVIA reprend."
          : `Vérification au retour : situation inchangée. ${guard.reason}`,
      ),
    ],
  };
}

/**
 * Correction de statut : l'état actuel écrase l'ancien,
 * les workflows devenus incompatibles sont stoppés.
 */
export function stopObsoleteRuns(
  runs: WorkflowRun[],
  appointment: Appointment,
  now: Date,
): WorkflowRun[] {
  return runs.map((r) => {
    if (!open(r) || r.appointmentId !== appointment.id) return r;
    const stillValid =
      (r.workflow === "W04" && appointment.status === "no_show") ||
      (r.workflow === "W03" && appointment.status === "cancelled");
    return stillValid
      ? r
      : stopRun(
          r,
          now,
          "Statut corrigé : plus rien à récupérer, NOVIA s’arrête.",
          "obsolete",
        );
  });
}

/* ------------------------------------------------------------------ */
/* W01 — relance d'un prospect                                          */
/* ------------------------------------------------------------------ */

export function evaluateW01FollowUp(
  ctx: Omit<GuardContext, "workflow"> & { followUpsSent: number },
): GuardDecision {
  if (ctx.followUpsSent >= ctx.rules.w01.maxFollowUps) {
    return { kind: "stop", reason: "Nombre maximal de relances atteint." };
  }
  return evaluateGuards({ ...ctx, workflow: "W01" });
}
