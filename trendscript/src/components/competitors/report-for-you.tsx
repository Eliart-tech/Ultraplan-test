"use client";

import { Ban, Clapperboard, Compass, Lightbulb, PenLine, Sparkles, Target, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { CompetitorInsights, CompetitorReport, CreatorPost } from "@/lib/types";
import { PostChips } from "./post-items";
import { ReportSection, SubHeading } from "./report-section";
import { ideaFollowDriver, postIndex, resolvePosts, splitFollowSentences } from "./report-utils";

function Unavailable({ pending, what }: { pending: boolean; what: string }) {
  return (
    <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm leading-relaxed text-muted">
      {pending ? `${what} : Claude y travaille…` : `${what} demande l'analyse de Claude, indisponible pour ce rapport.`}
    </p>
  );
}

export interface ForYouSectionProps {
  report: CompetitorReport;
  pending?: boolean;
}

/**
 * What the analysis means for the user: the openings this creator leaves,
 * how to stand out given the user's own profile, and what must not be copied.
 */
export function ForYouSection({ report, pending = false }: ForYouSectionProps) {
  const insights = report.insights;
  return (
    <ReportSection
      id="pour-vous"
      tone="foryou"
      icon={<Target />}
      title="Ce que ça change pour vous"
      description="Les angles qu'il laisse libres, comment vous démarquer avec votre propre profil, et ce qu'il ne faut surtout pas reprendre."
    >
      {insights ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-accent/40! px-5 py-4 sm:px-6 xl:col-span-2">
            <SubHeading className="mb-3 text-accent-ink">Comment vous différencier</SubHeading>
            {insights.differentiation.length > 0 ? (
              <ol className="grid gap-4 md:grid-cols-2">
                {insights.differentiation.map((item, rank) => (
                  <li key={rank} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg"
                    >
                      {rank + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-relaxed text-ink">{item.recommendation}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{item.how}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">Pas de recommandation pour ce compte.</p>
            )}
          </Card>

          <Card className="px-5 py-4 sm:px-6">
            <SubHeading className="mb-3">Angles morts à prendre</SubHeading>
            {insights.gaps.length > 0 ? (
              <ul className="space-y-3.5">
                {insights.gaps.map((gap, rank) => (
                  <li key={rank} className="flex gap-3">
                    <Compass aria-hidden className="mt-0.5 size-[18px] shrink-0 text-accent" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-relaxed text-ink">{gap.opportunity}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted">{gap.why}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aucun angle mort identifié.</p>
            )}
          </Card>

          <Card className="px-5 py-4 sm:px-6">
            <SubHeading className="mb-3">À ne pas copier</SubHeading>
            {insights.doNotCopy.length > 0 ? (
              <ul className="space-y-2.5">
                {insights.doNotCopy.map((item, rank) => (
                  <li key={rank} className="flex gap-3 text-sm leading-relaxed text-ink/85">
                    <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-danger-ink" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Rien de signalé.</p>
            )}
          </Card>
        </div>
      ) : (
        <Unavailable pending={pending} what="Les angles morts et la différenciation" />
      )}
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Ideas
// ---------------------------------------------------------------------------

type Idea = CompetitorInsights["ideas"][number];
type FollowDriver = NonNullable<CompetitorInsights["followDrivers"]>[number];

export interface IdeaCardProps<P extends CreatorPost> {
  idea: Idea;
  /** 1-based. */
  rank: number;
  /** Posts the idea can cite (`inspiredBy` ids). */
  posts: Map<string, P>;
  /** Follow drivers of the analysis; the one sharing the most evidence is shown. */
  followDrivers?: FollowDriver[];
  onWrite?: () => void;
  /** Line above the inspiring posts (default "Mécanique inspirée de :"). */
  inspiredLabel?: string;
  /** Metric shown on each inspiring post chip (default: its views). */
  chipMetric?: (post: P) => string | undefined;
}

/**
 * One ready-to-script idea: format, title, angle, hook, why it fits the user
 * (sentences about subscribers highlighted), the follow lever it relies on,
 * the real posts it is inspired by, and "Écrire ce script". Shared by the
 * competitor report and the "Ce qui cartonne" lab.
 */
export function IdeaCard<P extends CreatorPost>({
  idea,
  rank,
  posts,
  followDrivers,
  onWrite,
  inspiredLabel = "Mécanique inspirée de :",
  chipMetric,
}: IdeaCardProps<P>) {
  const driver = ideaFollowDriver(idea, followDrivers);
  const sentences = splitFollowSentences(idea.whyForYou);
  const titleId = `idee-${rank}`;
  return (
    <Card as="article" aria-labelledby={titleId} className="flex flex-col">
      <div className="flex flex-1 flex-col gap-3 px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-brand px-1.5 text-xs font-bold tabular-nums text-white">
            <span className="sr-only">Idée </span>
            {rank}
          </span>
          {idea.format ? (
            <Badge size="sm" tone="neutral" icon={<Clapperboard />}>
              {idea.format}
            </Badge>
          ) : null}
        </div>
        <h3 id={titleId} className="text-base font-semibold leading-snug tracking-tight text-ink">
          {idea.title}
        </h3>
        {idea.angle ? (
          <p className="text-sm leading-relaxed text-ink/85">
            <span className="font-medium text-ink">Angle : </span>
            {idea.angle}
          </p>
        ) : null}
        {idea.hook ? (
          <div className="rounded-xl bg-surface-2/70 px-3.5 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Accroche</p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-ink">« {idea.hook} »</p>
          </div>
        ) : null}
        {idea.whyForYou ? (
          <div className="text-sm leading-relaxed">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Pourquoi pour vous</p>
            <p className="mt-1 text-muted">
              {sentences.map((sentence, sentenceIndex) => (
                <span key={sentenceIndex}>
                  {sentenceIndex > 0 ? " " : null}
                  {sentence.follow ? (
                    <span className="font-medium text-ink">
                      <UserPlus aria-hidden className="mr-1 inline size-3.5 align-[-2px] text-accent" />
                      {sentence.text}
                    </span>
                  ) : (
                    sentence.text
                  )}
                </span>
              ))}
            </p>
          </div>
        ) : null}
        {driver ? (
          <p className="flex gap-2 rounded-xl border border-accent/25 bg-accent-soft/60 px-3.5 py-2 text-xs leading-relaxed text-ink">
            <UserPlus aria-hidden className="mt-px size-3.5 shrink-0 text-accent-ink" />
            <span>
              <span className="font-semibold">Levier d&apos;abonnement (hypothèse) : </span>
              {driver.insight}
            </span>
          </p>
        ) : null}
        {idea.inspiredBy.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs text-muted">{inspiredLabel}</p>
            <PostChips
              posts={resolvePosts(idea.inspiredBy, posts)}
              max={2}
              label="Publications dont l'idée s'inspire"
              metric={chipMetric}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-4 border-t border-line px-5 py-3.5 sm:px-6">
        <Button
          fullWidth
          onClick={onWrite}
          disabled={!onWrite}
          leftIcon={<PenLine aria-hidden className="size-4" />}
          aria-describedby={titleId}
        >
          Écrire ce script
        </Button>
      </div>
    </Card>
  );
}

export interface IdeasSectionProps {
  report: CompetitorReport;
  pending?: boolean;
  /** Opens the Studio at the Script step with this idea; absent in previews. */
  onWriteIdea?: (ideaIndex: number) => void;
}

/** "Idées de vidéos pour vous": ready-to-script ideas, each sent to the Studio in one click. */
export function IdeasSection({ report, pending = false, onWriteIdea }: IdeasSectionProps) {
  const ideas = report.insights?.ideas ?? [];
  const index = postIndex(report.data.posts);
  return (
    <ReportSection
      id="idees"
      tone="foryou"
      icon={<Lightbulb />}
      title="Idées de vidéos pour vous"
      description="Inspirées de ses mécaniques qui marchent, pas de ses contenus : à votre façon, sur votre terrain. « Écrire ce script » ouvre le Studio avec l'idée, ses preuves et ce concurrent à éviter."
      aside={
        ideas.length > 0 ? (
          <Badge tone="accent" icon={<Sparkles />}>
            {ideas.length}
          </Badge>
        ) : null
      }
    >
      {ideas.length > 0 ? (
        <div className={cn("grid gap-4", ideas.length > 1 && "md:grid-cols-2")}>
          {ideas.map((idea, ideaIndex) => (
            <IdeaCard
              key={ideaIndex}
              idea={idea}
              rank={ideaIndex + 1}
              posts={index}
              followDrivers={report.insights?.followDrivers}
              onWrite={onWriteIdea ? () => onWriteIdea(ideaIndex) : undefined}
            />
          ))}
        </div>
      ) : (
        <Unavailable pending={pending} what="Les idées de vidéos" />
      )}
    </ReportSection>
  );
}
