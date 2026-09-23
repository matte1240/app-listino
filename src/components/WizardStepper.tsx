"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
