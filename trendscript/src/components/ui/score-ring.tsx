import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ScoreTone = "auto" | "accent" | "hot" | "success" | "warning" | "danger" | "neutral";

const strokeColors: Record<Exclude<ScoreTone, "auto">, string> = {
  accent: "var(--ts-accent)",
  hot: "var(--ts-hot)",
  success: "var(--ts-success)",
  warning: "var(--ts-warning)",
  danger: "var(--ts-danger)",
  neutral: "var(--ts-faint)",
};

/** Colour of a 0–100 score: ≥ 70 hot, ≥ 45 accent, below neutral. */
export function scoreTone(value: number): Exclude<ScoreTone, "auto"> {
  if (value >= 70) return "hot";
  if (value >= 45) return "accent";
  return "neutral";
}

export interface ScoreRingProps {
  /** 0–100 (clamped and rounded). */
  value: number;
  /** Diameter in px (default 56). */
  size?: number;
  /** Ring thickness in px (default size / 9). */
  thickness?: number;
  tone?: ScoreTone;
  /** Accessible name prefix (default "Score") → "Score : 82 sur 100". */
  label?: string;
  /** Replace the number in the centre. */
  children?: ReactNode;
  className?: string;
}

/**
 * Circular 0–100 gauge (SVG) with the score in the centre, tabular digits.
 *
 * @example <ScoreRing value={topic.scores.total} label="Score total" />
 */
export function ScoreRing({
  value,
  size = 56,
  thickness,
  tone = "auto",
  label = "Score",
  children,
  className,
}: ScoreRingProps) {
  const score = Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));
  const stroke = thickness ?? Math.max(3, Math.round(size / 9));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = strokeColors[tone === "auto" ? scoreTone(score) : tone];
  const fontSize = Math.max(11, Math.round(size * 0.3));

  return (
    <div
      role="img"
      aria-label={`${label} : ${score} sur 100`}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--ts-surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums tracking-tight text-ink"
        style={{ fontSize }}
      >
        {children ?? score}
      </span>
    </div>
  );
}
