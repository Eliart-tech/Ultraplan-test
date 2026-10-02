"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DisclosureProps {
  /** Text of the toggle button ("Voir les preuves (6)"). */
  summary: ReactNode;
  /** Text when open (defaults to `summary`), e.g. "Masquer les preuves". */
  openSummary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Classes of the toggle button. */
  buttonClassName?: string;
  className?: string;
}

/**
 * Show/hide section with a chevron button (`aria-expanded` / `aria-controls`).
 * Content is only rendered while open.
 */
export function Disclosure({
  summary,
  openSummary,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  buttonClassName,
  className,
}: DisclosureProps) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const panelId = useId();

  function toggle() {
    if (openProp === undefined) setOpenState(!open);
    onOpenChange?.(!open);
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-accent-ink transition-colors duration-150 hover:text-accent",
          buttonClassName,
        )}
      >
        {open && openSummary ? openSummary : summary}
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <div id={panelId} hidden={!open}>
        {open ? <div className="pt-3 animate-fade-in">{children}</div> : null}
      </div>
    </div>
  );
}
