import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type StatTone = "neutral" | "success" | "warning" | "danger" | "hot" | "accent";

const valueTones: Record<StatTone, string> = {
  neutral: "text-ink",
  success: "text-success-ink",
  warning: "text-warning-ink",
  danger: "text-danger-ink",
  hot: "text-hot-ink",
  accent: "text-accent-ink",
};

export interface StatProps {
  /** Small muted label ("Mots"). */
  label: ReactNode;
  /** The metric, rendered with tabular digits ("101"). */
  value: ReactNode;
  /** Context under the value ("budget 101 · ±10 %"). */
  hint?: ReactNode;
  /** Colours the value (e.g. warning when outside the word budget). */
  tone?: StatTone;
  icon?: ReactNode;
  className?: string;
}

/** Compact metric tile: word count vs budget, estimated duration, signals… */
export function Stat({ label, value, hint, tone = "neutral", icon, className }: StatProps) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-line bg-surface px-3.5 py-3", className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted [&_svg]:size-3.5">
        {icon ? <span aria-hidden className="inline-flex text-faint">{icon}</span> : null}
        {label}
      </p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums tracking-tight", valueTones[tone])}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
