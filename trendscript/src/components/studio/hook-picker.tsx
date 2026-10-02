"use client";

import { Check, Clapperboard, MonitorSmartphone } from "lucide-react";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { ScriptHook } from "@/lib/types";

export interface HookPickerProps {
  /** Hooks in the order Claude returned them. */
  hooks: ScriptHook[];
  /** Index of the hook used in the script. */
  value: number;
  onChange: (index: number) => void;
  disabled?: boolean;
}

/**
 * The 3 hook variants as radio cards. Choosing one rewrites the opening of
 * the script client-side (see `applyHook`).
 */
export function HookPicker({ hooks, value, onChange, disabled = false }: HookPickerProps) {
  const name = useId();
  const legendId = useId();
  if (hooks.length === 0) return null;
  return (
    <fieldset aria-labelledby={legendId} disabled={disabled}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={legendId} className="text-sm font-semibold text-ink">
          Accroche
        </h3>
        <p className="text-xs text-muted">Les 2 premières secondes décident de tout : choisissez la variante utilisée.</p>
      </div>
      <div className={cn("mt-3 grid gap-3", hooks.length > 1 && "md:grid-cols-3")}>
        {hooks.map((hook, index) => {
          const checked = index === value;
          const id = `${name}-${index}`;
          return (
            <label
              key={index}
              className={cn(
                "relative flex cursor-pointer flex-col rounded-xl border bg-surface p-4 text-left",
                "transition-[border-color,background-color,box-shadow] duration-150 ease-out",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
                checked ? "border-accent bg-accent-soft/50 ring-1 ring-accent" : "border-line hover:border-line-strong hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name={name}
                value={index}
                checked={checked}
                onChange={() => onChange(index)}
                aria-labelledby={`${id}-spoken`}
                aria-describedby={`${id}-meta`}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2">
                <Badge size="sm" tone={checked ? "accent" : "neutral"}>
                  {hook.style || `Variante ${index + 1}`}
                </Badge>
                {checked ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink">
                    <Check aria-hidden className="size-3.5" strokeWidth={3} />
                    Utilisée
                  </span>
                ) : (
                  <span className="text-xs text-faint">Variante {index + 1}</span>
                )}
              </span>
              <span id={`${id}-spoken`} className="mt-3 block text-[0.9375rem] font-semibold leading-snug text-ink">
                « {hook.spoken} »
              </span>
              <span id={`${id}-meta`} className="mt-3 block space-y-2">
                {hook.onScreenText ? (
                  <span className="flex items-start gap-2 text-xs text-muted">
                    <MonitorSmartphone aria-hidden className="mt-0.5 size-3.5 shrink-0 text-faint" />
                    <span>
                      <span className="sr-only">Texte à l&apos;écran : </span>
                      <span className="rounded bg-ink px-1.5 py-0.5 font-semibold text-canvas [box-decoration-break:clone]">
                        {hook.onScreenText}
                      </span>
                    </span>
                  </span>
                ) : null}
                {hook.visual ? (
                  <span className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                    <Clapperboard aria-hidden className="mt-0.5 size-3.5 shrink-0 text-faint" />
                    <span>
                      <span className="sr-only">Visuel : </span>
                      {hook.visual}
                    </span>
                  </span>
                ) : null}
                {hook.rationale ? (
                  <span className="block text-xs italic leading-relaxed text-muted">{hook.rationale}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
