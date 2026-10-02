"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Small counter after the label. */
  count?: number;
  /** Panel content. */
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: TabItem<T>[];
  /** Accessible name of the tab list ("Vues du script"). */
  "aria-label": string;
  /** Keep inactive panels mounted (hidden) to preserve their state. */
  keepMounted?: boolean;
  /** Classes of the tab list. */
  listClassName?: string;
  /** Classes of each panel (default "pt-5": replaces it when set). */
  panelClassName?: string;
  className?: string;
}

/**
 * WAI-ARIA tabs with automatic activation: ←/→ move and select, Home/End
 * jump to the ends. Underline style; the list scrolls horizontally on phones.
 *
 * @example
 * <Tabs aria-label="Vues du script" value={view} onValueChange={setView} items={[
 *   { value: "beats", label: "Déroulé", content: <BeatTimeline … /> },
 *   { value: "prompter", label: "Prompteur", content: <Teleprompter … /> },
 * ]} />
 */
export function Tabs<T extends string>({
  value,
  onValueChange,
  items,
  "aria-label": ariaLabel,
  keepMounted = false,
  listClassName,
  panelClassName = "pt-5",
  className,
}: TabsProps<T>) {
  const base = useId();
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());
  const tabId = (v: T) => `${base}-tab-${v}`;
  const panelId = (v: T) => `${base}-panel-${v}`;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.filter((item) => !item.disabled);
    const index = enabled.findIndex((item) => item.value === value);
    let next: TabItem<T> | undefined;
    if (event.key === "ArrowRight") next = enabled[(index + 1) % enabled.length];
    else if (event.key === "ArrowLeft") next = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    onValueChange(next.value);
    tabRefs.current.get(next.value)?.focus();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className={cn("flex gap-1 overflow-x-auto border-b border-line scrollbar-none", listClassName)}
      >
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              ref={(node) => {
                if (node) tabRefs.current.set(item.value, node);
                else tabRefs.current.delete(item.value);
              }}
              id={tabId(item.value)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(item.value)}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onValueChange(item.value)}
              className={cn(
                "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium",
                "transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4",
                selected ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {item.icon ? <span aria-hidden className="inline-flex">{item.icon}</span> : null}
              {item.label}
              {item.count !== undefined ? (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums leading-none",
                    selected ? "bg-accent-soft text-accent-ink" : "bg-surface-2 text-muted",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {items.map((item) => {
        const selected = item.value === value;
        if (!selected && !keepMounted) return null;
        return (
          <div
            key={item.value}
            id={panelId(item.value)}
            role="tabpanel"
            aria-labelledby={tabId(item.value)}
            hidden={!selected}
            tabIndex={0}
            className={cn("focus-visible:outline-offset-4", panelClassName)}
          >
            {item.content}
          </div>
        );
      })}
    </div>
  );
}
