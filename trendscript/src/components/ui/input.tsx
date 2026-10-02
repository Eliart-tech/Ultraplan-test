"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { controlBase, controlSizes, type ControlSize } from "./control-styles";
import { useFieldControlProps } from "./field";

export interface InputProps extends Omit<ComponentProps<"input">, "size"> {
  size?: ControlSize;
  /** Icon inside the field, on the left (decorative). */
  leftIcon?: ReactNode;
  /** Element inside the field, on the right (unit, clear button, counter). */
  rightSlot?: ReactNode;
  /** Marks the field invalid without a Field wrapper. */
  invalid?: boolean;
}

/**
 * Text input. Inside a `<Field>` it receives id / aria-describedby /
 * aria-invalid automatically. `className` lands on the `<input>`, or on the
 * wrapper when `leftIcon` / `rightSlot` are used.
 *
 * @example <Input type="search" leftIcon={<Search />} placeholder="Rechercher…" />
 */
export function Input({ size = "md", leftIcon, rightSlot, invalid, className, ...props }: InputProps) {
  const merged = useFieldControlProps({ ...props, "aria-invalid": invalid || props["aria-invalid"] || undefined });
  const input = (
    <input
      {...merged}
      className={cn(
        controlBase,
        controlSizes[size],
        leftIcon ? "pl-9" : null,
        rightSlot ? "pr-10" : null,
        !leftIcon && !rightSlot ? className : null,
      )}
    />
  );
  if (!leftIcon && !rightSlot) return input;
  return (
    <div className={cn("relative w-full", className)}>
      {leftIcon ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-faint [&_svg]:size-4"
        >
          {leftIcon}
        </span>
      ) : null}
      {input}
      {rightSlot ? (
        <span className="absolute inset-y-0 right-2 flex items-center text-sm text-muted">{rightSlot}</span>
      ) : null}
    </div>
  );
}
