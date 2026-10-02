"use client";

import { ArrowRight, Check, ChevronDown, Clock3, Layers3, ShieldAlert, TrendingUp, Zap } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MeterBar } from "@/components/ui/meter-bar";
import { PlatformStack } from "@/components/ui/platform-icon";
import { InfoPopover, Tooltip } from "@/components/ui/popover";
import { ScoreRing } from "@/components/ui/score-ring";
import { SCORE_EXPLANATION } from "@/lib/analysis/scoring";
import { cn } from "@/lib/cn";
import type { Signal, Topic } from "@/lib/types";
import { EvidenceList } from "./evidence-list";
import { LIFESPAN_META, SATURATION_META } from "./studio-options";

/** Lifespan, saturation and sensitivity badges of a topic. */
export function TopicBadges({ topic, className }: { topic: Topic; className?: string }) {
  const lifespan = LIFESPAN_META[topic.lifespan] ?? LIFESPAN_META.court;
  const saturation = SATURATION_META[topic.saturation] ?? SATURATION_META.moyenne;
  const sensitive = topic.sensitivity.level !== "faible";
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Tooltip content={lifespan.window}>
        <Badge
          tone={lifespan.tone}
          size="sm"
          icon={topic.lifespan === "flash" ? <Zap /> : topic.lifespan === "durable" ? <Layers3 /> : <Clock3 />}
        >
          {lifespan.label}
          <span className="sr-only"> : {lifespan.window}</span>
        </Badge>
      </Tooltip>
      <Tooltip content={saturation.hint}>
        <Badge tone={saturation.tone} size="sm" dot>
          {saturation.label}
          <span className="sr-only"> : {saturation.hint}</span>
        </Badge>
      </Tooltip>
      {sensitive ? (
        <Badge tone="warning" size="sm" icon={<ShieldAlert />}>
          {topic.sensitivity.level === "elevee" ? "Très sensible" : "Sensible"}
        </Badge>
      ) : null}
    </div>
  );
}

/** Popover listing how the score is computed. */
export function ScoreInfo() {
  return (
    <InfoPopover label="Comment le score est calculé" title="Comment le score est calculé" align="end" panelClassName="w-80">
      <ul className="space-y-1.5 text-xs leading-relaxed">
        {SCORE_EXPLANATION.map((line) => {
          const [head, ...rest] = line.split(" : ");
          return (
            <li key={line}>
              {rest.length ? (
                <>
                  <span className="font-semibold text-ink">{head} :</span> {rest.join(" : ")}
                </>
              ) : (
                line
              )}
            </li>
          );
        })}
      </ul>
    </InfoPopover>
  );
}

function ScorePanel({ scores, showNiche }: { scores: Topic["scores"]; showNiche: boolean }) {
  return (
    <div className="relative rounded-xl border border-line bg-surface-2/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">Score</p>
        <div className="-mr-1.5 -mt-1">
          <ScoreInfo />
        </div>
      </div>
      <div className="mt-1 flex items-center gap-4 md:flex-col md:items-stretch">
        <div className="flex items-center gap-3">
          <ScoreRing value={scores.total} size={60} label="Score total" />
          <p className="hidden text-xs leading-snug text-muted md:block">
            sur 100
            <br />
            {scores.total >= 70 ? "Forte opportunité" : scores.total >= 45 ? "Bonne opportunité" : "Opportunité modeste"}
          </p>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <MeterBar label="Momentum" value={scores.momentum} tone="hot" />
          <MeterBar label="Portée" value={scores.reach} />
          <MeterBar label="Multi-plateforme" value={scores.crossPlatform} />
          <MeterBar label="Fraîcheur" value={scores.freshness} />
          {showNiche ? <MeterBar label="Pertinence niche" value={scores.nicheFit} tone="success" /> : null}
        </div>
      </div>
    </div>
  );
}

export interface TopicCardProps {
  topic: Topic;
  /** 1-based position in the current list. */
  rank: number;
  evidence: Signal[];
  /** Show the niche bar (the analysis had a niche or keywords). */
  showNiche: boolean;
  /** Currently chosen topic. */
  selected: boolean;
  onChoose: () => void;
  /** From `useNow()`. */
  now: number;
}

/**
 * One topic proposal: rank, title, badges, why now, summary, score ring +
 * breakdown, expandable evidence and the "Choisir ce sujet" action.
 */
export function TopicCard({ topic, rank, evidence, showNiche, selected, onChoose, now }: TopicCardProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const sensitive = topic.sensitivity.level !== "faible";

  return (
    // No entry animation here: a filling animation would make each card a
    // stacking context and the score popover would slide under the next card.
    <Card as="li" selected={selected}>
      <div className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold tabular-nums",
                rank <= 3 ? "bg-brand text-white" : "bg-surface-2 text-muted",
              )}
            >
              <span className="sr-only">Rang </span>
              {rank}
            </span>
            {topic.category ? (
              <Badge size="sm" tone="neutral" variant="outline">
                {topic.category}
              </Badge>
            ) : null}
            <PlatformStack platforms={topic.platforms} size="xs" />
            {selected ? (
              <Badge size="sm" tone="accent" icon={<Check />}>
                Sujet choisi
              </Badge>
            ) : null}
          </div>

          <h2 id={titleId} className="mt-3 text-lg font-semibold leading-snug tracking-tight text-ink sm:text-xl">
            {topic.title}
          </h2>
          <TopicBadges topic={topic} className="mt-2.5" />

          {topic.whyNow ? (
            <p className="mt-4 flex gap-2.5 text-[0.9375rem] font-medium leading-relaxed text-ink">
              <TrendingUp aria-hidden className="mt-1 size-4 shrink-0 text-hot" />
              <span>
                <span className="sr-only">Pourquoi maintenant : </span>
                {topic.whyNow}
              </span>
            </p>
          ) : null}
          {topic.summary ? <p className="mt-2 text-sm leading-relaxed text-muted">{topic.summary}</p> : null}

          {sensitive && topic.sensitivity.reason ? (
            <p className="mt-4 flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning-ink">
              <ShieldAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>
                <span className="font-semibold">Sujet sensible : </span>
                {topic.sensitivity.reason.replace(/^sujet sensible\s*:\s*/i, "")}
              </span>
            </p>
          ) : null}
        </div>

        <div className="shrink-0 md:w-60">
          <ScorePanel scores={topic.scores} showNiche={showNiche} />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 self-start rounded-lg py-1 text-sm font-medium text-accent-ink transition-colors duration-150 hover:text-accent sm:self-auto"
        >
          {open ? "Masquer les preuves" : `Voir les preuves (${evidence.length})`}
          <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
        <Button
          variant={selected ? "soft" : "primary"}
          onClick={onChoose}
          rightIcon={<ArrowRight aria-hidden className="size-4" />}
          className="w-full sm:w-auto"
          aria-describedby={titleId}
        >
          {selected ? "Continuer avec ce sujet" : "Choisir ce sujet"}
        </Button>
      </div>

      <div id={panelId} hidden={!open}>
        {open ? (
          <div className="border-t border-line bg-surface-2/40 px-5 py-5 animate-fade-in sm:px-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
              Preuves · {evidence.length} signal{evidence.length > 1 ? "aux" : ""} réel{evidence.length > 1 ? "s" : ""}
            </h3>
            <EvidenceList signals={evidence} now={now} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
