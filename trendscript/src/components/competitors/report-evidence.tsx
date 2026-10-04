"use client";

import {
  BarChart3,
  CalendarClock,
  CircleCheck,
  Flame,
  Info,
  Layers,
  ListVideo,
  Quote,
  TrendingDown,
  UserPlus,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { platformLabel } from "@/components/ui/platform-icon";
import { InfoPopover } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { SkeletonText } from "@/components/ui/skeleton";
import { formatCompact, formatDateTime, pluralize } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import type { CompetitorReport, CreatorPost, StatBucket } from "@/lib/types";
import { PerformanceChart } from "./performance-chart";
import { PostChips, PostLink, PostList, PostRow, RatioBadge } from "./post-items";
import { ReportSection, SubHeading } from "./report-section";
import {
  audienceLeaders,
  bestBucket,
  chartSeries,
  overperformers,
  postIndex,
  rankPost,
  rankingMedian,
  ratiosAllowed,
  resolvePosts,
  sortPosts,
  underperformers,
} from "./report-utils";

export interface SectionProps {
  report: CompetitorReport;
  /** From `useNow()`. */
  now: number;
  /** Claude's analysis is still running (live preview of the data). */
  pending?: boolean;
}

/** Placeholder of an insight block while Claude works / note when it is unavailable. */
function InsightPlaceholder({ pending, what }: { pending: boolean; what: string }) {
  if (pending) {
    return (
      <div aria-hidden className="rounded-xl border border-dashed border-line-strong p-4">
        <SkeletonText lines={3} />
      </div>
    );
  }
  return (
    <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm leading-relaxed text-muted">
      {what} demande l&apos;analyse de Claude : indisponible pour ce rapport (voir l&apos;encadré en haut de page).
    </p>
  );
}

// ---------------------------------------------------------------------------
// Ce qui surperforme
// ---------------------------------------------------------------------------

export function OverperformersSection({ report, now }: SectionProps) {
  const { items, fallback } = overperformers(report);
  const views = report.stats.rankingMetric === "views";
  return (
    <ReportSection
      id="surperforme"
      tone="hot"
      icon={<Flame />}
      title={fallback ? "Ses meilleures publications" : "Ce qui surperforme"}
      description={
        fallback && !ratiosAllowed(report)
          ? `Comparaison à sa médiane désactivée (règles développeurs de ${platformLabel(report.data.account.platform)}) : voici ses publications les plus vues.`
          : fallback
          ? "Aucune publication ne dépasse 2× sa médiane : ses résultats sont réguliers. Voici ses meilleures."
          : `Publications à au moins 2× sa médiane de ${views ? "vues" : "engagement"} : ce que son audience — et l'algorithme — ont vraiment poussé.`
      }
    >
      <Card className="px-5 py-4 sm:px-6">
        {items.length > 0 ? (
          <PostList label={fallback ? "Meilleures publications" : "Publications qui surperforment"}>
            {items.map((item, index) => (
              <PostRow key={item.post.id} {...item} now={now} rank={index + 1} />
            ))}
          </PostList>
        ) : (
          <p className="py-2 text-sm text-muted">Pas assez de métriques pour classer les publications.</p>
        )}
      </Card>
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Ce qui fait venir des abonnés
// ---------------------------------------------------------------------------

export function FollowersSection({ report, now, pending = false }: SectionProps) {
  const leaders = audienceLeaders(report);
  const index = postIndex(report.data.posts);
  const drivers = report.insights?.followDrivers ?? [];
  const platform = platformLabel(report.data.account.platform);
  const followers = report.data.account.followers;
  const showDrivers = drivers.length > 0 || pending || report.mode === "stats";

  return (
    <ReportSection
      id="abonnes"
      tone="foryou"
      icon={<UserPlus />}
      title="Ce qui fait venir des abonnés"
      description="Une vidéo vue bien au-delà de l'audience du compte a touché des non-abonnés : c'est le meilleur signal public de ce qui fait s'abonner. Ce sont des hypothèses tirées de signaux publics, pas des abonnements mesurés."
      aside={
        <InfoPopover label="Comment lire « × son audience »" title="« × son audience »" align="end" panelClassName="w-80">
          <p className="text-xs leading-relaxed">
            Vues de la publication ÷ abonnés du compte. À ×4, la vidéo a été vue quatre fois plus que le compte n&apos;a
            d&apos;abonnés : elle a forcément touché des non-abonnés, le vivier des futurs abonnés. Aucune plateforme ne
            publie les abonnements gagnés par vidéo pour le compte d&apos;un autre : c&apos;est le meilleur indice
            public disponible.
          </p>
        </InfoPopover>
      }
    >
      <div className={cn("grid gap-4", showDrivers && "xl:grid-cols-2")}>
        <Card className="px-5 py-4 sm:px-6">
          <SubHeading className="mb-3">Vues bien au-delà de ses abonnés</SubHeading>
          {!ratiosAllowed(report) ? (
            <p className="text-sm leading-relaxed text-muted">
              Ratios désactivés pour {platform} (règles développeurs de {platform}) : le rapport vues ÷ abonnés
              n&apos;est pas affiché. Repérez les vidéos les plus vues dans « Ce qui surperforme ».
            </p>
          ) : leaders.length > 0 ? (
            <PostList label="Publications vues au-delà de son audience">
              {leaders.map((item, rank) => (
                <PostRow key={item.post.id} {...item} now={now} rank={rank + 1} />
              ))}
            </PostList>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              {followers !== undefined && report.data.posts.some((post) => post.metrics.views !== undefined)
                ? "Aucune publication analysée n'a fait plus de vues qu'il n'a d'abonnés : ses vues viennent surtout de son audience existante, peu de nouveaux publics touchés."
                : followers === undefined
                ? `${platform} ne fournit pas le nombre d'abonnés de ce compte : le multiplicateur d'audience n'est pas calculable. Fiez-vous à « Ce qui surperforme ».`
                : `${platform} ne fournit pas les vues de ces publications : le multiplicateur d'audience n'est pas calculable.`}
            </p>
          )}
        </Card>

        {showDrivers ? (
          <Card className="px-5 py-4 sm:px-6">
            <SubHeading className="mb-3">Pourquoi on s&apos;abonne — hypothèses de Claude</SubHeading>
            {drivers.length > 0 ? (
              <ol className="space-y-4">
                {drivers.map((driver, rank) => (
                  <li key={rank} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink"
                    >
                      {rank + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-relaxed text-ink">{driver.insight}</p>
                      {driver.evidence ? (
                        <p className="mt-1 text-sm leading-relaxed text-muted">{driver.evidence}</p>
                      ) : null}
                      <PostChips posts={resolvePosts(driver.postIds, index)} className="mt-2" />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <InsightPlaceholder pending={pending} what="Relier ces publications aux raisons de s'abonner" />
            )}
          </Card>
        ) : null}
      </div>
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Performance chart
// ---------------------------------------------------------------------------

export function PerformanceSection({ report }: SectionProps) {
  const series = chartSeries(report);
  const views = series.metric === "views";
  return (
    <ReportSection
      id="performance"
      icon={<BarChart3 />}
      title="Publication par publication"
      description={
        views
          ? "Vues de chaque publication analysée. En corail, celles qui font au moins 2× sa médiane."
          : `${platformLabel(report.data.account.platform)} ne donne pas les vues : engagement (j'aime + 3 × commentaires + 5 × partages) de chaque publication. En corail, au moins 2× sa médiane.`
      }
    >
      <Card className="px-5 py-5 sm:px-6">
        <PerformanceChart series={series} tableId="publications" />
      </Card>
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Ce qui marche / ce qui tombe à plat
// ---------------------------------------------------------------------------

function InsightList({
  items,
  index,
  icon,
  label,
}: {
  items: { insight: string; evidence: string; postIds: string[] }[];
  index: Map<string, CreatorPost>;
  icon: ReactNode;
  label: string;
}) {
  return (
    <ul aria-label={label} className="space-y-4">
      {items.map((item, rank) => (
        <li key={rank} className="flex gap-3">
          <span aria-hidden className="mt-0.5 shrink-0 [&_svg]:size-[18px]">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-relaxed text-ink">{item.insight}</p>
            {item.evidence ? <p className="mt-1 text-sm leading-relaxed text-muted">{item.evidence}</p> : null}
            <PostChips posts={resolvePosts(item.postIds, index)} className="mt-2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function WorksFlopsSection({ report, now, pending = false }: SectionProps) {
  const index = postIndex(report.data.posts);
  const insights = report.insights;
  const bottom = underperformers(report);
  return (
    <ReportSection
      id="marche"
      icon={<CircleCheck />}
      title="Ce qui marche, ce qui tombe à plat"
      description="Chaque constat renvoie aux publications qui le prouvent."
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="px-5 py-4 sm:px-6">
          <SubHeading className="mb-3">Ce qui marche</SubHeading>
          {insights?.whatWorks.length ? (
            <InsightList
              items={insights.whatWorks}
              index={index}
              label="Ce qui marche"
              icon={<CircleCheck className="text-success" />}
            />
          ) : (
            <InsightPlaceholder pending={pending} what="Expliquer ce qui marche" />
          )}
        </Card>
        <Card className="px-5 py-4 sm:px-6">
          <SubHeading className="mb-3">Ce qui tombe à plat</SubHeading>
          {insights?.whatFlops.length ? (
            <InsightList
              items={insights.whatFlops}
              index={index}
              label="Ce qui tombe à plat"
              icon={<TrendingDown className="text-warning" />}
            />
          ) : insights ? null : (
            <InsightPlaceholder pending={pending} what="Expliquer ce qui ne prend pas" />
          )}
          {bottom.length > 0 ? (
            <div className={cn(insights?.whatFlops.length || !insights ? "mt-5 border-t border-line pt-4" : null)}>
              <p className="mb-2 text-xs font-medium text-muted">
                {bottom.length > 1 ? `Ses ${bottom.length} publications les moins performantes` : "Sa publication la moins performante"}
              </p>
              <PostList label="Publications les moins performantes">
                {bottom.map((item) => (
                  <PostRow key={item.post.id} {...item} now={now} audienceMin={1} />
                ))}
              </PostList>
            </div>
          ) : null}
        </Card>
      </div>
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function HooksSection({ report, pending = false }: SectionProps) {
  const index = postIndex(report.data.posts);
  const medianValue = rankingMedian(report);
  const patterns = report.insights?.hookPatterns ?? [];
  return (
    <ReportSection
      id="hooks"
      icon={<Zap />}
      title="Hooks qui marchent"
      description="Ses mécaniques d'accroche, avec ses phrases exactes. À comprendre, pas à recopier."
    >
      {patterns.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {patterns.map((pattern, rank) => (
            <Card key={rank} as="article" className="px-5 py-4 sm:px-6">
              <h3 className="text-[0.9375rem] font-semibold leading-snug text-ink">{pattern.pattern}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{pattern.whyItWorks}</p>
              {pattern.examples.length > 0 ? (
                <ul className="mt-3 space-y-2.5" aria-label="Exemples tirés de ses publications">
                  {pattern.examples.map((example, exampleIndex) => {
                    const post = index.get(example.postId);
                    return (
                      <li key={exampleIndex} className="rounded-xl bg-surface-2/70 px-3.5 py-2.5">
                        <blockquote className="flex gap-2 text-sm leading-relaxed text-ink">
                          <Quote aria-hidden className="mt-0.5 size-3.5 shrink-0 text-faint" />
                          <span>« {example.quote} »</span>
                        </blockquote>
                        {post ? (
                          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-5.5 text-xs text-muted">
                            <RatioBadge ratio={rankPost(post, report, medianValue).ratio} />
                            <PostLink post={post} className="min-w-0 truncate text-muted">
                              {post.title}
                            </PostLink>
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <InsightPlaceholder pending={pending} what="L'analyse des hooks" />
      )}
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Piliers & formats
// ---------------------------------------------------------------------------

export function PillarsSection({ report, pending = false }: SectionProps) {
  const index = postIndex(report.data.posts);
  const insights = report.insights;
  return (
    <ReportSection
      id="piliers"
      icon={<Layers />}
      title="Piliers de contenu et formats"
      description="Les thèmes qu'il traite, leur poids dans sa production et comment ils performent."
    >
      {insights && (insights.pillars.length > 0 || insights.formats.length > 0) ? (
        <div className="space-y-4">
          {insights.pillars.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {insights.pillars.map((pillar, rank) => (
                <Card key={rank} as="article" className="flex flex-col px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-[0.9375rem] font-semibold leading-snug text-ink">{pillar.name}</h3>
                    {pillar.share ? (
                      <Badge size="sm" tone="neutral">
                        {pillar.share}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{pillar.description}</p>
                  {pillar.performance ? (
                    <p className="mt-2 text-sm leading-relaxed text-ink/85">
                      <span className="font-medium text-ink">Performance : </span>
                      {pillar.performance}
                    </p>
                  ) : null}
                  <PostChips posts={resolvePosts(pillar.postIds, index)} className="mt-3" />
                </Card>
              ))}
            </div>
          ) : null}
          {insights.formats.length > 0 ? (
            <Card className="px-5 py-4 sm:px-6">
              <SubHeading className="mb-3">Formats</SubHeading>
              <ul className="divide-y divide-line">
                {insights.formats.map((format, rank) => (
                  <li key={rank} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-ink">{format.name}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{format.description}</p>
                    <PostChips posts={resolvePosts(format.postIds, index)} className="mt-2" />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : (
        <InsightPlaceholder pending={pending} what="L'identification des piliers et des formats" />
      )}
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Rythme (buckets)
// ---------------------------------------------------------------------------

function BucketTable({
  title,
  labelHeader,
  buckets,
  unit,
}: {
  title: string;
  labelHeader: string;
  buckets: StatBucket[];
  unit: string;
}) {
  const rows = buckets.filter((bucket) => bucket.posts > 0);
  const best = bestBucket(rows);
  // Scale on the buckets with ≥ 2 posts: one viral post must not flatten the others.
  const robust = rows.filter((bucket) => bucket.posts >= 2);
  const max = (robust.length > 0 ? robust : rows).reduce((value, bucket) => Math.max(value, bucket.median ?? 0), 0);
  return (
    <Card className="min-w-0 px-5 py-4">
      <table className="w-full text-sm">
        <caption className="mb-2 text-left text-xs font-semibold uppercase tracking-[0.06em] text-muted">{title}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{labelHeader}</th>
            <th scope="col">Publications</th>
            <th scope="col">Médiane ({unit})</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-2 text-muted">
                Donnée indisponible.
              </td>
            </tr>
          ) : (
            rows.map((bucket) => {
              const isBest = best?.label === bucket.label;
              const thin = bucket.posts < 2;
              return (
                <tr key={bucket.label} className="border-t border-line first:border-t-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      {bucket.label}
                      {isBest ? (
                        <Badge size="sm" tone="accent">
                          Meilleur
                        </Badge>
                      ) : null}
                    </span>
                  </th>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right text-xs tabular-nums text-muted">
                    {bucket.posts} publ.
                  </td>
                  <td className="w-[45%] py-1.5">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <span
                          className={cn("block h-full rounded-full", thin ? "bg-faint/50" : "bg-accent")}
                          style={{ width: `${max > 0 ? Math.min(100, ((bucket.median ?? 0) / max) * 100) : 0}%` }}
                        />
                      </span>
                      <span
                        className={cn("w-12 shrink-0 text-right text-xs font-medium tabular-nums", thin ? "text-muted" : "text-ink")}
                        title={thin ? "Une seule publication : peu fiable" : undefined}
                      >
                        {formatCompact(bucket.median)}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </Card>
  );
}

export function RhythmSection({ report }: SectionProps) {
  const { stats } = report;
  const unit = stats.rankingMetric === "views" ? "vues" : "engagement";
  return (
    <ReportSection
      id="rythme"
      icon={<CalendarClock />}
      title="Quand et sous quelle forme"
      description={`Nombre de publications et médiane (${unit}) par jour, heure (fuseau du marché), durée et hashtag. Sur ${stats.postCount} publications : à lire comme des tendances, pas comme des règles (en gris, une seule publication).`}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <BucketTable title="Jour de publication" labelHeader="Jour" buckets={stats.weekdays} unit={unit} />
        <BucketTable title="Heure de publication" labelHeader="Heure" buckets={stats.hours} unit={unit} />
        {stats.durations.some((bucket) => bucket.posts > 0) ? (
          <BucketTable title="Durée des vidéos" labelHeader="Durée" buckets={stats.durations} unit={unit} />
        ) : null}
        {stats.hashtags.length > 0 ? (
          <BucketTable title="Hashtags les plus utilisés" labelHeader="Hashtag" buckets={stats.hashtags.map((tag) => ({ ...tag, label: tag.label.startsWith("#") ? tag.label : `#${tag.label}` }))} unit={unit} />
        ) : null}
      </div>
      {report.insights?.ctaAndEngagement ? (
        <Card className="mt-4 px-5 py-4 sm:px-6">
          <SubHeading className="mb-2">Appels à l&apos;action et engagement</SubHeading>
          <p className="text-sm leading-relaxed text-ink/85">{report.insights.ctaAndEngagement}</p>
        </Card>
      ) : null}
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Publications analysées (table twin of the chart)
// ---------------------------------------------------------------------------

const INITIAL_POSTS = 10;

export function PostsSection({ report, now }: SectionProps) {
  const [sort, setSort] = useState<"recent" | "performance">("recent");
  const [expanded, setExpanded] = useState(false);
  const metric = report.stats.rankingMetric;
  const medianValue = rankingMedian(report);
  const posts = sortPosts(report.data.posts, sort, metric);
  const shown = expanded ? posts : posts.slice(0, INITIAL_POSTS);

  return (
    <ReportSection
      id="publications"
      icon={<ListVideo />}
      title="Publications analysées"
      description="Toutes les publications réelles sur lesquelles reposent les chiffres et l'analyse, avec leurs métriques."
      aside={
        <Segmented
          size="sm"
          aria-label="Trier les publications"
          value={sort}
          onValueChange={setSort}
          options={[
            { value: "recent", label: "Récentes" },
            { value: "performance", label: "Performantes" },
          ]}
        />
      }
    >
      <Card className="px-5 py-4 sm:px-6">
        <PostList label={`Publications analysées (${posts.length})`}>
          {shown.map((post) => (
            <PostRow key={post.id} {...rankPost(post, report, medianValue)} now={now} audienceMin={1} />
          ))}
        </PostList>
        {posts.length > INITIAL_POSTS ? (
          <div className="mt-4 border-t border-line pt-3">
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
              {expanded ? "Afficher moins" : `Afficher les ${posts.length} publications`}
            </Button>
          </div>
        ) : null}
      </Card>
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// Sources & méthode
// ---------------------------------------------------------------------------

export function MethodSection({ report }: SectionProps) {
  const messages = [...report.data.warnings, ...report.notes];
  return (
    <ReportSection
      id="methode"
      icon={<Info />}
      title="Sources et méthode"
      description="D'où viennent les données et comment le rapport est construit."
    >
      <Card className="space-y-4 px-5 py-4 text-sm leading-relaxed text-muted sm:px-6">
        <ul className="space-y-1.5">
          <li>
            <span className="font-medium text-ink">Données : </span>
            {report.data.source}, récupérées le {formatDateTime(report.data.fetchedAt)} —{" "}
            {report.stats.postCount} {pluralize(report.stats.postCount, "publication publique", "publications publiques")}{" "}
            du compte, liens vers les originaux.
          </li>
          <li>
            <span className="font-medium text-ink">Chiffres : </span>
            {ratiosAllowed(report)
              ? "médianes, ratios et multiplicateurs calculés dans le code à partir de ces publications, sans IA."
              : `médianes calculées dans le code à partir de ces publications, sans IA. Ratios (vues ÷ abonnés, engagement) désactivés : les règles développeurs de ${platformLabel(report.data.account.platform)} les interdisent pour les chaînes des autres.`}
          </li>
          <li>
            <span className="font-medium text-ink">Analyse : </span>
            {report.mode === "ai"
              ? `Claude${report.model ? ` (${report.model})` : ""} interprète ces données ; chaque constat cite des publications réelles et les citations sont vérifiées mot pour mot.`
              : "aucune — rapport en mode statistiques."}
          </li>
        </ul>
        {messages.length > 0 ? (
          <div>
            <SubHeading className="mb-2">Limites de ces données</SubHeading>
            <ul className="space-y-1.5">
              {messages.map((message, rank) => (
                <li key={rank} className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
                  {message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </ReportSection>
  );
}

/** Stats-only report: why there is no qualitative analysis, and how to get it. */
export function StatsOnlyAlert({ report, aiConfigured }: { report: CompetitorReport; aiConfigured: boolean | null }) {
  return (
    <Alert
      tone="warning"
      role="none"
      title="Analyse qualitative indisponible"
      action={
        aiConfigured === false ? (
          <Link href="/reglages#sources" className="text-sm font-medium text-accent-ink underline-offset-2 hover:underline">
            Configurer Claude dans Réglages
          </Link>
        ) : null
      }
    >
      {aiConfigured === false
        ? "Claude n'est pas configuré sur ce serveur (ANTHROPIC_API_KEY) : voici les publications et les statistiques réelles, sans interprétation, angles morts ni idées de vidéos."
        : "Claude n'a pas pu analyser ce compte : voici les publications et les statistiques réelles, sans interprétation. Relancez l'analyse pour obtenir l'analyse complète."}
      {/* The server's reason (Claude error, timeout…); redundant when Claude simply isn't configured. */}
      {aiConfigured !== false && report.notes.length > 0 ? (
        <span className="mt-1 block text-xs">{report.notes[0]}</span>
      ) : null}
    </Alert>
  );
}
