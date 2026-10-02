"use client";

import { Activity, ArrowUpRight, Clock, Download, Globe2, Layers, Radar, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { PlatformStack } from "@/components/ui/platform-icon";
import { scoreTone } from "@/components/ui/score-ring";
import { cn } from "@/lib/cn";
import { downloadFile, scriptFileName } from "@/lib/client/export";
import { PLATFORMS, type Analysis, type Platform } from "@/lib/types";
import { analysisTitle, analysisToMarkdown, countryName, languageName, rankedTopics } from "./analysis-export";
import { MetaItem, RelativeTime, ResponsiveLabel } from "./history-card-parts";

export interface AnalysisHistoryCardProps {
  analysis: Analysis;
  /** Current time (from `useNow`) for the relative date. */
  now: number;
  /** Asks for confirmation; the parent removes the entry. */
  onDelete: (analysis: Analysis) => void;
}

/** Studio URL that reopens this analysis on the topics step (handled by the Studio page). */
export function analysisStudioHref(id: string): string {
  return `/?analyse=${encodeURIComponent(id)}`;
}

const scoreText: Record<ReturnType<typeof scoreTone>, string> = {
  hot: "text-hot-ink",
  accent: "text-accent-ink",
  neutral: "text-muted",
  success: "text-success-ink",
  warning: "text-warning-ink",
  danger: "text-danger-ink",
};

/**
 * A saved analysis: niche, country, mode (IA / sans IA), keywords, date,
 * counts and its three best topics; reopen it in the Studio (topics step),
 * export it as Markdown, copy it, delete it.
 */
export function AnalysisHistoryCard({ analysis, now, onDelete }: AnalysisHistoryCardProps) {
  const title = analysisTitle(analysis);
  const request = analysis.request;
  const topics = rankedTopics(analysis);
  const keywords = Array.isArray(request?.keywords) ? request.keywords.filter((k) => typeof k === "string") : [];
  const platforms = PLATFORMS.filter((platform: Platform) =>
    topics.some((topic) => Array.isArray(topic.platforms) && topic.platforms.includes(platform)),
  );
  const sourcesUsed = Array.isArray(analysis.sources)
    ? analysis.sources.filter((source) => source.ok && !source.skipped && source.count > 0).length
    : 0;
  const signalCount = Array.isArray(analysis.sources)
    ? analysis.sources.reduce((sum, source) => sum + (typeof source.count === "number" ? source.count : 0), 0)
    : 0;
  const place = [request?.geo ? countryName(request.geo) : "", request?.language ? languageName(request.language) : ""]
    .filter(Boolean)
    .join(" · ");

  function exportMarkdown() {
    downloadFile(scriptFileName(`analyse ${title}`, "md"), analysisToMarkdown(analysis), "text/markdown");
  }

  return (
    <Card as="li" className="flex flex-col">
      <div className="flex-1 pb-4">
        <div className="flex items-start gap-3.5 px-4 pt-4 sm:px-5 sm:pt-5">
          <span
            aria-hidden
            className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"
          >
            <Radar className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Globe2 aria-hidden className="size-3.5 text-faint" />
              {place || "Pays non précisé"}
            </p>
            <h2 className="mt-0.5 text-[0.9375rem] font-semibold leading-snug text-ink">{title}</h2>
            {keywords.length ? (
              <ul aria-label="Mots-clés" className="mt-2 flex flex-wrap gap-1">
                {keywords.slice(0, 8).map((keyword) => (
                  <li key={keyword}>
                    <Badge size="sm" variant="outline">
                      {keyword}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {analysis.mode === "ai" ? (
            <Badge
              tone="accent"
              size="sm"
              icon={<Sparkles />}
              title={analysis.model ? `Modèle : ${analysis.model}` : undefined}
            >
              IA
            </Badge>
          ) : (
            <Badge tone="neutral" size="sm" title="Regroupement automatique, sans angles">
              Sans IA
            </Badge>
          )}
        </div>

        {topics.length ? (
          <div className="px-4 pt-3.5 sm:px-5">
            <p className="text-xs font-medium text-muted">
              {topics.length > 3 ? "Meilleurs sujets" : topics.length > 1 ? "Sujets" : "Sujet"}
            </p>
            <ol className="mt-1.5 flex flex-col gap-1">
              {topics.slice(0, 3).map((topic, index) => {
                const score = typeof topic.scores?.total === "number" ? Math.round(topic.scores.total) : null;
                return (
                  <li key={topic.id ?? index} className="flex min-w-0 items-baseline gap-2.5 text-sm">
                    <span
                      className={cn(
                        "w-7 shrink-0 text-right text-xs font-semibold tabular-nums",
                        score === null ? "text-faint" : scoreText[scoreTone(score)],
                      )}
                    >
                      {score ?? "—"}
                      <span className="sr-only"> sur 100 :</span>
                    </span>
                    <span className="min-w-0 truncate text-ink" title={topic.title}>
                      {topic.title}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <p className="px-4 pt-3.5 text-sm text-muted sm:px-5">Aucun sujet n&apos;a été retenu dans cette analyse.</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3.5 sm:px-5">
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="Détails de l'analyse">
            <MetaItem icon={<Clock />}>
              <RelativeTime iso={analysis.createdAt} now={now} />
            </MetaItem>
            <MetaItem icon={<Layers />}>
              <span className="tabular-nums">
                {topics.length} sujet{topics.length > 1 ? "s" : ""}
              </span>
            </MetaItem>
            {signalCount > 0 ? (
              <MetaItem icon={<Activity />}>
                <span className="tabular-nums">
                  {signalCount} signa{signalCount > 1 ? "ux" : "l"} · {sourcesUsed} source{sourcesUsed > 1 ? "s" : ""}
                </span>
              </MetaItem>
            ) : null}
          </ul>
          {platforms.length ? <PlatformStack platforms={platforms} size="xs" className="ml-auto" /> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        <ButtonLink
          href={analysisStudioHref(analysis.id)}
          variant="primary"
          size="sm"
          leftIcon={<ArrowUpRight aria-hidden className="size-4" />}
          aria-label={`Ouvrir l'analyse « ${title} » dans le Studio`}
        >
          Ouvrir
        </ButtonLink>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportMarkdown}
            leftIcon={<Download aria-hidden className="size-4" />}
            aria-label={`Exporter .md : analyse « ${title} »`}
          >
            <ResponsiveLabel short=".md" full="Exporter .md" />
          </Button>
          <CopyButton text={() => analysisToMarkdown(analysis)} label="Copier" />
          <IconButton
            label={`Supprimer l'analyse « ${title} »`}
            size="sm"
            icon={<Trash2 aria-hidden className="size-4" />}
            onClick={() => onDelete(analysis)}
            className="hover:bg-danger-soft! hover:text-danger-ink!"
          />
        </div>
      </div>
    </Card>
  );
}
