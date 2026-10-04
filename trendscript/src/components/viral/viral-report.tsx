"use client";

import {
  ArrowDown,
  BarChart3,
  CalendarRange,
  Eye,
  Flame,
  Info,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ReportNav, ReportSection, SubHeading, type ReportNavItem } from "@/components/competitors/report-section";
import { formatMultiplier } from "@/components/competitors/report-utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import { InfoPopover } from "@/components/ui/popover";
import { Stat } from "@/components/ui/stat";
import { formatCompact, formatDateTime, formatRelative, pluralize } from "@/lib/client/format";
import { isViralMetricsStripped, isViralRetentionExpired } from "@/lib/client/storage";
import { cn } from "@/lib/cn";
import type { ViralPlatformSummary, ViralReport } from "@/lib/types";
import {
  AvoidSection,
  FollowDriversSection,
  FormatsSection,
  HooksSection,
  RecipesSection,
  TopicsSection,
  ViralIdeasSection,
} from "./viral-patterns";
import { VideosSection } from "./viral-videos";
import {
  TIER_META,
  VIRAL_PLATFORM_ORDER,
  isExpiredPost,
  keywordsLabel,
  ratiosAllowedFor,
  tierCounts,
  viralReportTitle,
} from "./viral-utils";

// ---------------------------------------------------------------------------
// How to read "× son audience"
// ---------------------------------------------------------------------------

/**
 * The honesty note of the lab, short and always visible: what the
 * multiplier measures, and that follows per video are not public.
 */
export function AudienceExplainer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[0.8125rem] leading-relaxed text-muted",
        className,
      )}
    >
      <UsersRound aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold text-ink">« ×10 son audience »</span> = 10 fois plus de vues que son créateur
        n&apos;a d&apos;abonnés : la vidéo a été poussée à des inconnus, là où se gagnent les abonnés. Les abonnements
        gagnés par vidéo ne sont publiés nulle part : c&apos;est le meilleur signal public.
      </p>
      <InfoPopover label="Comment sont classées les vidéos" title="Comment sont classées les vidéos" align="end" panelClassName="w-80">
        <div className="space-y-2 text-xs leading-relaxed">
          <p>
            <span className="font-semibold">Explose</span> : {TIER_META.explose.rule}.{" "}
            <span className="font-semibold">Cartonne</span> : {TIER_META.cartonne.rule}.{" "}
            <span className="font-semibold">Bon</span> : {TIER_META.bon.rule}.
          </p>
          <p>
            Les abonnés sont comptés à 1 000 minimum, pour qu&apos;un tout petit compte ne fasse pas exploser le ratio. Ce
            sont des seuils de départ, à affiner sur les données françaises.
          </p>
          <p>
            YouTube : sans l&apos;accord « métriques dérivées » de YouTube (YT_DERIVED_METRICS_APPROVED), aucun ratio
            n&apos;est calculé ; les vidéos sont classées sur leurs vues brutes (10 % les plus vues = « cartonne »).
          </p>
        </div>
      </InfoPopover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export interface ViralReportHeaderProps {
  report: ViralReport;
  now: number;
  onRerun?: () => void;
  onDelete?: () => void;
  busy?: boolean;
}

