import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";

const sizes: Record<SpinnerSize, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-8",
};

export interface SpinnerProps {
  size?: SpinnerSize;
  /**
   * Accessible text ("Analyse en cours…"). When set, the spinner is a
   * `role="status"` live region; when omitted it is decorative (aria-hidden),
   * e.g. inside a button that already says what is loading.
   */
  label?: string;
  className?: string;
}

/** Rotating loader icon. Inherits the current text colour. */
export function Spinner({ size = "sm", label, className }: SpinnerProps) {
  const icon = (
    <LoaderCircle
      aria-hidden
      className={cn("shrink-0 animate-spin", sizes[size], className)}
    />
  );
  if (!label) return icon;
  return (
    <span role="status" className="inline-flex items-center">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
