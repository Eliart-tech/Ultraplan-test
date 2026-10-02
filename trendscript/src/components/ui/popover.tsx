"use client";

import { Info } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PopoverAlign = "start" | "center" | "end";
export type PopoverSide = "bottom" | "top";

export interface PopoverProps {
  /** Content of the trigger button (text and/or icon). */
  trigger: ReactNode;
  /** Accessible name of the trigger — required when `trigger` is icon-only. */
  label?: string;
  /** Optional heading inside the panel. */
  title?: ReactNode;
  children: ReactNode;
  align?: PopoverAlign;
  side?: PopoverSide;
  /** Classes of the trigger button (defaults to a subtle inline button). */
  triggerClassName?: string;
  /** Classes of the panel (width: default w-72). */
  panelClassName?: string;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const alignClasses: Record<PopoverAlign, string> = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

/**
 * Click/keyboard disclosure panel: Enter/Space opens, Escape closes and
 * returns focus to the trigger, a click outside or tabbing away closes.
 * Non-modal (`aria-expanded` + `aria-controls`), for explanations, score
 * breakdowns and small menus.
 *
 * @example
 * <Popover trigger={<Info className="size-4" />} label="Comment le score est calculé" title="Score">
 *   <ul>…</ul>
 * </Popover>
 */
export function Popover({
  trigger,
  label,
  title,
  children,
  align = "start",
  side = "bottom",
  triggerClassName,
  panelClassName,
  open: openProp,
  onOpenChange,
  className,
}: PopoverProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  function setOpen(next: boolean) {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  }
  // Effect event: the document listeners always see the latest props.
  const close = useEffectEvent((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  });

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close(true);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={cn("relative inline-flex", className)}
      onBlur={(event) => {
        // Close when focus leaves the whole popover (Tab past the panel).
        if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen(!open)}
        className={cn(
          triggerClassName ??
            "inline-flex items-center gap-1 rounded-md text-muted transition-colors duration-150 hover:text-ink aria-expanded:text-ink",
        )}
      >
        {trigger}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className={cn(
          "absolute z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-4 text-left text-sm leading-relaxed text-muted shadow-pop animate-pop-in",
          side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
          alignClasses[align],
          panelClassName,
        )}
      >
        {title ? <p className="mb-1.5 text-sm font-semibold text-ink">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

export interface InfoPopoverProps extends Omit<PopoverProps, "trigger" | "label"> {
  /** Accessible name of the (i) button, e.g. "Comment le score est calculé". */
  label: string;
}

/** Popover behind a small (i) icon button — explanations next to labels. */
export function InfoPopover({ label, triggerClassName, ...rest }: InfoPopoverProps) {
  return (
    <Popover
      label={label}
      trigger={<Info aria-hidden className="size-4" />}
      triggerClassName={
        triggerClassName ??
        "inline-flex size-6 items-center justify-center rounded-full text-faint transition-colors duration-150 hover:bg-surface-2 hover:text-ink aria-expanded:bg-accent-soft aria-expanded:text-accent-ink"
      }
      {...rest}
    />
  );
}

export interface TooltipProps {
  /** Short text shown on hover/focus. Visual only: the child must already have an accessible name. */
  content: string;
  children: ReactElement;
  side?: PopoverSide;
  className?: string;
}

/**
 * CSS-only hover/focus hint for elements that already carry their accessible
 * name (icon buttons with aria-label, truncated text with a title…). It is
 * aria-hidden to avoid double announcements; use Popover for real content.
 */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-canvas opacity-0 shadow-pop",
          "transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {content}
      </span>
    </span>
  );
}
