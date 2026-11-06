/**
 * Liste des clientes : recherche et segments du quotidien.
 * Fonctions pures sur l'instantané métier, sans React ni provider.
 */
import type { ServiceConfig } from "../config/schema";
import { isActiveBooking } from "../core/appointmentStatus";
import { refillsDue } from "../core/smartfill";
import type { Appointment, Customer } from "../core/types";
import type { NoviaSnapshot } from "../providers/types";
import { normalize } from "./conversations";

export type Segment =
  | "active"
  | "to_follow_up"
  | "refill"
  | "new_lead"
  | "recent_no_show"
  | "human";

export const segmentLabels: Record<Segment, string> = {
  active: "Actives",
  to_follow_up: "À relancer",
  refill: "Remplissage à prévoir",
  new_lead: "Nouveaux leads",
  recent_no_show: "Absence récente",
  human: "Reprise humaine",
};

export const segmentHelp: Record<Segment, string> = {
  active: "Un rendez-vous à venir, ou venue ces 60 derniers jours.",
  to_follow_up: "Une récupération NOVIA en cours (annulation ou absence).",
  refill:
    "Dernière pose proche de la date de remplissage conseillée, sans RDV prévu.",
  new_lead: "Contact de moins de 7 jours, ou prospect sans rendez-vous.",
  recent_no_show: "Absence attestée ces 30 derniers jours.",
  human: "Vous avez repris la conversation : NOVIA n’envoie rien.",
};

const DAY = 86_400_000;

export interface CustomerRow {
  customer: Customer;
  segments: Segment[];
  next?: Appointment;
  last?: Appointment;
}

/** Segments d'une cliente. Une cliente peut appartenir à plusieurs segments. */
export function buildCustomerRows(
  snap: NoviaSnapshot,
  now: Date,
  services: ServiceConfig[],
): CustomerRow[] {
  const t = now.getTime();
  const refill = new Set(
    refillsDue(snap.customers, snap.appointments, services, now).map(
      (r) => r.customer.id,
    ),
  );
  return snap.customers
    .map((customer): CustomerRow => {
      const mine = snap.appointments
        .filter((a) => a.customerId === customer.id)
        .sort((a, b) => a.start.localeCompare(b.start));
      const next = mine.find(
        (a) => isActiveBooking(a.status) && new Date(a.start).getTime() > t,
      );
      const last = [...mine].reverse().find((a) => a.status === "showed");
      const segments: Segment[] = [];
      if (next || (last && t - new Date(last.start).getTime() <= 60 * DAY))
        segments.push("active");
      if (
        snap.runs.some(
          (r) =>
            r.customerId === customer.id &&
            (r.state === "active" || r.state === "paused") &&
            (r.workflow === "W03" || r.workflow === "W04"),
        )
      )
        segments.push("to_follow_up");
      if (refill.has(customer.id)) segments.push("refill");
      if (
        t - new Date(customer.createdAt).getTime() <= 7 * DAY ||
        (customer.lifecycle === "prospect" && !next)
      )
        segments.push("new_lead");
      if (
        mine.some(
          (a) =>
            a.status === "no_show" &&
            t - new Date(a.start).getTime() <= 30 * DAY,
        )
      )
        segments.push("recent_no_show");
      if (customer.humanTakeover) segments.push("human");
      return { customer, segments, next, last };
    })
    .sort((a, b) =>
      `${a.customer.firstName} ${a.customer.lastName}`.localeCompare(
        `${b.customer.firstName} ${b.customer.lastName}`,
        "fr",
      ),
    );
}

/** Recherche tolérante : nom, prénom, téléphone (chiffres seuls) ou e-mail, sans accents. */
export function matchesSearch(c: Customer, query: string) {
  const q = normalize(query.trim());
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 2 && c.phone.replace(/\D/g, "").includes(digits))
    return true;
  const hay = normalize(
    `${c.firstName} ${c.lastName} ${c.lastName} ${c.firstName} ${c.email}`,
  );
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function filterCustomers(
  rows: CustomerRow[],
  opts: { query?: string; segment?: Segment | null },
) {
  return rows.filter(
    (r) =>
      (!opts.segment || r.segments.includes(opts.segment)) &&
      matchesSearch(r.customer, opts.query ?? ""),
  );
}

export function segmentCounts(rows: CustomerRow[]): Record<Segment, number> {
  const out = Object.fromEntries(
    Object.keys(segmentLabels).map((k) => [k, 0]),
  ) as Record<Segment, number>;
  rows.forEach((r) => r.segments.forEach((s) => out[s]++));
  return out;
}
