"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useFieldControlProps } from "./field";

export type SliderTone = "accent" | "hot";

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /**
   * Text for the value bubble and `aria-valuetext`
   * (e.g. `(v) => \`${v} · ${viralityBand(v).label}\``). Defaults to the number.
   */
  formatValue?: (value: number) => string;
  /** Hide the floating value bubble above the thumb. */
  hideBubble?: boolean;
  /** Label under the left end of the track ("Sobre"). */
  minLabel?: ReactNode;
  /** Label under the right end of the track ("Ultra-viral"). */
  maxLabel?: ReactNode;
  /** Tick marks at these values (e.g. band boundaries [20, 40, 60, 80]). */
  marks?: number[];
  tone?: SliderTone;
  disabled?: boolean;
  /** Accessible name when the slider is not inside a `<Field>`. */
  "aria-label"?: string;
  "aria-describedby"?: string;
  id?: string;
  name?: string;
  className?: string;
}

const toneColors: Record<SliderTone, string> = {
  accent: "var(--ts-accent)",
  hot: "var(--ts-hot)",
};

/** Percentage of `value` within [min, max], clamped to 0–100. */
function percentOf(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/**
 * Accessible range slider built on `<input type="range">` (arrows, Page
 * Up/Down, Home/End work natively), with a filled track, a value bubble and
 * optional end labels. Field-aware: inside `<Field label="Viralité">` it is
 * labelled automatically.
 *
 * @example
 * <Field label="Viralité" labelAside={viralityBand(v).label}>
 *   <Slider value={v} onValueChange={setV} marks={[20, 40, 60, 80]}
 *     formatValue={(x) => `${x} · ${viralityBand(x).label}`}
 *     minLabel="Sobre" maxLabel="Ultra-viral" tone="hot" />
 * </Field>
 */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  formatValue,
  hideBubble = false,
  minLabel,
  maxLabel,
  marks,
  tone = "accent",
  disabled,
  className,
  ...a11y
}: SliderProps) {
  const control = useFieldControlProps({ ...a11y, disabled });
  const pct = percentOf(value, min, max);
  const text = formatValue ? formatValue(value) : String(value);
  const style = {
    "--ts-fill": `${pct}%`,
    "--ts-range-color": toneColors[tone],
  } as CSSProperties;
  // Keep the bubble centred on the thumb (thumb width 1.25rem).
  const bubbleLeft = `calc(${pct}% + ${(0.5 - pct / 100) * 1.25}rem)`;

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("relative", !hideBubble && "pt-8")}>
        {!hideBubble ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 py-0.5",
              "text-xs font-semibold tabular-nums shadow-xs",
              tone === "hot" ? "bg-hot-soft text-hot-ink" : "bg-accent-soft text-accent-ink",
              disabled && "opacity-60",
            )}
            style={{ left: bubbleLeft }}
          >
            {text}
          </span>
        ) : null}
        {marks && marks.length > 0 ? (
          // Small ticks under the track; inset by half a thumb so they line
          // up with the thumb centre at each value.
          <div aria-hidden className="pointer-events-none absolute inset-x-2.5 bottom-0 h-1.5">
            {marks.map((mark) => (
              <span
                key={mark}
                className="absolute top-0 h-full w-px bg-line-strong"
                style={{ left: `${percentOf(mark, min, max)}%` }}
              />
            ))}
          </div>
        ) : null}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onValueChange(Number(event.target.value))}
          aria-valuetext={text}
          className="ts-range relative block"
          style={style}
          {...control}
        />
      </div>
      {minLabel || maxLabel ? (
        <div className="mt-1 flex justify-between gap-4 text-xs text-muted">
          <span>{minLabel}</span>
          <span className="text-right">{maxLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
