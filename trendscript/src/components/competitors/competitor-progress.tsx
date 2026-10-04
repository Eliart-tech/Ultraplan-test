"use client";

import { BarChart3, Check, Download, Sparkles, UserSearch, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { platformLabel } from "@/components/ui/platform-icon";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { formatCompact, formatNumber, pluralize } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import { competitorStepState, type CompetitorRun, type StepState } from "./competitor-run";

function StepRow({ state, icon, label, detail }: { state: StepState; icon: ReactNode; label: string; detail?: ReactNode }) {
  return (
    <li className="flex items-start gap-3" aria-current={state === "current" ? "step" : undefined}>
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 [&_svg]:size-4",
          state === "done" && "border-accent bg-accent text-accent-fg",
          state === "current" && "border-accent bg-accent-soft text-accent-ink",
          state === "upcoming" && "border-line-strong bg-surface text-faint",
          state === "skipped" && "border-dashed border-line-strong bg-surface text-faint",
        )}
      >
        {state === "done" ? <Check strokeWidth={3} /> : state === "current" ? <Spinner size="sm" /> : icon}
      </span>
      <div className="min-w-0 pt-1">
        <p className={cn("text-sm font-medium", state === "upcoming" || state === "skipped" ? "text-muted" : "text-ink")}>
          {label}
          <span className="sr-only">
            {" "}
            ({state === "done" ? "terminé" : state === "current" ? "en cours" : state === "skipped" ? "désactivé" : "à venir"})
          </span>
        </p>
        {detail ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p> : null}
      </div>
    </li>
  );
}

export interface CompetitorProgressProps {
  run: CompetitorRun;
  aiConfigured: boolean | null;
  onCancel: () => void;
}

/**
 * Live panel of a competitor analysis: Récupération des publications →
 * Calcul des statistiques → Analyse par Claude (n caractères), with cancel.
 */
export function CompetitorProgress({ run, aiConfigured, onCancel }: CompetitorProgressProps) {
  const fetch = competitorStepState("fetch", run, aiConfigured);
  const stats = competitorStepState("stats", run, aiConfigured);
  const analysis = competitorStepState("analysis", run, aiConfigured);
  const preview = run.preview;
  const handle = run.request?.handle.trim() ?? "";
  const platform = run.request ? platformLabel(run.request.platform) : "";

  return (
    <Card as="section" aria-label="Progression de l'analyse" elevated className="overflow-hidden animate-fade-in">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
            <UserSearch aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Analyse en cours</h2>
            <p className="truncate text-sm text-muted">
              {handle ? `${handle.startsWith("@") || handle.includes("/") ? handle : `@${handle}`} · ${platform}` : platform}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" leftIcon={<X aria-hidden className="size-4" />} onClick={onCancel}>
          Annuler
        </Button>
      </div>

      <div className="px-5 pb-5 pt-5 sm:px-6">
        <Progress label="Progression de l'analyse du créateur" value={null} size="xs" />
        <ol className="mt-5 space-y-4">
          <StepRow
            state={fetch}
            icon={<Download />}
            label="Récupération des publications"
            detail={
              fetch === "current"
                ? run.message || "Lecture du profil et des dernières publications…"
                : preview
                  ? `${preview.data.posts.length} ${pluralize(preview.data.posts.length, "publication récupérée", "publications récupérées")} · ${preview.data.source}`
                  : undefined
            }
          />
          <StepRow
            state={stats}
            icon={<BarChart3 />}
            label="Calcul des statistiques"
            detail={
              stats === "current"
                ? run.message || "Médianes, publications qui surperforment, rythme…"
                : stats === "done" && preview
                  ? `${preview.stats.outliers.length} ${pluralize(preview.stats.outliers.length, "publication surperforme", "publications surperforment")}${
                      preview.stats.medianViews !== undefined ? ` · médiane ${formatCompact(preview.stats.medianViews)} vues` : ""
                    }`
                  : undefined
            }
          />
          <StepRow
            state={analysis}
            icon={<Sparkles />}
            label="Analyse par Claude"
            detail={
              analysis === "skipped"
                ? "Claude non configuré : rapport en mode statistiques."
                : analysis === "current"
                  ? run.chars > 0
                    ? `${formatNumber(run.chars)} caractères rédigés`
                    : run.message || "Positionnement, hooks, angles morts, idées pour vous…"
                  : undefined
            }
          />
        </ol>
      </div>
    </Card>
  );
}
