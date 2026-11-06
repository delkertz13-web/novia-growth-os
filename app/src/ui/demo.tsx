/**
 * Commandes de DÉMONSTRATION (jamais visibles d'une cliente réelle : elles n'existent
 * qu'avec les providers de démo). Bandeau « DÉMO », réinitialisation complète du
 * scénario et mode présentation.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { novia } from "../domain";
import { Icon } from "./Icon";
import { presentation, presentationSteps } from "./presentation";
import { Sheet } from "./common";

/* ---------------- Époque de remise à zéro ---------------- */

let epoch = 0;
const epochListeners = new Set<() => void>();
/** Change à chaque réinitialisation : l'application se remonte sans aucun état d'écran résiduel. */
export const useResetEpoch = () =>
  useSyncExternalStore(
    (l) => {
      epochListeners.add(l);
      return () => void epochListeners.delete(l);
    },
    () => epoch,
  );

/** Remet le scénario de référence : données NOVIA, écrans, et parcours de présentation. */
export function resetDemonstration() {
  novia.demo?.reset();
  if (presentation.get().on) presentation.set({ step: 0 });
  epoch++;
  epochListeners.forEach((l) => l());
}

const usePresentation = () =>
  useSyncExternalStore(presentation.subscribe, presentation.get);

/* ---------------- Bandeau ---------------- */

export function DemoBanner() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isPro = pathname.startsWith("/pro");
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const pres = usePresentation();
  // les en-têtes collants se placent sous le bandeau complet (ligne DÉMO + barre de présentation éventuelle)
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bannerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const parts = el.querySelectorAll<HTMLElement>(
        ":scope > .demo-banner__row, :scope > .pres",
      );
      const h = Array.from(parts).reduce((sum, c) => sum + c.offsetHeight, 0);
      document.documentElement.style.setProperty("--banner-h", `${h}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    el.querySelectorAll(":scope > .demo-banner__row, :scope > .pres").forEach(
      (c) => ro.observe(c),
    );
    return () => ro.disconnect();
  }, [pres.on]);
  const close = () => {
    setOpen(false);
    setConfirming(false);
    setDone(false);
  };
  const reset = () => {
    resetDemonstration();
    setConfirming(false);
    setDone(true);
    navigate(pres.on ? presentationSteps[0].path : isPro ? "/pro" : "/", {
      replace: true,
    });
    setTimeout(close, 900);
  };

  return (
    <div
      className="demo-banner"
      ref={bannerRef}
      role="note"
      aria-label="Démonstration NOVIA, données fictives"
    >
      <div className="wrap demo-banner__row">
        <button
          type="button"
          className="demo-banner__tag"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="Commandes de la démonstration"
        >
          DÉMO <Icon name="settings" size={12} />
        </button>
        <span className="demo-banner__text">
          Fictif<span className="demo-banner__more"> · aucun envoi réel</span>
        </span>
        <nav className="demo-banner__switch" aria-label="Changer d’espace">
          <Link to="/" viewTransition className={!isPro ? "is-active" : ""}>
            Cliente
          </Link>
          <Link to="/pro" viewTransition className={isPro ? "is-active" : ""}>
            Pro
          </Link>
        </nav>
      </div>
      {novia.demo && pres.on && <PresentationBar step={pres.step} />}

      <Sheet open={open} onClose={close} label="Commandes de la démonstration">
        <div className="demo-sheet">
          <span className="eyebrow">Démonstration NOVIA</span>
          <h2 className="display demo-sheet__title">Commandes de démo</h2>
          <p className="demo-sheet__text">
            Toutes les données sont fictives. Aucun SMS, appel, paiement ni
            réservation réelle n’est jamais effectué. Ces commandes n’existent
            pas dans NOVIA en production.
          </p>

          <label className="demo-sheet__row">
            <span>
              <strong>Mode présentation</strong>
              <span>
                Une indication discrète en haut de l’écran pour suivre le
                parcours en 18 étapes.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="demo-switch"
              checked={pres.on}
              onChange={(e) => presentation.set({ on: e.target.checked })}
            />
          </label>

          <div className="demo-sheet__reset">
            <strong>Réinitialiser la démonstration</strong>
            <span>
              Revient exactement au scénario de départ : clientes, rendez-vous,
              messages, appels, récupérations, réglages et chiffres.
            </span>
            {done ? (
              <span className="demo-sheet__done" role="status">
                <Icon name="check" size={16} /> Scénario de départ restauré
              </span>
            ) : confirming ? (
              <div className="demo-sheet__confirm">
                <button className="btn btn--lacquer btn--sm" onClick={reset}>
                  <Icon name="refresh" size={15} /> Oui, tout remettre à zéro
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setConfirming(false)}
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setConfirming(true)}
              >
                <Icon name="refresh" size={15} /> Réinitialiser
              </button>
            )}
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/* ---------------- Mode présentation ---------------- */

function PresentationBar({ step }: { step: number }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // navigation libre : si la présentatrice change de page elle-même, la barre suit (étape suivante la plus proche sur cette page)
  useEffect(() => {
    if (presentationSteps[step].path === pathname) return;
    const ahead = presentationSteps.findIndex(
      (x, i) => i > step && x.path === pathname,
    );
    const any =
      ahead >= 0
        ? ahead
        : presentationSteps.findIndex((x) => x.path === pathname);
    if (any >= 0) presentation.set({ step: any });
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = presentationSteps[step];
  const go = (i: number) => {
    presentation.set({ step: i });
    navigate(presentationSteps[i].path);
  };
  const last = step === presentationSteps.length - 1;
  return (
    <div className="wrap pres" aria-label="Mode présentation">
      <button
        type="button"
        className="pres__nav"
        onClick={() => go(step - 1)}
        disabled={step === 0}
        aria-label="Étape précédente"
      >
        <Icon name="arrowLeft" size={15} />
      </button>
      <div className="pres__body" aria-live="polite">
        <span className="pres__count">
          {step + 1}/{presentationSteps.length}
        </span>
        <span className="pres__text">
          <strong>{s.title}</strong> · {s.hint}
        </span>
      </div>
      <button
        type="button"
        className="pres__nav pres__nav--next"
        onClick={() => (last ? presentation.set({ on: false }) : go(step + 1))}
        aria-label={last ? "Terminer la présentation" : "Étape suivante"}
      >
        {last ? (
          <Icon name="check" size={15} />
        ) : (
          <Icon name="arrowRight" size={15} />
        )}
      </button>
    </div>
  );
}
