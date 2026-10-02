"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SwitchSize = "sm" | "md";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label (clicking it toggles). Omit and pass `aria-label` for a bare switch. */
  label?: ReactNode;
  /** Muted line under the label, linked with aria-describedby. */
  description?: ReactNode;
  disabled?: boolean;
  size?: SwitchSize;
  /** Put the switch before the label instead of after it. */
  switchFirst?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

const track: Record<SwitchSize, string> = {
  sm: "h-5 w-9",
  md: "h-6 w-11",
};

const thumb: Record<SwitchSize, string> = {
  sm: "size-4 data-[on=true]:translate-x-4",
  md: "size-5 data-[on=true]:translate-x-5",
};

/**
 * On/off toggle (`role="switch"`), for settings that apply immediately:
 * enable a source, web research, hide sensitive topics.
 *
 * @example
 * <Switch checked={research} onCheckedChange={setResearch}
 *   label="Recherche web" description="Faits sourcés et datés ; ajoute ~30 s." />
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  size = "md",
  switchFirst = false,
  id,
  className,
  "aria-label": ariaLabel,
}: SwitchProps) {
  const generated = useId();
  const switchId = id ?? `${generated}-switch`;
  const descriptionId = description ? `${generated}-description` : undefined;

  const button = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5",
        "transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50",
        track[size],
        checked ? "bg-accent" : "bg-surface-3 hover:bg-line-strong",
      )}
    >
      <span
        aria-hidden
        data-on={checked}
        className={cn(
          "rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-out",
          thumb[size],
        )}
      />
    </button>
  );

  if (!label) return <span className={cn("inline-flex", className)}>{button}</span>;

  return (
    <div
      className={cn(
        "flex items-start gap-4",
        switchFirst ? "flex-row-reverse justify-end" : "justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <label
          htmlFor={switchId}
          className={cn("block cursor-pointer text-sm font-medium text-ink", disabled && "cursor-not-allowed opacity-60")}
        >
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-xs leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <span className="pt-px">{button}</span>
    </div>
  );
}
