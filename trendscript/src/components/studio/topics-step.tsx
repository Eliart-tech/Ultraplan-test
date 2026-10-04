"use client";

import {
  CalendarClock,
  ChevronDown,
  FilterX,
  Globe,
  Layers,
  Pencil,
  RadioTower,
  RotateCcw,
  SearchX,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber, formatRelative, pluralize } from "@/lib/client/format";
import { useCompetitors } from "@/lib/client/storage";
import { useNow } from "@/lib/client/use-now";
import { useServerStatus } from "@/lib/client/use-server-status";
import { competitorCoverage } from "@/lib/creators/coverage";
import type { Analysis, Platform, Signal, SourceStatus, Topic } from "@/lib/types";
import { SourceSummaryList } from "./analysis-progress";
import { SORT_LABELS, countryLabel, languageLabel, type TopicSort } from "./studio-options";
import { useStudio } from "./studio-store";
import { evidenceFor, filterTopics, hasNiche, platformCounts, sortTopics } from "./studio-utils";
import { TopicCard } from "./topic-card";

/**
 * Step 2 — Sujets: what the analysis found, filters, and the ranked topic
 * cards with their evidence.
 */
export function TopicsStep() {
  const { state, dispatch, actions } = useStudio();
  const { draft } = state;
  const analysis = draft.analysis;
  const { filters } = draft;
  const now = useNow();
  const { status } = useServerStatus();
  const { reports: competitors } = useCompetitors();

  const signalMap = useMemo(
    () => new Map<string, Signal>((analysis?.signals ?? []).map((signal) => [signal.id, signal])),
    [analysis],
  );

  if (!analysis) return null;

  const showNiche = hasNiche(analysis.request);
  const sort: TopicSort = filters.sort === "niche" && !showNiche ? "score" : filters.sort;
  const { visible, hiddenSensitive } = filterTopics(analysis.topics, filters);
  const topics = sortTopics(visible, sort);
  const filtered = filters.platforms.length > 0 || hiddenSensitive > 0;

  function choose(topic: Topic) {
    dispatch({ type: "selectTopic", topic, evidence: evidenceFor(topic, signalMap) });
  }

  return (
    <div className="space-y-6">
      <AnalysisHeader
        analysis={analysis}
        statuses={status?.sources ?? null}
        aiConfigured={status?.ai.configured ?? null}
        now={now}
        onRerun={() => void actions.runAnalysis(analysis.request)}
        onEdit={() => dispatch({ type: "goTo", step: "radar" })}
      />

      {analysis.topics.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title="Aucun sujet n'a émergé de cette analyse"
          description="Les sources n'ont pas renvoyé assez de signaux exploitables. Ajoutez des mots-clés de niche, activez d'autres sources (YouTube, Instagram, TikTok via Réglages) ou essayez un autre pays, puis relancez."
          action={
            <>
              <Button leftIcon={<Pencil aria-hidden className="size-4" />} onClick={() => dispatch({ type: "goTo", step: "radar" })}>
                Modifier le radar
              </Button>
              <ButtonLink href="/reglages" variant="secondary" leftIcon={<Settings2 aria-hidden className="size-4" />}>
                Configurer des sources
              </ButtonLink>
            </>
          }
        />
      ) : (
        <>
          <TopicToolbar
            topics={analysis.topics}
            platforms={filters.platforms}
            onPlatformsChange={(platforms) => dispatch({ type: "updateFilters", patch: { platforms } })}
            hideSensitive={filters.hideSensitive}
            onHideSensitiveChange={(hideSensitive) => dispatch({ type: "updateFilters", patch: { hideSensitive } })}
            sort={sort}
            onSortChange={(next) => dispatch({ type: "updateFilters", patch: { sort: next } })}
            showNiche={showNiche}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted" aria-live="polite">
            <p>
              <span className="font-semibold tabular-nums text-ink">{topics.length}</span>{" "}
              {pluralize(topics.length, "sujet affiché", "sujets affichés")} sur {analysis.topics.length}
              {hiddenSensitive > 0
                ? ` · ${hiddenSensitive} ${pluralize(hiddenSensitive, "sujet très sensible masqué", "sujets très sensibles masqués")}`
                : ""}
            </p>
            {hiddenSensitive > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "updateFilters", patch: { hideSensitive: false } })}>
                Les afficher
              </Button>
            ) : null}
          </div>

          {topics.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<FilterX />}
              title="Aucun sujet ne correspond à ces filtres"
              description="Élargissez le filtre de plateformes ou affichez les sujets sensibles."
              action={
                filtered ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => dispatch({ type: "updateFilters", patch: { platforms: [], hideSensitive: false } })}
                  >
                    Réinitialiser les filtres
                  </Button>
                ) : null
              }
            />
          ) : (
            <ol className="space-y-4" aria-label="Sujets proposés">
              {topics.map((topic, index) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  rank={index + 1}
                  evidence={evidenceFor(topic, signalMap)}
                  showNiche={showNiche}
                  selected={draft.topic?.id === topic.id}
                  onChoose={() => choose(topic)}
                  now={now}
                  coverage={competitors.length > 0 ? competitorCoverage(topic, competitors) : undefined}
                />
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface AnalysisHeaderProps {
  analysis: Analysis;
  statuses: SourceStatus[] | null;
  aiConfigured: boolean | null;
  now: number;
  onRerun: () => void;
  onEdit: () => void;
}

function AnalysisHeader({ analysis, statuses, aiConfigured, now, onRerun, onEdit }: AnalysisHeaderProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { request } = analysis;
  const failed = analysis.sources.filter((source) => !source.ok).length;
  const warned = analysis.sources.filter((source) => source.ok && !source.skipped && source.warning).length;
  const totalSignals = analysis.sources.reduce((sum, source) => sum + source.count, 0);
  const used = analysis.sources.filter((source) => !source.skipped).length;

  return (
    <Card as="section" aria-label="Résumé de l'analyse">
      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {analysis.mode === "ai" ? (
              <Badge tone="accent" icon={<Sparkles />}>
                Synthèse IA{analysis.model ? ` · ${analysis.model}` : ""}
              </Badge>
            ) : (
              <Badge tone="warning" icon={<Layers />}>
                Sans IA · regroupement automatique
              </Badge>
            )}
            <Badge tone="neutral" icon={<Globe />}>
              {countryLabel(request.geo)} · {languageLabel(request.language)}
            </Badge>
            <Badge tone="neutral" icon={<RadioTower />}>
              {formatNumber(totalSignals)} {pluralize(totalSignals, "signal", "signaux")} · {used} source{used > 1 ? "s" : ""}
            </Badge>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <CalendarClock aria-hidden className="size-4 text-faint" />
            <time dateTime={analysis.createdAt}>Analyse du {formatDateTime(analysis.createdAt)}</time>
            <span className="text-faint">({formatRelative(analysis.createdAt, now)})</span>
            {request.niche.trim() ? (
              <>
                <span aria-hidden className="text-faint">
                  ·
                </span>
                <span>
                  Niche : <span className="font-medium text-ink">{request.niche.trim()}</span>
                </span>
              </>
            ) : null}
            {request.keywords.length > 0 ? (
              <>
                <span aria-hidden className="text-faint">
                  ·
                </span>
                <span>{request.keywords.map((keyword) => `#${keyword}`).join(" ")}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="secondary" leftIcon={<Pencil aria-hidden className="size-4" />} onClick={onEdit}>
            Modifier le radar
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<RotateCcw aria-hidden className="size-4" />} onClick={onRerun}>
            Relancer
          </Button>
        </div>
      </div>

      {analysis.mode === "basic" ? (
        <div className="px-5 pb-5 sm:px-6">
          <Alert tone="info" size="sm" role="none" title="Mode sans IA">
            {aiConfigured
              ? "La synthèse par Claude n'a pas abouti pour cette analyse : les sujets sont regroupés automatiquement à partir des mêmes données réelles, sans angles proposés (détails dans les notes)."
              : "Les sujets sont regroupés automatiquement à partir des données réelles, sans angles proposés. Ajoutez ANTHROPIC_API_KEY (voir Réglages) pour que Claude regroupe les signaux, évalue la pertinence pour votre niche et propose des angles."}
          </Alert>
        </div>
      ) : null}

      <div className="border-t border-line px-5 py-3 sm:px-6">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-2 rounded-lg py-1 text-sm font-medium text-muted transition-colors duration-150 hover:text-ink"
        >
          Sources et notes
          {failed > 0 ? (
            <Badge size="sm" tone="danger">
              {failed} erreur{failed > 1 ? "s" : ""}
            </Badge>
          ) : null}
          {warned > 0 ? (
            <Badge size="sm" tone="warning">
              {warned} avertissement{warned > 1 ? "s" : ""}
            </Badge>
          ) : null}
          <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
        <div id={panelId} hidden={!open}>
          {open ? (
            <div className="grid gap-6 pb-2 pt-4 animate-fade-in lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted">Sources</h3>
                <SourceSummaryList summaries={analysis.sources} statuses={statuses} />
              </div>
              {analysis.notes.length > 0 ? (
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted">Notes</h3>
                  <ul className="space-y-2">
                    {analysis.notes.map((note, index) => (
                      <li key={index} className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

interface TopicToolbarProps {
  topics: Topic[];
  platforms: Platform[];
  onPlatformsChange: (platforms: Platform[]) => void;
  hideSensitive: boolean;
  onHideSensitiveChange: (value: boolean) => void;
  sort: TopicSort;
  onSortChange: (sort: TopicSort) => void;
  showNiche: boolean;
}

const chipBase =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-[background-color,border-color,color] duration-150";

function TopicToolbar({
  topics,
  platforms,
  onPlatformsChange,
  hideSensitive,
  onHideSensitiveChange,
  sort,
  onSortChange,
  showNiche,
}: TopicToolbarProps) {
  const sortId = useId();
  const counts = platformCounts(topics);
  const sortOptions = (Object.keys(SORT_LABELS) as TopicSort[])
    .filter((key) => key !== "niche" || showNiche)
    .map((key) => ({ value: key, label: SORT_LABELS[key] }));

  function togglePlatform(platform: Platform) {
    onPlatformsChange(
      platforms.includes(platform) ? platforms.filter((item) => item !== platform) : [...platforms, platform],
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/70 p-3 lg:flex-row lg:items-center lg:justify-between">
      <div role="group" aria-label="Filtrer par plateforme" className="-m-1 flex gap-1.5 overflow-x-auto p-1 scrollbar-none">
        <button
          type="button"
          aria-pressed={platforms.length === 0}
          onClick={() => onPlatformsChange([])}
          className={cn(
            chipBase,
            platforms.length === 0
              ? "border-accent bg-accent-soft text-accent-ink"
              : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
          )}
        >
          Toutes
          <span className="tabular-nums opacity-70">{topics.length}</span>
        </button>
        {counts.map(({ platform, count }) => {
          const pressed = platforms.includes(platform);
          return (
            <button
              key={platform}
              type="button"
              aria-pressed={pressed}
              onClick={() => togglePlatform(platform)}
              className={cn(
                chipBase,
                pressed
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              <PlatformIcon platform={platform} size="xs" tile={false} decorative />
              {platformLabel(platform)}
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-1">
        <Switch
          size="sm"
          switchFirst
          checked={hideSensitive}
          onCheckedChange={onHideSensitiveChange}
          label="Masquer les sujets sensibles"
        />
        <div className="flex items-center gap-2">
          <label htmlFor={sortId} className="shrink-0 text-sm text-muted">
            Trier par
          </label>
          <Select
            id={sortId}
            size="sm"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as TopicSort)}
            options={sortOptions}
            className="w-44!"
          />
        </div>
      </div>
    </div>
  );
}
