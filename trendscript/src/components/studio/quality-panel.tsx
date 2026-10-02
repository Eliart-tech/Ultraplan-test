import { Check, ThumbsUp, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ScriptChecklistItem } from "@/lib/types";

export interface QualityPanelProps {
  strengths: string[];
  risks: string[];
  checklist: ScriptChecklistItem[];
}

/** Points forts / Risques and the quality checklist (✓/✕ + comment). */
export function QualityPanel({ strengths, risks, checklist }: QualityPanelProps) {
  const passed = checklist.filter((item) => item.passed).length;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-success/25 bg-success-soft/50 p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ThumbsUp aria-hidden className="size-4 text-success-ink" />
            Points forts
          </h3>
          {strengths.length ? (
            <ul className="mt-3 space-y-2">
              {strengths.map((item, index) => (
                <li key={index} className="flex gap-2 text-sm leading-relaxed text-ink">
                  <Check aria-hidden className="mt-1 size-3.5 shrink-0 text-success-ink" strokeWidth={3} />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Aucun point fort listé.</p>
          )}
        </section>
        <section className="rounded-xl border border-warning/35 bg-warning-soft/60 p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <TriangleAlert aria-hidden className="size-4 text-warning-ink" />
            Risques
          </h3>
          {risks.length ? (
            <ul className="mt-3 space-y-2">
              {risks.map((item, index) => (
                <li key={index} className="flex gap-2 text-sm leading-relaxed text-ink">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Aucun risque particulier signalé.</p>
          )}
        </section>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Checklist qualité</h3>
          {checklist.length ? (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                passed === checklist.length ? "text-success-ink" : "text-warning-ink",
              )}
            >
              {passed}/{checklist.length} critères validés
            </span>
          ) : null}
        </div>
        {checklist.length ? (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {checklist.map((item, index) => (
              <li key={index} className="flex gap-3 px-4 py-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                    item.passed ? "bg-success-soft text-success-ink" : "bg-danger-soft text-danger-ink",
                  )}
                >
                  {item.passed ? (
                    <Check aria-hidden className="size-3" strokeWidth={3} />
                  ) : (
                    <X aria-hidden className="size-3" strokeWidth={3} />
                  )}
                  <span className="sr-only">{item.passed ? "Validé :" : "Non validé :"}</span>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{item.criterion}</p>
                  {item.comment ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.comment}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Pas de checklist pour ce script.</p>
        )}
      </section>
    </div>
  );
}
