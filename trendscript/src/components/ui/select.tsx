"use client";

import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlBase, controlSizes, type ControlSize } from "./control-styles";
import { useFieldControlProps } from "./field";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ComponentProps<"select">, "size"> {
  size?: ControlSize;
  /** Options to render; alternatively pass `<option>` / `<optgroup>` children. */
  options?: SelectOption[];
  /** First, empty option (value ""), e.g. "Choisir…". */
  placeholder?: string;
  invalid?: boolean;
}

/**
 * Native `<select>` (best on mobile and for accessibility) with the kit's
 * styling and a chevron. Field-aware like Input.
 *
 * @example
 * <Select value={geo} onChange={(e) => setGeo(e.target.value)}
 *   options={[{ value: "FR", label: "France" }, { value: "BE", label: "Belgique" }]} />
 */
export function Select({
  size = "md",
  options,
  placeholder,
  invalid,
  className,
  children,
  ...props
}: SelectProps) {
  const merged = useFieldControlProps({ ...props, "aria-invalid": invalid || props["aria-invalid"] || undefined });
  return (
    <div className={cn("relative w-full", className)}>
      <select
        {...merged}
        className={cn(controlBase, controlSizes[size], "cursor-pointer appearance-none pr-9")}
      >
        {placeholder !== undefined ? (
          <option value="" disabled={props.required}>
            {placeholder}
          </option>
        ) : null}
        {options?.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint"
      />
    </div>
  );
}
