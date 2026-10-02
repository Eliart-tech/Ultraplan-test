import { cn } from "@/lib/cn";

export type ProgressTone = "accent" | "hot" | "success" | "warning" | "danger";
export type ProgressSize = "xs" | "sm" | "md";

const tones: Record<ProgressTone, string> = {
  accent: "bg-accent",
  hot: "bg-hot",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const heights: Record<ProgressSize, string> = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2.5",
};

export interface ProgressProps {
  /** Current value; `null`/`undefined` renders an indeterminate bar. */
  value?: number | null;
  max?: number;
  /** Accessible name ("Analyse des sources"). */
  label: string;
  /** Spoken value instead of the percentage ("3 sources sur 6"). */
  valueText?: string;
  tone?: ProgressTone;
  size?: ProgressSize;
  className?: string;
}

/**
 * Progress bar (`role="progressbar"`), determinate or indeterminate.
 * Put the textual progress in an `aria-live` region next to it if it must
 * be announced (screen readers don't announce progressbar changes).
 */
export function Progress({
  value,
  max = 100,
  label,
  valueText,
  tone = "accent",
  size = "sm",
  className,
}: ProgressProps) {
  const determinate = typeof value === "number" && Number.isFinite(value);
  const pct = determinate ? Math.min(100, Math.max(0, (value / (max || 1)) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? max : undefined}
      aria-valuenow={determinate ? value : undefined}
      aria-valuetext={determinate ? valueText : (valueText ?? "En cours")}
      className={cn("relative w-full overflow-hidden rounded-full bg-surface-3", heights[size], className)}
    >
      {determinate ? (
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-out", tones[tone])}
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div className={cn("absolute inset-y-0 left-0 w-full origin-left rounded-full animate-indeterminate", tones[tone])} />
      )}
    </div>
  );
}
