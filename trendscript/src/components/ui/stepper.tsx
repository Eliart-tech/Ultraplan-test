"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type StepStatus = "done" | "current" | "upcoming";

export interface StepItem<T extends string = string> {
  id: T;
  label: string;
  /** Short line under the label (hidden on phones). */
  description?: string;
  status: StepStatus;
  /**
   * Whether the step can be clicked. Default: done steps are clickable,
   * the current and upcoming ones are not.
   */
  clickable?: boolean;
}

export interface StepperProps<T extends string = string> {
  steps: StepItem<T>[];
  /** Called with the step id when a clickable step is activated. */
  onStepSelect?: (id: T) => void;
  /** Accessible name of the navigation (default "Étapes"). */
  "aria-label"?: string;
  className?: string;
}

/**
 * Horizontal wizard progress (Radar → Sujets → Angle → Script). Done steps
 * are buttons that go back; the current one has `aria-current="step"`.
 * On phones only the current label is shown, with "Étape n/N".
 */
export function Stepper<T extends string = string>({
  steps,
  onStepSelect,
  "aria-label": ariaLabel = "Étapes",
  className,
}: StepperProps<T>) {
  const currentIndex = steps.findIndex((step) => step.status === "current");
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {steps.map((step, index) => {
          const clickable = Boolean(onStepSelect) && (step.clickable ?? step.status === "done");
          const isCurrent = step.status === "current";
          const marker = (
            <span
              aria-hidden
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-200",
                step.status === "done" && "bg-accent text-accent-fg",
                isCurrent && "bg-accent-soft text-accent-ink ring-2 ring-accent",
                step.status === "upcoming" && "border border-line-strong bg-surface text-faint",
              )}
            >
              {step.status === "done" ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
          );
          const text = (
            <span className={cn("min-w-0 text-left", isCurrent ? "block" : "hidden md:block")}>
              <span
                className={cn(
                  "block truncate text-sm font-medium",
                  step.status === "upcoming" ? "text-muted" : "text-ink",
                )}
              >
                {step.label}
              </span>
              {step.description ? (
                <span className="hidden truncate text-xs text-muted lg:block">{step.description}</span>
              ) : null}
            </span>
          );
          const statusText =
            step.status === "done" ? "terminée" : isCurrent ? "en cours" : "à venir";
          const srLabel = `Étape ${index + 1} sur ${steps.length} : ${step.label} (${statusText})`;

          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className={cn("flex min-w-0 items-center gap-1.5 sm:gap-2", isCurrent ? "flex-1 md:flex-initial" : "shrink-0")}
            >
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepSelect?.(step.id)}
                  aria-label={srLabel}
                  className="group flex min-w-0 items-center gap-2 rounded-full py-0.5 pr-2 transition-colors duration-150 hover:bg-surface-2"
                >
                  {marker}
                  {text}
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-2 py-0.5 pr-1">
                  <span className="sr-only">{srLabel}</span>
                  {marker}
                  <span aria-hidden className="contents">
                    {text}
                  </span>
                </span>
              )}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-4 shrink-0 sm:w-8 lg:w-12",
                    index < currentIndex ? "bg-accent" : "bg-line-strong",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {currentIndex >= 0 ? (
        <p className="mt-1 text-xs text-muted md:hidden" aria-hidden>
          Étape {currentIndex + 1}/{steps.length}
        </p>
      ) : null}
    </nav>
  );
}
