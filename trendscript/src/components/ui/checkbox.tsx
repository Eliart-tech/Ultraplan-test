"use client";

import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label (clickable). Omit and pass `aria-label` for a bare box. */
  label?: ReactNode;
  /** Muted line under the label (linked with aria-describedby). */
  description?: ReactNode;
  disabled?: boolean;
  name?: string;
  value?: string;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

/**
 * Native checkbox with custom styling — for opt-ins that are part of a form
 * ("Partenariat rémunéré", "Visuels IA réalistes").
 */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  name,
  value,
  id,
  className,
  "aria-label": ariaLabel,
}: CheckboxProps) {
  const generated = useId();
  const inputId = id ?? `${generated}-checkbox`;
  const descriptionId = description ? `${generated}-description` : undefined;

  const box = (
    <span className="relative inline-flex size-[1.125rem] shrink-0">
      <input
        id={inputId}
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={descriptionId}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className={cn(
          "peer size-full cursor-pointer appearance-none rounded-[0.3125rem] border border-line-strong bg-surface",
          "transition-[background-color,border-color] duration-150 ease-out hover:border-accent",
          "checked:border-accent checked:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      <Check
        aria-hidden
        strokeWidth={3}
        className="pointer-events-none absolute inset-0 m-auto size-3 text-accent-fg opacity-0 transition-opacity duration-150 peer-checked:opacity-100"
      />
    </span>
  );

  if (!label) return <span className={cn("inline-flex", className)}>{box}</span>;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="pt-0.5">{box}</span>
      <div className="min-w-0">
        <label
          htmlFor={inputId}
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
    </div>
  );
}
