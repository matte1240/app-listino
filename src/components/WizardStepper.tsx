"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Destinazione di uscita "pagina precedente": la conferma di uscita aperta dal gesto indietro torna lì. */
export const WIZARD_BACK_HREF = "#wizard-back";

const GUARD_STATE_KEY = "__wizardBackGuard";

function pushBackGuard() {
  window.history.pushState({ ...window.history.state, [GUARD_STATE_KEY]: true }, "");
}

/**
 * Gesto o pulsante "indietro" del browser dentro un wizard: una voce di cronologia sentinella intercetta
 * il back, così si torna allo step precedente (o si apre la conferma di uscita) invece di lasciare la pagina.
 * `onBack` restituisce `true` se ha gestito l'indietro, `false` per uscire davvero dal wizard.
 * Restituisce la funzione che esce tornando alla pagina precedente al wizard (`WIZARD_BACK_HREF`),
 * con `fallbackHref` se il wizard è la prima pagina della scheda.
 */
export function useWizardBackGuard({ enabled, onBack, fallbackHref }: { enabled: boolean; onBack: () => boolean; fallbackHref: string }) {
  const router = useRouter();
  const onBackRef = useRef(onBack);
  const leavingRef = useRef(false);
  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!enabled) return;
    leavingRef.current = false;
    const wizardUrl = window.location.pathname + window.location.search;
    // Voci del wizard (e sentinelle, che ne ereditano la modalità) senza ripristino dello scroll: tornando sulla voce
    // del wizard il browser riporterebbe la pagina alla posizione di quando è stata aggiunta la sentinella.
    window.history.scrollRestoration = "manual";
    // Rientrando su una sentinella già presente (es. avanti/indietro tra le pagine) non se ne aggiunge un'altra.
    if (!window.history.state?.[GUARD_STATE_KEY]) pushBackGuard();

    const onPopState = (event: PopStateEvent) => {
      // Uscita in corso, "avanti" verso una sentinella o voce di un'altra pagina: ci pensa il router.
      if (leavingRef.current || event.state?.[GUARD_STATE_KEY]) return;
      if (window.location.pathname + window.location.search !== wizardUrl) return;
      if (onBackRef.current()) {
        pushBackGuard();
      } else {
        leavingRef.current = true;
        window.history.back();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Eseguito a navigazione avvenuta: la voce della nuova pagina torna al ripristino automatico.
      window.history.scrollRestoration = "auto";
    };
  }, [enabled]);

  return useCallback(() => {
    leavingRef.current = true;
    const fallback = window.setTimeout(() => router.replace(fallbackHref), 600);
    window.addEventListener("popstate", () => window.clearTimeout(fallback), { once: true });
    // Sentinella → voce del wizard → pagina precedente.
    window.history.go(-2);
  }, [fallbackHref, router]);
}

/**
 * Schermata "riprendi" mostrata dopo un ricaricamento a wizard aperto: la sentinella rimasta nella cronologia
 * assorbirebbe il primo "indietro". Si torna sulla voce del wizard (stesso URL), così il prossimo indietro esce.
 */
export function useDropStaleBackGuard(active: boolean) {
  useEffect(() => {
    if (active && window.history.state?.[GUARD_STATE_KEY]) window.history.back();
  }, [active]);
}

type Step = 1 | 2 | 3 | 4;

interface Props {
  labels: readonly string[];
  currentStep: Step;
  canReachStep: (step: Step) => boolean;
  onStepClick: (step: Step) => void;
  className?: string;
}

/** Avanzamento dei wizard: barre a segmenti su mobile, pillole cliccabili da tablet in su. */
export default function WizardStepper({ labels, currentStep, canReachStep, onStepClick, className }: Props) {
  const steps = labels.map((label, idx) => {
    const step = (idx + 1) as Step;
    return { label, step, isActive: currentStep === step, isDone: currentStep > step, reachable: canReachStep(step) };
  });

  return (
    <nav aria-label="Passaggi" className={cn("mb-6", className)}>
      <ol className="grid gap-1.5 sm:hidden" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s) => (
          <li key={s.label} className="min-w-0">
            <button
              type="button"
              onClick={() => onStepClick(s.step)}
              disabled={!s.reachable}
              aria-current={s.isActive ? "step" : undefined}
              aria-label={`Vai allo step ${s.step}: ${s.label}`}
              className="flex w-full flex-col gap-2 pt-1 pb-1.5 text-left disabled:cursor-default"
            >
              <span className={cn("h-1 w-full rounded-full transition-colors", s.isDone || s.isActive ? "bg-primary" : "bg-border")} />
              <span
                className={cn(
                  "flex items-center gap-1 truncate text-[11px]",
                  s.isActive ? "font-bold text-foreground" : s.isDone ? "font-semibold text-primary" : "font-semibold text-muted-foreground"
                )}
              >
                {s.isDone ? <Check className="h-3 w-3 shrink-0" strokeWidth={3} /> : <span>{s.step} ·</span>}
                <span className="truncate">{s.label}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <ol className="hidden items-center gap-2 sm:flex">
        {steps.map((s, idx) => (
          <li key={s.label} className={cn("flex items-center gap-2", idx < steps.length - 1 && "flex-1")}>
            <button
              type="button"
              onClick={() => onStepClick(s.step)}
              disabled={!s.reachable}
              aria-current={s.isActive ? "step" : undefined}
              aria-label={`Vai allo step ${s.step}: ${s.label}`}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-full pr-3.5 pl-1.5 text-[13px] transition-colors disabled:cursor-default",
                s.isActive
                  ? "bg-primary font-bold text-primary-foreground shadow-primary"
                  : s.isDone
                    ? "bg-secondary font-semibold text-primary hover:bg-secondary/70"
                    : "border border-input bg-card font-semibold text-foreground/70",
                !s.isActive && !s.isDone && s.reachable && "hover:border-primary/40 hover:text-foreground",
                !s.reachable && "opacity-60"
              )}
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-bold",
                  s.isActive ? "bg-white text-primary" : s.isDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {s.isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.step}
              </span>
              {s.label}
            </button>
            {idx < steps.length - 1 && (
              <span aria-hidden className={cn("h-0.5 min-w-3 flex-1 rounded-full", s.isDone ? "bg-primary" : "bg-border")} />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
