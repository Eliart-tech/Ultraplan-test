import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type MeterTone = "accent" | "hot" | "success" | "warning" | "danger" | "neutral";

const fills: Record<MeterTone, string> = {
  accent: "bg-accent",
  hot: "bg-hot",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-faint",
};

export interface MeterBarProps {
  /** Visible label on the left ("Momentum"). */
  label: ReactNode;
  value: number;
  max?: number;
  tone?: MeterTone;
  /** Text on the right instead of the rounded value ("82", "12,3 k"). */
  valueLabel?: ReactNode;
  /** Hide the value on the right. */
  hideValue?: boolean;
  /** Spoken name when `label` is not plain text. */
  "aria-label"?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Labelled horizontal bar for a score component (momentum, portée,
 * multi-plateforme, fraîcheur, pertinence niche). `role="meter"`.
 */
export function MeterBar({
  label,
  value,
  max = 100,
  tone = "accent",
  valueLabel,
  hideValue = false,
  "aria-label": ariaLabel,
  size = "sm",
  className,
}: MeterBarProps) {
  const safe = Number.isFinite(value) ? value : 0;
  const pct = Math.min(100, Math.max(0, (safe / (max || 1)) * 100));
  const name = ariaLabel ?? (typeof label === "string" ? label : undefined);
  return (
    <div className={cn("w-full", className)}>
      <div className={cn("flex items-baseline justify-between gap-3", size === "sm" ? "text-xs" : "text-sm")}>
        <span className="truncate text-muted">{label}</span>
        {hideValue ? null : (
          <span className="shrink-0 font-semibold tabular-nums text-ink">{valueLabel ?? Math.round(safe)}</span>
        )}
      </div>
      <div
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(safe)}
        className={cn("mt-1 w-full overflow-hidden rounded-full bg-surface-3", size === "sm" ? "h-1.5" : "h-2")}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", fills[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