/** Niche, keywords, platforms, window, mode, data date and the actions. */
export function ViralReportHeader({ report, now, onRerun, onDelete, busy = false }: ViralReportHeaderProps) {
  const { request } = report;
  const title = viralReportTitle(report);
  const keywords = keywordsLabel(request.keywords);
  const platforms = VIRAL_PLATFORM_ORDER.filter((platform) => request.platforms.includes(platform));
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-hot-ink">
            Ce qui cartonne · {request.periodDays} derniers jours
          </p>
          <h1 className="mt-1 break-words text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-display">
            {title}
          </h1>
          {keywords && keywords !== title ? (
            <p className="mt-1 text-sm text-muted">
              Mots-clés : <span className="font-medium text-ink">{keywords}</span>
            </p>
          ) : null}
        </div>
        {onRerun || onDelete ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {onRerun ? (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RefreshCw aria-hidden className="size-4" />}
                onClick={onRerun}
                disabled={busy}
              >
                Relancer
              </Button>
            ) : null}
            {onDelete ? (
              <Button size="sm" variant="ghost" leftIcon={<Trash2 aria-hidden className="size-4" />} onClick={onDelete}>
                Supprimer
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {report.mode === "ai" ? (
          <Badge tone="accent" icon={<Sparkles />}>
            Analysé par Claude{report.model ? ` · ${report.model}` : ""}
          </Badge>
        ) : (
          <Badge tone="warning" icon={<BarChart3 />}>
            Statistiques seules
          </Badge>
        )}
        <span className="inline-flex items-center gap-1" role="img" aria-label={`Plateformes : ${platforms.map(platformLabel).join(", ")}`}>
          {platforms.map((platform) => (
            <PlatformIcon key={platform} platform={platform} size="sm" decorative />
          ))}
        </span>
        <Badge tone="neutral" icon={<CalendarRange />}>
          {report.posts.length} {pluralize(report.posts.length, "vidéo analysée", "vidéos analysées")}
        </Badge>
        <span className="text-xs text-muted">
          Données du{" "}
          <time dateTime={report.createdAt} title={formatDateTime(report.createdAt)}>
            {formatDateTime(report.createdAt)}
          </time>{" "}
          ({formatRelative(report.createdAt, now)})
        </span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// En bref
// ---------------------------------------------------------------------------

function PlatformSummaryCard({ summary, stripped }: { summary: ViralPlatformSummary; stripped: boolean }) {
  const label = platformLabel(summary.platform);
  return (
    <li className="flex min-w-0 gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <PlatformIcon platform={summary.platform} size="md" decorative className="mt-0.5" />
      <div className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {summary.error ? (
          <p className="mt-0.5 text-danger-ink">{summary.error}</p>
        ) : summary.count === 0 ? (
          <p className="mt-0.5">Aucune vidéo récupérée{summary.source ? ` · ${summary.source}` : ""}.</p>
        ) : (
          <>
            <p className="mt-0.5">
              <span className="font-medium tabular-nums text-ink">{summary.count}</span>{" "}
              {pluralize(summary.count, "vidéo", "vidéos")} ·{" "}
              <span className="tabular-nums">
                {summary.withFollowers}/{summary.count}
              </span>{" "}
              avec abonnés connus
            </p>
            {stripped && summary.platform === "youtube" ? (
              <p>Chiffres effacés après 30 jours (règles YouTube).</p>
            ) : (
              <p>
                {summary.medianViews !== undefined ? `Médiane ${formatCompact(summary.medianViews)} vues` : "Vues médianes inconnues"}
                {" · "}
                {!summary.ratiosAllowed ? (
                  <span className="font-medium text-ink">ratios désactivés (règles {label})</span>
                ) : summary.medianMultiplier !== undefined ? (
                  <>
                    médiane <span className="font-medium tabular-nums text-ink">{formatMultiplier(summary.medianMultiplier)}</span> son
                    audience
                  </>
                ) : (
                  "multiplicateur non calculable"
                )}
              </p>
            )}
            <p className="truncate" title={summary.source}>
              {summary.source}
            </p>
          </>
        )}
        {summary.warning ? <p className="mt-1 text-warning-ink">{summary.warning}</p> : null}
      </div>
    </li>
  );
}

/**
 * "En bref": Claude's summary and what to remember (best recipe, link to the
 * ideas), the tier counters and one card per platform (what was collected,
 * with which source, median multiplier or "ratios désactivés").
 */
export function ViralSummary({ report }: { report: ViralReport }) {
  const counts = tierCounts(report.posts);
  // Videos whose × audience can be measured: author's followers known and ratios allowed on the platform.
  const measurable = report.posts.filter(
    (post) => post.author.followers !== undefined && ratiosAllowedFor(report, post.platform) && !isExpiredPost(report, post),
  ).length;
  const patterns = report.patterns;
  const recipe = patterns?.recipes[0];
  const stripped = isViralMetricsStripped(report);
  const summaries = VIRAL_PLATFORM_ORDER.map((platform) => report.platforms.find((item) => item.platform === platform)).filter(
    (item): item is ViralPlatformSummary => item !== undefined,
  );

  return (
    <Card className="p-5 sm:p-6">
      {patterns ? (
        <div className={cn("grid grid-cols-1 gap-5", recipe && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
          <p className="whitespace-pre-line text-[0.9375rem] font-medium leading-relaxed text-ink">{patterns.summary}</p>
          {recipe ? (
            <div className="rounded-xl border border-accent/25 bg-accent-soft/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-accent-ink">À retenir pour vous</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">
                <span className="font-semibold">Recette n° 1 : </span>
                {recipe.name}
              </p>
              {recipe.followLever ? (
                <p className="mt-1 text-sm leading-relaxed text-ink/85">
                  <span className="font-semibold text-ink">Pourquoi on s&apos;abonne : </span>
                  {recipe.followLever}
                </p>
              ) : null}
              {patterns.ideas.length > 0 ? (
                <a
                  href="#idees"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-ink underline-offset-2 hover:underline"
                >
                  {patterns.ideas.length > 1 ? `Voir les ${patterns.ideas.length} idées pour vous` : "Voir l'idée pour vous"}
                  <ArrowDown aria-hidden className="size-4" />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted">
          {report.posts.length} vidéos réelles de la niche, classées par le nombre de fois où elles ont dépassé
          l&apos;audience de leur créateur. Chiffres calculés dans le code, sans IA.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          icon={<Flame />}
          label="Explosent"
          value={counts.explose}
          tone={counts.explose > 0 ? "hot" : "neutral"}
          hint="×10 leur audience ou plus"
        />
        <Stat
          icon={<TrendingUp />}
          label="Cartonnent"
          value={counts.cartonne}
          tone={counts.cartonne > 0 ? "accent" : "neutral"}
          hint="×3 leur audience ou plus"
        />
        <Stat
          icon={<Eye />}
          label="Vidéos analysées"
          value={report.posts.length}
          hint={`${report.request.periodDays} derniers jours`}
        />
        <Stat
          icon={<UsersRound />}
          label="× audience mesurable"
          value={
            <>
              {measurable}
              <span className="text-base font-medium text-muted">/{report.posts.length}</span>
            </>
          }
          hint="abonnés de l'auteur connus, ratio autorisé"
        />
      </div>

      {summaries.length > 0 ? (
        <div className="mt-5">
          <SubHeading className="mb-2">Par plateforme</SubHeading>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Résultats par plateforme">
            {summaries.map((summary) => (
              <PlatformSummaryCard key={summary.platform} summary={summary} stripped={stripped} />
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sources et méthode
// ---------------------------------------------------------------------------

export function ViralMethodSection({ report }: { report: ViralReport }) {
  const messages = [
    ...report.platforms.flatMap((summary) => (summary.warning ? [`${platformLabel(summary.platform)} : ${summary.warning}`] : [])),
    ...report.notes,
  ];
  return (
    <ReportSection id="methode" icon={<Info />} title="Sources et méthode" description="D'où viennent les vidéos et comment elles sont classées.">
      <Card className="space-y-4 px-5 py-4 text-sm leading-relaxed text-muted sm:px-6">
        <ul className="space-y-1.5">
          <li>
            <span className="font-medium text-ink">Vidéos : </span>
            {report.platforms.map((summary) => `${platformLabel(summary.platform)} (${summary.source})`).join(", ") || "—"} —
            publications publiques des {report.request.periodDays} derniers jours sur « {keywordsLabel(report.request.keywords)} »,
            liens vers les originaux. Épinglées et partenariats rémunérés exclus.
          </li>
          <li>
            <span className="font-medium text-ink">Classement : </span>
            vues ÷ abonnés de l&apos;auteur (plancher 1 000), comparé aux comptes de même taille quand il y en a assez ;
            vues par jour depuis la publication ; partages + enregistrements ÷ vues quand la plateforme les donne. Calculé dans
            le code, sans IA. Seuils de départ (×3 cartonne, ×10 explose), à affiner.
          </li>
          <li>
            <span className="font-medium text-ink">Abonnés : </span>
            aucune plateforme ne publie les abonnements gagnés par vidéo pour le compte d&apos;un autre : le multiplicateur
            d&apos;audience est le meilleur signal public, et le « levier abonnés » des recettes reste une hypothèse.
          </li>
          <li>
            <span className="font-medium text-ink">Analyse : </span>
            {report.mode === "ai"
              ? `Claude${report.model ? ` (${report.model})` : ""} compare les vidéos qui explosent à celles qui restent dans la norme ; chaque recette cite des vidéos réelles et les citations sont vérifiées mot pour mot.`
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

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function StatsOnlyAlert({ report, aiConfigured }: { report: ViralReport; aiConfigured: boolean | null }) {
  return (
    <Alert
      tone="warning"
      role="none"
      title="Recettes et idées indisponibles"
      action={
        aiConfigured === false ? (
          <Link href="/reglages#sources" className="text-sm font-medium text-accent-ink underline-offset-2 hover:underline">
            Configurer Claude dans Réglages
          </Link>
        ) : null
      }
    >
      {aiConfigured === false
        ? "Claude n'est pas configuré sur ce serveur (ANTHROPIC_API_KEY) : voici les vidéos réelles et leurs chiffres, sans recettes, hooks ni idées."
        : "Claude n'a pas pu analyser ces vidéos : voici les vidéos réelles et leurs chiffres. Relancez pour obtenir les recettes et les idées."}
      {aiConfigured !== false && report.notes.length > 0 ? <span className="mt-1 block text-xs">{report.notes[0]}</span> : null}
    </Alert>
  );
}

export interface ViralReportViewProps {
  report: ViralReport;
  /** From `useNow()`. */
  now: number;
  /** null while /api/sources is loading. */
  aiConfigured: boolean | null;
  onRerun?: () => void;
  onDelete?: () => void;
  onWriteIdea?: (ideaIndex: number) => void;
  /** An analysis is running (re-run disabled). */
  busy?: boolean;
  /** Extra message under the header (save failure…). */
  notice?: ReactNode;
}

/**
 * A lab report, scannable top-down: what explodes (summary, counters,
 * platforms) → the videos (scatter + list) → why (recipes with their views
 * and follower levers, hooks, formats, topics, follow drivers, what to
 * avoid) → what to post (ideas → Écrire ce script) → sources and method.
 */
export function ViralReportView({ report, now, aiConfigured, onRerun, onDelete, onWriteIdea, busy, notice }: ViralReportViewProps) {
  const patterns = report.patterns;
  const expired = isViralMetricsStripped(report) || isViralRetentionExpired(report, now);
  const nav: ReportNavItem[] = [
    { id: "synthese", label: "En bref" },
    { id: "videos", label: "Les vidéos qui explosent" },
    ...(patterns
      ? [
          { id: "recettes", label: "Recettes gagnantes" },
          ...(patterns.hookPatterns.length > 0 ? [{ id: "hooks", label: "Hooks" }] : []),
          ...(patterns.formats.length > 0 || patterns.durations.trim() ? [{ id: "formats", label: "Formats et durées" }] : []),
          ...(patterns.topics.length > 0 ? [{ id: "sujets", label: "Sujets porteurs" }] : []),
          ...(patterns.followDrivers.length > 0 ? [{ id: "abonnes", label: "Ce qui fait s'abonner" }] : []),
          ...(patterns.avoid.length > 0 ? [{ id: "eviter", label: "À éviter" }] : []),
          { id: "idees", label: "Idées pour vous" },
        ]
      : []),
    { id: "methode", label: "Sources et méthode" },
  ];

  return (
    <article className="flex flex-col gap-8" aria-label={`Ce qui cartonne : ${viralReportTitle(report)}`}>
      <ViralReportHeader report={report} now={now} onRerun={onRerun} onDelete={onDelete} busy={busy} />
      {notice}
      <AudienceExplainer />
      {expired ? (
        <Alert
          tone="warning"
          role="none"
          title="Chiffres YouTube de plus de 30 jours : relancez"
          action={
            onRerun ? (
              <Button size="sm" leftIcon={<RefreshCw aria-hidden className="size-4" />} onClick={onRerun} disabled={busy}>
                Relancer
              </Button>
            ) : null
          }
        >
          Les règles développeurs de YouTube interdisent de conserver ses statistiques plus de 30 jours : celles des vidéos
          YouTube ont été effacées de ce navigateur. Les autres plateformes et l&apos;analyse restent consultables.
        </Alert>
      ) : null}
      {report.mode === "stats" ? <StatsOnlyAlert report={report} aiConfigured={aiConfigured} /> : null}

      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[12.5rem_minmax(0,1fr)] xl:gap-10">
        <ReportNav items={nav} />
        <div className="flex min-w-0 flex-col gap-12">
          <ReportSection id="synthese" icon={<Sparkles />} tone="foryou" title="En bref">
            <ViralSummary report={report} />
          </ReportSection>
          <VideosSection report={report} now={now} />
          {patterns ? (
            <>
              <RecipesSection report={report} patterns={patterns} />
              <HooksSection report={report} patterns={patterns} />
              <FormatsSection report={report} patterns={patterns} />
              <TopicsSection report={report} patterns={patterns} />
              <FollowDriversSection report={report} patterns={patterns} />
              <AvoidSection patterns={patterns} />
              <ViralIdeasSection report={report} patterns={patterns} onWriteIdea={onWriteIdea} />
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm leading-relaxed text-muted">
              Recettes gagnantes, hooks, formats, sujets porteurs, ce qui fait s&apos;abonner et idées de vidéos demandent
              l&apos;analyse de Claude : indisponible pour ce rapport (voir l&apos;encadré en haut de page).
            </p>
          )}
          <ViralMethodSection report={report} />
        </div>
      </div>
    </article>
  );
}
