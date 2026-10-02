import { cn } from "@/lib/cn";

/**
 * Shared look of text-like controls (Input, Textarea, Select, ChipInput):
 * surface background, hairline border, accent focus ring, danger when
 * `aria-invalid`.
 */
export const controlBase =
  "w-full min-w-0 rounded-xl border border-line bg-surface text-ink shadow-xs " +
  "transition-[border-color,box-shadow] duration-150 ease-out " +
  "hover:border-line-strong " +
  "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15 " +
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15 " +
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted disabled:opacity-70";

/** Same look for a wrapper that contains the focused element (ChipInput). */
export const controlWithinBase =
  "w-full min-w-0 rounded-xl border border-line bg-surface text-ink shadow-xs " +
  "transition-[border-color,box-shadow] duration-150 ease-out hover:border-line-strong " +
  "focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15 " +
  "has-[[aria-invalid=true]]:border-danger";

export type ControlSize = "sm" | "md" | "lg";

export const controlSizes: Record<ControlSize, string> = {
  sm: "h-8 px-2.5 text-[0.8125rem]",
  md: "h-10 px-3 text-sm",
  lg: "h-12 px-3.5 text-[0.9375rem]",
};

export function controlClasses(size: ControlSize = "md", className?: string): string {
  return cn(controlBase, controlSizes[size], className);
}
