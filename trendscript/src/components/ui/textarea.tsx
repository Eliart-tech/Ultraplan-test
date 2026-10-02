"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlBase } from "./control-styles";
import { useFieldControlProps } from "./field";

export interface TextareaProps extends ComponentProps<"textarea"> {
  /** Grow with the content (CSS `field-sizing: content`; falls back to `rows`). */
  autoResize?: boolean;
  invalid?: boolean;
}

/** Multi-line text input, Field-aware like Input. */
export function Textarea({ autoResize = false, invalid, className, rows = 3, ...props }: TextareaProps) {
  const merged = useFieldControlProps({ ...props, "aria-invalid": invalid || props["aria-invalid"] || undefined });
  return (
    <textarea
      rows={rows}
      {...merged}
      className={cn(
        controlBase,
        "min-h-20 resize-y px-3 py-2.5 text-sm leading-relaxed",
        autoResize && "field-sizing-content max-h-96",
        className,
      )}
    />
  );
}
