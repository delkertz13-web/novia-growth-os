import { Link, useParams } from "react-router-dom";
import { serviceById } from "../config/services.demo";
import {
  attendanceState,
  isAwaitingValidation,
  noShowCounts,
  statusLabels,
} from "../core/appointmentStatus";
import {
  appointmentLevel,
  formatEUR,
  levelLabels,
  sourceLabels,
} from "../core/revenue";
import { buildValidationSms } from "../core/smsValidation";
import { novia, originLabels } from "../domain";
import { Icon } from "../ui/Icon";
import {
  capitalize,
  fmt,
  SimBadge,
  StatusPill,
  useDemoState,
  useNow,
} from "../ui/common";
import { customerName, OutcomeButtons, RunCard } from "./parts";
import { useValidation } from "./Validation";

export function AppointmentDetail() {
  const { id } = useParams();
  const st = useDemoState();
  const now = useNow();
  const { pick, ui } = useValidation();
  const a = st.appointments.find((x) => x.id === id);
  if (!a) {
    return (
      <main className="wrap page" style={{ paddingTop: 30 }}>
        <p>Rendez-vous introuvable (la démo a peut-être été réinitialisée).</p>
        <Link to="/pro" className="btn btn--primary">
          Retour
        </Link>
      </main>
    );
  }
  const c = st.customers.find((x) => x.id === a.customerId);
  const s = serviceById(a.serviceId);
  const runs = st.runs
    .filter((r) => r.appointmentId === a.id)
    .sort((x, y) => y.startedAt.localeCompare(x.startedAt));
  const replacement = a.rescheduledToId
    ? st.appointments.find((x) => x.id === a.rescheduledToId)
    : undefined;
  const origin = a.rescheduledFromId
    ? st.appointments.find((x) => x.id === a.rescheduledFromId)
    : undefined;
  const counts = noShowCounts(st.appointments, a.customerId, now);
  const level = appointmentLevel(a);
  const awaiting = isAwaitingValidation(a, now);
  const pendingAll = st.appointments.filter((x) =>
    isAwaitingValidation(x, now),
  );
  const smsList = (
    awaiting ? (pendingAll.length > 1 ? pendingAll : [a]) : []
  ).map((x) => ({
    appointment: x,
    customerName: customerName(
      st.customers.find((cc) => cc.id === x.customerId),
    ),
  }));

  return (
    <main
      className="wrap page"
      style={{ display: "grid", gap: 16, paddingTop: 14 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link to="/pro" className="icon-btn" aria-label="Retour">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <span className="eyebrow">Rendez-vous {a.ref}</span>
      </div>

      <section className="card detail-hero">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div>
            <div className="detail-hero__time">{fmt.time(a.start)}</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {capitalize(fmt.dayLong(a.start))}
            </div>
          </div>
          <StatusPill appointment={a} now={now} />
        </div>
        <div>
          {c ? (
            <Link to={`/pro/clientes/${c.id}`} className="detail-hero__who">
              {customerName(c)} <Icon name="chevronRight" size={16} />
            </Link>
          ) : (
            <div style={{ fontWeight: 600, fontSize: 18 }}>
              {customerName(c)}
            </div>
          )}
          <div className="muted" style={{ fontSize: 14 }}>
            {s?.name} · {fmt.duration(a.durationMin)}
          </div>
        </div>
        <dl className="kv">
          <dt>Prix</dt>
          <dd>{fmt.eur(a.price)}</dd>
          <dt>Niveau de revenu</dt>
          <dd>{level ? levelLabels[level] : "Aucun"}</dd>
          <dt>Pris via</dt>
          <dd>{originLabels[a.bookingOrigin]}</dd>
          <dt>Attribution</dt>
          <dd>{sourceLabels[a.attribution]}</dd>
          <dt>Absences (30 j / 90 j / total)</dt>
          <dd>
            {counts.d30} / {counts.d90} / {counts.total}
          </dd>
          {c?.noShowRecovered && (
            <>
              <dt>Absence déjà récupérée</dt>
              <dd>Oui</dd>
            </>
          )}
        </dl>
        {replacement && (
          <Link
            to={`/pro/rdv/${replacement.id}`}
            className="btn btn--ghost btn--sm"
          >
            Reporté au {fmt.dayShort(replacement.start)} à{" "}
            {fmt.time(replacement.start)} <Icon name="arrowRight" size={16} />
          </Link>
        )}
        {origin && (
          <Link
            to={`/pro/rdv/${origin.id}`}
            className="muted"
            style={{ fontSize: 13 }}
          >
            Report du rendez-vous {origin.ref} ({fmt.dayShort(origin.start)})
          </Link>
        )}
      </section>

      {a.status !== "rescheduled" && (
        <section
          className="card"
          style={{ padding: 18, display: "grid", gap: 12 }}
        >
          <div style={{ fontWeight: 600 }}>
            {attendanceState(a, now) === "upcoming"
              ? "Rendez-vous à venir : annulation ou report possibles."
              : awaiting
                ? "Statut réel à confirmer"
                : "Corriger le statut si nécessaire"}
          </div>
          <OutcomeButtons a={a} now={now} onPick={(o) => pick(a, o)} />
          {awaiting && (
            <div className="muted" style={{ fontSize: 13 }}>
              Tant que rien n’est confirmé, aucun message lié à la présence ou à
              l’absence ne part.
            </div>
          )}
        </section>
      )}

      {a.status === "showed" && !a.paymentProof && (
        <button
          className="btn btn--ghost"
          onClick={() => novia.pro.recordPaymentProof(a.id)}
        >
          Simuler une preuve de paiement (fictive) → CA confirmé
        </button>
      )}

      {runs.length > 0 && (
        <section style={{ display: "grid", gap: 10 }}>
          <h2 className="p-section__title">Action NOVIA</h2>
          {runs.map((r) => (
            <RunCard key={r.id} run={r} customer={c} />
          ))}
        </section>
      )}

      {smsList.length > 0 && (
        <section
          className="card"
          style={{ padding: 18, display: "grid", gap: 10 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600 }}>Validation par SMS</span>
            <SimBadge label="Aperçu · non envoyé" />
          </div>
          <pre className="sms">{buildValidationSms(smsList)}</pre>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Avec plusieurs rendez-vous en attente, chaque ligne porte un
            identifiant : une réponse ambiguë n’est jamais appliquée.
          </div>
        </section>
      )}

      {a.history.length > 0 && (
        <section className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>
            Historique du statut
          </div>
          <ol className="steps">
            {a.history.map((h, i) => (
              <li key={i}>
                <span className="steps__dot steps__dot--info" />
                {statusLabels[h.from]} → {statusLabels[h.to]}
                {h.note ? ` (${h.note})` : ""} · source : {h.source}
                <span className="steps__time">
                  {capitalize(fmt.dayShort(h.at))} · {fmt.time(h.at)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        {formatEUR(a.price)} · données de démonstration
      </div>
      {ui}
    </main>
  );
}
