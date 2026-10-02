"use client";

import { CircleCheck, CircleMinus, CircleX, Layers, Pencil, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { formatNumber, pluralize } from "@/lib/client/format";
import type { Platform, SourceId, SourceRunSummary, SourceStatus } from "@/lib/types";
import { SOURCE_FALLBACK, countryLabel, languageLabel } from "./studio-options";
import type { AnalysisRun, SourceProgress } from "./studio-store";

/** Label and platform of a source, from /api/sources when loaded. */
export function sourceInfo(id: SourceId, statuses: SourceStatus[] | null): { label: string; platform: Platform } {
  const status = statuses?.find((source) => source.id === id);
  return status ? { label: status.label, platform: status.platform } : SOURCE_FALLBACK[id] ?? { label: id, platform: "google" };
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: ms < 10_000 ? 1 : 0 })} s`;
}

/** Status cell of one source: spinner, ✓ n signaux, ⚠, ✕ or "ignorée". */
function SourceStatusLabel({ progress }: { progress: SourceProgress | undefined }) {
  if (!progress || progress.state === "pending") {
    return <span className="text-xs text-faint">En attente</span>;
  }
  if (progress.state === "running" || !progress.summary) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-ink">
        <Spinner size="xs" />
        Collecte…
      </span>
    );
  }
  const summary = progress.summary;
  if (summary.skipped) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        <CircleMinus aria-hidden className="size-4" />
        Ignorée
      </span>
    );
  }
  if (!summary.ok) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger-ink">
        <CircleX aria-hidden className="size-4" />
        Erreur
      </span>
    );
  }
  const empty = summary.count === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium tabular-nums",
        empty ? "text-warning-ink" : "text-success-ink",
      )}
    >
      {empty ? <TriangleAlert aria-hidden className="size-4" /> : <CircleCheck aria-hidden className="size-4" />}
      {formatNumber(summary.count)} {pluralize(summary.count, "signal", "signaux")}
      {summary.cached ? (
        <Badge size="sm" tone="neutral" title="Résultat réutilisé depuis le cache du serveur">
          cache
        </Badge>
      ) : null}
    </span>
  );
}

export interface SourceRunRowProps {
  id: SourceId;
  statuses: SourceStatus[] | null;
  progress: SourceProgress | undefined;
}

/** One line of the per-source progress (or summary) list. */
export function SourceRunRow({ id, statuses, progress }: SourceRunRowProps) {
  const { label, platform } = sourceInfo(id, statuses);
  const summary = progress?.summary;
  const detail = summary ? (summary.error ?? summary.warning) : undefined;
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <PlatformIcon platform={platform} size="sm" decorative className="mt-px" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-ink">{label}</span>
          <span className="flex items-center gap-2">
            {summary && !summary.skipped ? (
              <span className="text-xs tabular-nums text-faint">{formatSeconds(summary.durationMs)}</span>
            ) : null}
            <SourceStatusLabel progress={progress} />
          </span>
        </div>
        {detail ? (
          <p
            className={cn(
              "mt-1 text-xs leading-relaxed",
              summary?.ok === false ? "text-danger-ink" : summary?.skipped ? "text-muted" : "text-warning-ink",
            )}
          >
            {detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Static list of source summaries (Sujets header, history). */
export function SourceSummaryList({ summaries, statuses }: { summaries: SourceRunSummary[]; statuses: SourceStatus[] | null }) {
  return (
    <ul className="divide-y divide-line">
      {summaries.map((summary) => (
        <SourceRunRow key={summary.source} id={summary.source} statuses={statuses} progress={{ state: "done", summary }} />
      ))}
    </ul>
  );
}

export interface AnalysisProgressProps {
  run: AnalysisRun;
  statuses: SourceStatus[] | null;
  onCancel: () => void;
  onRetry: () => void;
  /** Back to the form (after an error or a cancel). */
  onEdit: () => void;
}

/**
 * Live panel of a running analysis: request recap, per-source progress
 * (spinner → ✓ n signaux / ⚠ / ✕ / ignorée), then the synthesis phase.
 * After a failure it stays visible (which source failed is useful) with
 * retry / edit actions.
 */
export function AnalysisProgress({ run, statuses, onCancel, onRetry, onEdit }: AnalysisProgressProps) {
  const request = run.request;
  if (!request) return null;
  const ids = request.sources;
  const done = ids.filter((id) => run.sources[id]?.state === "done").length;
  const running = run.status === "running";
  const synthesis = run.synthesis;
  const totalSignals = ids.reduce((sum, id) => sum + (run.sources[id]?.summary?.count ?? 0), 0);

  return (
    <Card as="section" aria-label="Progression de l'analyse" elevated className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {running ? (
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <Spinner size="md" />
              </span>
            ) : (
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl",
                  run.status === "error" ? "bg-danger-soft text-danger-ink" : "bg-surface-2 text-muted",
                )}
              >
                {run.status === "error" ? <CircleX aria-hidden className="size-5" /> : <X aria-hidden className="size-5" />}
              </span>
            )}
            <div>
              <h2 className="text-base font-semibold text-ink">
                {running ? "Analyse en cours" : run.status === "error" ? "L'analyse a échoué" : "Analyse annulée"}
              </h2>
              <p className="text-sm text-muted">
                {countryLabel(request.geo)} · {languageLabel(request.language)}
                {request.niche.trim() ? ` · ${request.niche.trim()}` : ""}
                {request.keywords.length ? ` · ${request.keywords.map((keyword) => `#${keyword}`).join(" ")}` : ""}
              </p>
            </div>
          </div>
        </div>
        {running ? (
          <Button variant="secondary" size="sm" leftIcon={<X aria-hidden className="size-4" />} onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
      </div>

      <div className="px-5 py-5 sm:px-6">
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted">
            <span>
              {synthesis
                ? "Sources terminées"
                : `${done} source${done > 1 ? "s" : ""} sur ${ids.length} terminée${done > 1 ? "s" : ""}`}
            </span>
            <span className="tabular-nums">
              {formatNumber(totalSignals)} {pluralize(totalSignals, "signal", "signaux")}
            </span>
          </div>
          <Progress
            label="Progression de l'analyse"
            value={running && synthesis ? null : done}
            max={ids.length}
            valueText={synthesis ? "Synthèse en cours" : `${done} sources sur ${ids.length}`}
            tone={run.status === "error" ? "danger" : "accent"}
          />
        </div>

        <ul className="divide-y divide-line">
          {ids.map((id) => (
            <SourceRunRow key={id} id={id} statuses={statuses} progress={run.sources[id]} />
          ))}
        </ul>

        {synthesis ? (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-4 animate-fade-in">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                synthesis.mode === "ai" ? "bg-brand text-white" : "bg-surface-3 text-muted",
              )}
            >
              {synthesis.mode === "ai" ? <Sparkles aria-hidden className="size-4" /> : <Layers aria-hidden className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                {synthesis.mode === "ai" ? "Synthèse par Claude…" : "Regroupement automatique…"}
                {running ? <Spinner size="xs" className="text-accent" /> : null}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                {synthesis.signalCount === 0
                  ? "Aucun signal à regrouper."
                  : synthesis.mode === "ai"
                    ? `Claude regroupe ${formatNumber(synthesis.signalCount)} signaux en sujets, évalue leur pertinence pour votre niche et propose des angles. Comptez 30 s à 1 min.`
                    : `${formatNumber(synthesis.signalCount)} signaux regroupés sans IA, à partir des mêmes données réelles.`}
              </p>
            </div>
          </div>
        ) : running && done < ids.length ? (
          <p className="mt-5 text-xs leading-relaxed text-faint">
            Les sources gratuites répondent en quelques secondes ; les acteurs Apify peuvent prendre jusqu&apos;à 2 minutes.
          </p>
        ) : null}

        {run.status === "error" ? (
          <Alert
            tone="danger"
            title="L'analyse n'a pas pu aboutir"
            className="mt-5"
            action={
              <>
                <Button size="sm" leftIcon={<RotateCcw aria-hidden className="size-4" />} onClick={onRetry}>
                  Réessayer
                </Button>
                <Button size="sm" variant="secondary" leftIcon={<Pencil aria-hidden className="size-4" />} onClick={onEdit}>
                  Modifier les paramètres
                </Button>
              </>
            }
          >
            {run.error}
          </Alert>
        ) : null}

        {run.status === "cancelled" ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" leftIcon={<RotateCcw aria-hidden className="size-4" />} onClick={onRetry}>
              Relancer
            </Button>
            <Button size="sm" variant="secondary" leftIcon={<Pencil aria-hidden className="size-4" />} onClick={onEdit}>
              Modifier les paramètres
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
