"use client";

import {
  ArrowDown,
  BadgeCheck,
  BarChart3,
  CalendarRange,
  Database,
  Eye,
  Heart,
  Megaphone,
  MessageCircleQuestion,
  Percent,
  RefreshCw,
  Repeat2,
  Send,
  Sparkles,
  Trash2,
  Type,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import { Spinner } from "@/components/ui/spinner";
import { Stat } from "@/components/ui/stat";
import { safeHref } from "@/components/studio/studio-utils";
import { formatCompact, formatCount, formatDateTime, formatRelative, pluralize } from "@/lib/client/format";
import type { CompetitorReport } from "@/lib/types";
import { formatDecimal, formatPct } from "./report-utils";

export interface ReportHeaderProps {
  report: CompetitorReport;
  now: number;
  /** Claude's analysis is still running (live preview). */
  pending?: boolean;
  onReanalyse?: () => void;
  onDelete?: () => void;
  /** An analysis is running (re-analyse disabled). */
  busy?: boolean;
  /** h1 on the report page, h2 inside another page (live preview). */
  titleAs?: "h1" | "h2";
}

/**
 * Identity of the analysed account (no avatar: CDN pictures expire) and of
 * the report: platform, name, @handle link, audience, sample, source, date,
 * mode, the user's question, and the actions.
 */
export function ReportHeader({
  report,
  now,
  pending = false,
  onReanalyse,
  onDelete,
  busy = false,
  titleAs = "h1",
}: ReportHeaderProps) {
  const Title = titleAs;
  const { account } = report.data;
  const { stats } = report;
  const profileHref = safeHref(account.url);
  const name = account.displayName?.trim() || `@${account.handle}`;

  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <PlatformIcon platform={account.platform} size="lg" className="mt-1" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-ink">
              Analyse concurrentielle · {platformLabel(account.platform)}
            </p>
            <Title
              className={
                titleAs === "h1"
                  ? "mt-1 flex flex-wrap items-center gap-2 text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-display"
                  : "mt-1 flex flex-wrap items-center gap-2 text-title font-semibold text-ink"
              }
            >
              <span className="min-w-0 break-words">{name}</span>
              {account.verified ? (
                <BadgeCheck aria-label="Compte certifié" role="img" className="size-6 shrink-0 text-accent" />
              ) : null}
            </Title>
            <p className="mt-1 text-sm text-muted">
              {profileHref ? (
                <a
                  href={profileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent-ink underline-offset-2 hover:underline"
                >
                  @{account.handle}
                  <span className="sr-only"> — profil {platformLabel(account.platform)} (nouvel onglet)</span>
                </a>
              ) : (
                <span className="font-medium text-ink">@{account.handle}</span>
              )}
              {account.followers !== undefined ? (
                <>
                  {" "}
                  · <span className="font-semibold text-ink">{formatCompact(account.followers)}</span>{" "}
                  {pluralize(account.followers, "abonné", "abonnés")}
                </>
              ) : null}
              {account.totalPosts !== undefined ? (
                <> · {formatCount(account.totalPosts, "publication", "publications")} au total</>
              ) : null}
            </p>
          </div>
        </div>
        {onReanalyse || onDelete ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {onReanalyse ? (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RefreshCw aria-hidden className="size-4" />}
                onClick={onReanalyse}
                disabled={busy}
              >
                Ré-analyser
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
        {pending ? (
          <Badge tone="accent" icon={<Spinner size="xs" />}>
            Analyse de Claude en cours…
          </Badge>
        ) : report.mode === "ai" ? (
          <Badge tone="accent" icon={<Sparkles />}>
            Analysé par Claude{report.model ? ` · ${report.model}` : ""}
          </Badge>
        ) : (
          <Badge tone="warning" icon={<BarChart3 />}>
            Statistiques seules
          </Badge>
        )}
        <Badge tone="neutral" icon={<CalendarRange />}>
          {stats.postCount} {pluralize(stats.postCount, "publication analysée", "publications analysées")}
          {stats.windowDays > 0 ? ` sur ${stats.windowDays} j` : ""}
        </Badge>
        <Badge tone="neutral" icon={<Database />} title={report.data.source}>
          {report.data.source}
        </Badge>
        <span className="text-xs text-muted">
          Données du{" "}
          <time dateTime={report.data.fetchedAt} title={formatDateTime(report.data.fetchedAt)}>
            {formatDateTime(report.data.fetchedAt)}
          </time>{" "}
          ({formatRelative(report.data.fetchedAt, now)})
        </span>
      </div>

      {account.bio?.trim() || report.focus?.trim() ? (
        <div className="grid gap-3 md:grid-cols-2">
          {account.bio?.trim() ? (
            <p className="rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 text-sm leading-relaxed text-muted">
              <span className="font-medium text-ink">Bio : </span>
              <span className="line-clamp-3 whitespace-pre-line">{account.bio.trim()}</span>
            </p>
          ) : null}
          {report.focus?.trim() ? (
            <p className="rounded-xl border border-accent/25 bg-accent-soft px-3.5 py-2.5 text-sm leading-relaxed text-ink/85">
              <span className="font-medium text-ink">Votre question : </span>« {report.focus.trim()} »
            </p>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

/**
 * Headline numbers, all computed in code from the real posts: publishing
 * rhythm, median views (or likes), engagement, reach vs followers and
 * shares + saves per view (when the source gives them).
 */
export function ReportKpis({ report }: { report: CompetitorReport }) {
  const { stats } = report;
  const platform = platformLabel(report.data.account.platform);
  const followers = report.data.account.followers;
  const tiles: ReactNode[] = [
    <Stat
      key="rhythm"
      icon={<CalendarRange />}
      label="Publications / semaine"
      value={formatDecimal(stats.postsPerWeek)}
      hint={`${stats.postCount} publications sur ${stats.windowDays} j`}
    />,
    stats.medianViews !== undefined ? (
      <Stat
        key="views"
        icon={<Eye />}
        label="Vues médianes"
        value={formatCompact(stats.medianViews)}
        hint={
          stats.medianLikes !== undefined
            ? `${formatCompact(stats.medianLikes)} j'aime · ${formatCompact(stats.medianComments)} comm. (médianes)`
            : "par publication"
        }
      />
    ) : (
      <Stat
        key="likes"
        icon={<Heart />}
        label="J'aime médians"
        value={formatCompact(stats.medianLikes)}
        hint={
          stats.medianComments !== undefined
            ? `${formatCompact(stats.medianComments)} commentaires médians · vues non fournies par ${platform}`
            : `Vues non fournies par ${platform}`
        }
      />
    ),
    <Stat
      key="engagement"
      icon={<Percent />}
      label="Taux d'engagement"
      value={formatPct(stats.engagementRate)}
      hint={stats.engagementRate !== undefined ? "(j'aime + comm. + partages) ÷ vues, médiane" : "Vues indisponibles : non calculable"}
    />,
    <Stat
      key="reach"
      icon={<UsersRound />}
      label="Portée / abonnés"
      value={formatPct(stats.reachRate)}
      hint={
        stats.reachRate !== undefined && followers !== undefined
          ? `Vues médianes ÷ ${formatCompact(followers)} abonnés`
          : `Abonnés ou vues non fournis par ${platform}`
      }
      tone={stats.reachRate !== undefined && stats.reachRate >= 100 ? "accent" : "neutral"}
    />,
  ];
  if (stats.shareSaveRate !== undefined) {
    tiles.push(
      <Stat
        key="share-save"
        icon={<Send />}
        label="Partages + enreg. / vue"
        value={formatPct(stats.shareSaveRate)}
        hint="Envois et sauvegardes, médiane : ce que les algorithmes récompensent"
      />,
    );
  }
  return (
    <div
      className={
        tiles.length > 4 ? "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" : "grid grid-cols-2 gap-3 lg:grid-cols-4"
      }
    >
      {tiles}
    </div>
  );
}

/** Deterministic writing habits ("42 % des légendes avec un appel à l'action"…). */
export function SignatureFacts({ report }: { report: CompetitorReport }) {
  const { stats } = report;
  const facts: { icon: ReactNode; text: ReactNode }[] = [
    {
      icon: <Megaphone />,
      text: (
        <>
          <strong className="font-semibold text-ink">{formatPct(stats.ctaShare)}</strong> des légendes avec un appel à
          l&apos;action
        </>
      ),
    },
    {
      icon: <MessageCircleQuestion />,
      text: (
        <>
          <strong className="font-semibold text-ink">{formatPct(stats.questionShare)}</strong> des titres posent une
          question
        </>
      ),
    },
    {
      icon: <Repeat2 />,
      text: (
        <>
          <strong className="font-semibold text-ink">{formatPct(stats.seriesShare)}</strong> en séries (partie 2,
          épisode…)
        </>
      ),
    },
    {
      icon: <Type />,
      text: (
        <>
          Légende médiane : <strong className="font-semibold text-ink">{stats.medianCaptionLength}</strong> caractères
        </>
      ),
    },
  ];
  return (
    <ul aria-label="Habitudes d'écriture" className="flex flex-wrap gap-2">
      {facts.map((fact, index) => (
        <li
          key={index}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted"
        >
          <span aria-hidden className="text-faint [&_svg]:size-3.5">
            {fact.icon}
          </span>
          <span>{fact.text}</span>
        </li>
      ))}
    </ul>
  );
}

export interface ReportSummaryProps {
  report: CompetitorReport;
  pending?: boolean;
}

/**
 * "En bref": Claude's positioning / audience / tone (when available), the
 * KPI row, writing habits, and the two things to remember for the user,
 * linking to the ideas.
 */
export function ReportSummary({ report, pending = false }: ReportSummaryProps) {
  const { insights } = report;
  const takeaways = [
    ...(insights?.followDrivers ?? []).slice(0, 1).map((driver) => ({
      label: "Ce qui fait s'abonner",
      text: driver.insight,
    })),
    ...(insights?.differentiation ?? []).slice(0, 2).map((item) => ({
      label: "Pour te différencier",
      text: item.recommendation,
    })),
  ].slice(0, 3);

  return (
    <Card className="p-5 sm:p-6">
      {insights ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div>
            <p className="text-[0.9375rem] font-medium leading-relaxed text-ink">{insights.positioning}</p>
            <dl className="mt-3 grid gap-2 text-sm leading-relaxed sm:grid-cols-2">
              {insights.audience ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Audience</dt>
                  <dd className="mt-0.5 text-ink/85">{insights.audience}</dd>
                </div>
              ) : null}
              {insights.tone ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Ton</dt>
                  <dd className="mt-0.5 text-ink/85">{insights.tone}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          {takeaways.length > 0 ? (
            <div className="rounded-xl border border-accent/25 bg-accent-soft/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-accent-ink">À retenir pour toi</p>
              <ul className="mt-2 space-y-2">
                {takeaways.map((item, index) => (
                  <li key={index} className="text-sm leading-relaxed text-ink">
                    <span className="font-semibold">{item.label} : </span>
                    {item.text}
                  </li>
                ))}
              </ul>
              {insights.ideas.length > 0 ? (
                <a
                  href="#idees"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-ink underline-offset-2 hover:underline"
                >
                  Voir les {insights.ideas.length} idées de vidéos pour toi
                  <ArrowDown aria-hidden className="size-4" />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : pending ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" className="text-accent" />
          Claude lit les publications : positionnement, piliers, hooks et idées arrivent dans un instant. Les chiffres
          ci-dessous sont déjà définitifs.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted">
          Chiffres calculés à partir des {report.stats.postCount} dernières publications réelles du compte.
        </p>
      )}

      <div className="mt-5">
        <ReportKpis report={report} />
      </div>
      <div className="mt-4">
        <SignatureFacts report={report} />
      </div>
    </Card>
  );
}
