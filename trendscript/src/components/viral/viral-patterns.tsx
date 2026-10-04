"use client";

import { Ban, Clapperboard, Eye, Hash, Lightbulb, Quote, Sparkles, Timer, UserPlus, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { PostChips, PostLink } from "@/components/competitors/post-items";
import { IdeaCard } from "@/components/competitors/report-for-you";
import { ReportSection, SubHeading } from "@/components/competitors/report-section";
import { resolvePosts } from "@/components/competitors/report-utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { pluralize } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import type { PostReference, ViralPatterns, ViralPost, ViralReport } from "@/lib/types";
import { viralAuthorLabel } from "@/lib/viral/labels";
import { MultiplierBadge, viralChipMetric } from "./viral-post-items";
import { viralPostIndex } from "./viral-utils";

export interface PatternsProps {
  report: ViralReport;
  patterns: ViralPatterns;
}

/** Verbatim quotes, each linked to the real video it comes from, with its × audience. */
function QuoteList({ examples, report, index }: { examples: PostReference[]; report: ViralReport; index: Map<string, ViralPost> }) {
  if (examples.length === 0) return null;
  return (
    <ul className="space-y-2.5" aria-label="Exemples tirés de vraies vidéos">
      {examples.map((example, exampleIndex) => {
        const post = index.get(example.postId);
        return (
          <li key={exampleIndex} className="rounded-xl bg-surface-2/70 px-3.5 py-2.5">
            <blockquote className="flex gap-2 text-sm leading-relaxed text-ink">
              <Quote aria-hidden className="mt-0.5 size-3.5 shrink-0 text-faint" />
              <span>« {example.quote} »</span>
            </blockquote>
            {post ? (
              <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 pl-5.5 text-xs text-muted">
                <MultiplierBadge post={post} report={report} size="sm" />
                <span className="min-w-0 truncate">{viralAuthorLabel(post)} :</span>
                <PostLink post={post} className="min-w-0 max-w-full truncate text-muted">
                  {post.title}
                </PostLink>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Recettes gagnantes
// ---------------------------------------------------------------------------

function Lever({ icon, label, children, tone }: { icon: ReactNode; label: string; children: ReactNode; tone: "hot" | "accent" }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-2.5",
        tone === "hot" ? "border-hot/25 bg-hot-soft/60" : "border-accent/25 bg-accent-soft/60",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] [&_svg]:size-3.5",
          tone === "hot" ? "text-hot-ink" : "text-accent-ink",
        )}
      >
        <span aria-hidden className="inline-flex">
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink">{children}</p>
    </div>
  );
}

export function RecipesSection({ report, patterns }: PatternsProps) {
  const index = viralPostIndex(report.posts);
  const chipMetric = viralChipMetric(report);
  return (
    <ReportSection
      id="recettes"
      tone="hot"
      icon={<Sparkles />}
      title="Recettes gagnantes"
      description="Les mécaniques qui reviennent dans les vidéos qui dépassent leur audience : sujet, accroche, format et structure. Le levier abonnés est une hypothèse tirée de signaux publics, pas un nombre d'abonnements mesuré."
      aside={
        patterns.recipes.length > 0 ? (
          <Badge tone="hot" variant="soft">
            {patterns.recipes.length}
          </Badge>
        ) : null
      }
    >
      {patterns.recipes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {patterns.recipes.map((recipe, rank) => {
            const quoted = new Set(recipe.examples.map((example) => example.postId));
            const others = resolvePosts(recipe.postIds, index).filter((post) => !quoted.has(post.id));
            const evidence = new Set([...recipe.postIds, ...quoted]).size;
            return (
              <Card key={rank} as="article" aria-labelledby={`recette-${rank}`} className="flex min-w-0 flex-col gap-3 px-5 py-5 sm:px-6">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-hot px-1.5 text-xs font-bold tabular-nums text-hot-fg"
                  >
                    {rank + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 id={`recette-${rank}`} className="text-base font-semibold leading-snug tracking-tight text-ink">
                      {recipe.name}
                    </h3>
                    {evidence > 0 ? (
                      <p className="mt-0.5 text-xs text-muted">
                        Observée sur {evidence} {pluralize(evidence, "vidéo", "vidéos")}
                      </p>
                    ) : null}
                  </div>
                </div>
                {recipe.description ? <p className="text-sm leading-relaxed text-ink/85">{recipe.description}</p> : null}
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {recipe.viewsLever ? (
                    <Lever icon={<Eye />} label="Levier vues" tone="hot">
                      {recipe.viewsLever}
                    </Lever>
                  ) : null}
                  {recipe.followLever ? (
                    <Lever icon={<UserPlus />} label="Levier abonnés (hypothèse)" tone="accent">
                      {recipe.followLever}
                    </Lever>
                  ) : null}
                </div>
                <QuoteList examples={recipe.examples} report={report} index={index} />
                {others.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Aussi dans :</p>
                    <PostChips posts={others} max={3} label="Autres vidéos de cette recette" metric={chipMetric} />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">Pas de recette récurrente identifiée sur ces vidéos.</p>
      )}
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function HooksSection({ report, patterns }: PatternsProps) {
  const index = viralPostIndex(report.posts);
  if (patterns.hookPatterns.length === 0) return null;
  return (
    <ReportSection
      id="hooks"
      icon={<Zap />}
      title="Hooks qui marchent"
      description="Les formules d'accroche des vidéos qui explosent, avec leurs phrases exactes. À comprendre et adapter, jamais à recopier."
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {patterns.hookPatterns.map((pattern, rank) => (
          <Card key={rank} as="article" className="min-w-0 px-5 py-4 sm:px-6">
            <h3 className="text-[0.9375rem] font-semibold leading-snug text-ink">{pattern.pattern}</h3>
            {pattern.whyItWorks ? <p className="mt-1 text-sm leading-relaxed text-muted">{pattern.whyItWorks}</p> : null}
            <div className="mt-3">
              <QuoteList examples={pattern.examples} report={report} index={index} />
            </div>
          </Card>
        ))}
      </div>
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Formats & durées, sujets porteurs
// ---------------------------------------------------------------------------

export function FormatsSection({ report, patterns }: PatternsProps) {
  const index = viralPostIndex(report.posts);
  const chipMetric = viralChipMetric(report);
  if (patterns.formats.length === 0 && !patterns.durations.trim()) return null;
  return (
    <ReportSection
      id="formats"
      icon={<Clapperboard />}
      title="Formats et durées"
      description="Comment ces vidéos sont tournées et montées, et la durée qui tient l'attention dans votre niche."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {patterns.formats.length > 0 ? (
          <Card className="px-5 py-4 sm:px-6">
            <SubHeading className="mb-3">Formats</SubHeading>
            <ul className="divide-y divide-line">
              {patterns.formats.map((format, rank) => (
                <li key={rank} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-ink">{format.name}</p>
                  {format.description ? <p className="mt-0.5 text-sm leading-relaxed text-muted">{format.description}</p> : null}
                  <PostChips posts={resolvePosts(format.postIds, index)} className="mt-2" label="Vidéos de ce format" metric={chipMetric} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        {patterns.durations.trim() ? (
          <Card className={cn("px-5 py-4 sm:px-6", patterns.formats.length === 0 && "lg:col-span-2")}>
            <SubHeading className="mb-2 flex items-center gap-1.5">
              <Timer aria-hidden className="size-3.5 text-faint" />
              Durées et rythme
            </SubHeading>
            <p className="text-sm leading-relaxed text-ink/85">{patterns.durations}</p>
          </Card>
        ) : null}
      </div>
    </ReportSection>
  );
}

export function TopicsSection({ report, patterns }: PatternsProps) {
  const index = viralPostIndex(report.posts);
  const chipMetric = viralChipMetric(report);
  if (patterns.topics.length === 0) return null;
  return (
    <ReportSection
      id="sujets"
      icon={<Hash />}
      title="Sujets porteurs"
      description="Les sujets qui tirent les vues en ce moment dans votre niche, preuves à l'appui."
    >
      <Card className="px-5 py-4 sm:px-6">
        <ul className="divide-y divide-line">
          {patterns.topics.map((topic, rank) => (
            <li key={rank} className="py-3.5 first:pt-0 last:pb-0">
              <p className="text-sm font-semibold text-ink">{topic.topic}</p>
              {topic.evidence ? <p className="mt-0.5 text-sm leading-relaxed text-muted">{topic.evidence}</p> : null}
              <PostChips posts={resolvePosts(topic.postIds, index)} className="mt-2" label="Vidéos sur ce sujet" metric={chipMetric} />
            </li>
          ))}
        </ul>
      </Card>
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Ce qui fait s'abonner, à éviter
// ---------------------------------------------------------------------------

export function FollowDriversSection({ report, patterns }: PatternsProps) {
  const index = viralPostIndex(report.posts);
  const chipMetric = viralChipMetric(report);
  if (patterns.followDrivers.length === 0) return null;
  return (
    <ReportSection
      id="abonnes"
      tone="foryou"
      icon={<UserPlus />}
      title="Ce qui fait s'abonner"
      description="Pourquoi un inconnu qui tombe sur ces vidéos s'abonne plutôt que de passer à la suivante. Hypothèses de Claude tirées des vidéos vues bien au-delà de leur audience : aucune plateforme ne publie les abonnements gagnés par vidéo."
    >
      <Card className="px-5 py-4 sm:px-6">
        <ol className="space-y-4">
          {patterns.followDrivers.map((driver, rank) => (
            <li key={rank} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink"
              >
                {rank + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-relaxed text-ink">{driver.insight}</p>
                {driver.evidence ? <p className="mt-1 text-sm leading-relaxed text-muted">{driver.evidence}</p> : null}
                <PostChips posts={resolvePosts(driver.postIds, index)} className="mt-2" metric={chipMetric} label="Vidéos qui l'illustrent" />
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </ReportSection>
  );
}

export function AvoidSection({ patterns }: { patterns: ViralPatterns }) {
  if (patterns.avoid.length === 0) return null;
  return (
    <ReportSection
      id="eviter"
      icon={<Ban />}
      title="À éviter"
      description="Ce qui est saturé ou risqué dans la niche en ce moment."
    >
      <Card className="px-5 py-4 sm:px-6">
        <ul className="grid gap-x-6 gap-y-2.5 md:grid-cols-2">
          {patterns.avoid.map((item, rank) => (
            <li key={rank} className="flex gap-3 text-sm leading-relaxed text-ink/85">
              <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-danger-ink" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Idées pour vous
// ---------------------------------------------------------------------------

export interface ViralIdeasSectionProps extends PatternsProps {
  /** Opens the Studio at the Script step with this idea. */
  onWriteIdea?: (ideaIndex: number) => void;
}

export function ViralIdeasSection({ report, patterns, onWriteIdea }: ViralIdeasSectionProps) {
  const index = viralPostIndex(report.posts);
  const chipMetric = viralChipMetric(report);
  const { ideas } = patterns;
  return (
    <ReportSection
      id="idees"
      tone="foryou"
      icon={<Lightbulb />}
      title="Idées pour vous"
      description="Pensées pour les vues et pour les abonnés, adaptées à votre profil : inspirées des recettes qui marchent, jamais copiées. « Écrire ce script » ouvre le Studio avec l'idée, les vidéos qui l'inspirent et ce rapport."
      aside={
        ideas.length > 0 ? (
          <Badge tone="accent" icon={<Sparkles />}>
            {ideas.length}
          </Badge>
        ) : null
      }
    >
      {ideas.length > 0 ? (
        <div className={cn("grid grid-cols-1 gap-4", ideas.length > 1 && "md:grid-cols-2")}>
          {ideas.map((idea, ideaIndex) => (
            <IdeaCard
              key={ideaIndex}
              idea={idea}
              rank={ideaIndex + 1}
              posts={index}
              followDrivers={patterns.followDrivers}
              onWrite={onWriteIdea ? () => onWriteIdea(ideaIndex) : undefined}
              inspiredLabel="Inspirée de ces vidéos :"
              chipMetric={chipMetric}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Claude n&apos;a pas proposé d&apos;idée pour ce rapport : relancez l&apos;analyse.</p>
      )}
    </ReportSection>
  );
}
