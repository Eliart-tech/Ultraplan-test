"use client";

import { Check, CircleAlert, Download, Flame, Sparkles, UsersRound, X } from "lucide-react";
import type { ReactNode } from "react";
import { formatMultiplier } from "@/components/competitors/report-utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { formatCompact, formatNumber, pluralize } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import type { ViralPlatform } from "@/lib/types";
import { collectedCount, viralStepState, type PlatformProgress, type StepState, type ViralRun } from "./viral-run";
import { VIRAL_PLATFORM_ORDER, keywordsLabel } from "./viral-utils";

function StepRow({
  state,
  icon,
  label,
  detail,
  children,
}: {
  state: StepState;
  icon: ReactNode;
  label: string;
  detail?: ReactNode;
  children?: ReactNode;
}) {
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
      <div className="min-w-0 flex-1 pt-1">
        <p className={cn("text-sm font-medium", state === "upcoming" || state === "skipped" ? "text-muted" : "text-ink")}>
          {label}
          <span className="sr-only">
            {" "}
            ({state === "done" ? "terminé" : state === "current" ? "en cours" : state === "skipped" ? "désactivé" : "à venir"})
          </span>
        </p>
        {detail ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p> : null}
        {children}
      </div>
    </li>
  );
}

function platformDetail(progress: PlatformProgress | undefined): { text: string; warning?: string; error?: string } {
  if (!progress || progress.state === "pending") return { text: "en attente" };
  if (progress.state === "running") return { text: "recherche des vidéos…" };
  const summary = progress.summary;
  if (!summary) return { text: "terminé" };
  if (summary.error) return { text: "", error: summary.error };
  const parts = [`${summary.count} ${pluralize(summary.count, "vidéo", "vidéos")}`];
  if (summary.medianViews !== undefined) parts.push(`médiane ${formatCompact(summary.medianViews)} vues`);
  if (!summary.ratiosAllowed) parts.push("ratios désactivés");
  else if (summary.medianMultiplier !== undefined) parts.push(`médiane ${formatMultiplier(summary.medianMultiplier)} son audience`);
  return { text: parts.join(" · "), ...(summary.warning ? { warning: summary.warning } : {}) };
}

export interface ViralProgressProps {
  run: ViralRun;
  aiConfigured: boolean | null;
  onCancel: () => void;
}

/**
 * Live panel of a lab run: collection per platform (spinner → n vidéos /
 * warning / error), the authors' followers, Claude's analysis (n
 * caractères), with cancel.
 */
export function ViralProgress({ run, aiConfigured, onCancel }: ViralProgressProps) {
  const collect = viralStepState("collect", run, aiConfigured);
  const enrich = viralStepState("enrich", run, aiConfigured);
  const analysis = viralStepState("analysis", run, aiConfigured);
  const platforms = VIRAL_PLATFORM_ORDER.filter((platform) => run.platforms[platform] !== undefined);
  const collected = collectedCount(run);
  const keywords = run.request ? keywordsLabel(run.request.keywords) : "";

  return (
    <Card as="section" aria-label="Progression de l'analyse" elevated className="overflow-hidden animate-fade-in">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-hot text-hot-fg">
            <Flame aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Analyse en cours</h2>
            <p className="truncate text-sm text-muted">{keywords || "Votre niche"}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" leftIcon={<X aria-hidden className="size-4" />} onClick={onCancel}>
          Annuler
        </Button>
      </div>

      <div className="px-5 pb-5 pt-5 sm:px-6">
        <Progress label="Progression de l'analyse de ce qui cartonne" value={null} size="xs" />
        <ol className="mt-5 space-y-4">
          <StepRow
            state={collect}
            icon={<Download />}
            label="Collecte des vidéos récentes"
            detail={collect === "done" ? `${collected} ${pluralize(collected, "vidéo récupérée", "vidéos récupérées")}` : undefined}
          >
            {platforms.length > 0 ? (
              <ul className="mt-2 space-y-1.5" aria-label="Collecte par plateforme">
                {platforms.map((platform: ViralPlatform) => {
                  const progress = run.platforms[platform];
                  const detail = platformDetail(progress);
                  return (
                    <li key={platform} className="flex items-start gap-2 text-xs">
                      <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center">
                        {progress?.state === "running" ? (
                          <Spinner size="xs" className="text-accent" />
                        ) : progress?.state === "done" ? (
                          progress.summary?.error ? (
                            <X aria-hidden className="size-3.5 text-danger-ink" />
                          ) : progress.summary?.warning ? (
                            <CircleAlert aria-hidden className="size-3.5 text-warning-ink" />
                          ) : (
                            <Check aria-hidden className="size-3.5 text-success-ink" strokeWidth={3} />
                          )
                        ) : (
                          <span aria-hidden className="size-1.5 rounded-full bg-faint/60" />
                        )}
                      </span>
                      <PlatformIcon platform={platform} size="xs" tile={false} decorative className="mt-px" />
                      <span className="min-w-0">
                        <span className="font-medium text-ink">{platformLabel(platform)} : </span>
                        {detail.error ? <span className="text-danger-ink">{detail.error}</span> : null}
                        {detail.text ? <span className="text-muted">{detail.text}</span> : null}
                        {detail.warning ? <span className="text-warning-ink"> — {detail.warning}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </StepRow>
          <StepRow
            state={enrich}
            icon={<UsersRound />}
            label="Récupération des abonnés des auteurs"
            detail={
              enrich === "current" || enrich === "upcoming"
                ? "Pour mesurer de combien chaque vidéo dépasse l'audience de son créateur."
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
                    : "Recettes, hooks, ce qui fait s'abonner, idées pour vous…"
                  : undefined
            }
          />
        </ol>
      </div>
    </Card>
  );
}
