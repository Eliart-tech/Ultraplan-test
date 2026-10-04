"use client";

import { Flame, Scale, TrendingUp, UsersRound } from "lucide-react";
import { PostLink } from "@/components/competitors/post-items";
import { formatMultiplier, formatPct, formatRatio, postKindLabel } from "@/components/competitors/report-utils";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import { Tooltip } from "@/components/ui/popover";
import { safeHref } from "@/components/studio/studio-utils";
import { formatCompact, formatCount, formatDateTime, formatRelative, pluralize } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import type { ViralPost, ViralReport } from "@/lib/types";
import { viralAuthorLabel } from "@/lib/viral/labels";
import { TIER_META, isExpiredPost, ratiosAllowedFor } from "./viral-utils";

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export interface ViralBadgeProps {
  post: ViralPost;
  report: ViralReport;
  size?: "sm" | "md";
  className?: string;
}

/**
 * The headline of a video: how far it went beyond its creator's audience
 * ("Explose · ×12 son audience"), in the tier colour — hot for "explose",
 * violet for "cartonne", neutral below. YouTube without derived-metrics
 * approval: rank by raw views only ("Cartonne · top des vues YouTube").
 */
export function MultiplierBadge({ post, report, size = "md", className }: ViralBadgeProps) {
  if (isExpiredPost(report, post)) {
    return (
      <Badge size={size} tone="warning" dot className={className} title="Statistiques YouTube effacées après 30 jours">
        Chiffres expirés
      </Badge>
    );
  }
  const tier = TIER_META[post.tier] ?? TIER_META.normal;
  const strong = post.tier === "explose" || post.tier === "cartonne";
  const tone = post.tier === "explose" ? "hot" : post.tier === "cartonne" ? "accent" : "neutral";
  const variant = post.tier === "explose" ? "solid" : post.tier === "normal" ? "outline" : "soft";
  const icon = post.tier === "explose" ? <Flame /> : post.tier === "cartonne" ? <TrendingUp /> : <UsersRound />;

  if (!ratiosAllowedFor(report, post.platform)) {
    if (!strong) return null;
    return (
      <Tooltip content="Ratios désactivés sur YouTube : classement sur les vues brutes">
        <Badge size={size} tone={tone} variant={variant} icon={icon} className={className}>
          {tier.label} · top des vues {platformLabel(post.platform)}
        </Badge>
      </Tooltip>
    );
  }
  if (!isNumber(post.multiplier)) return null;
  const multiplier = formatMultiplier(post.multiplier);
  return (
    <Tooltip content="Vues ÷ abonnés de l'auteur (plancher 1 000)">
      <Badge size={size} tone={tone} variant={variant} icon={icon} className={className}>
        {strong ? `${tier.label} · ` : null}
        {multiplier} son audience
        <span className="sr-only">
          {" "}
          (vues égales à {multiplier.replace("×", "")} fois les abonnés de son créateur{strong ? "" : ` : ${tier.label.toLowerCase()}`})
        </span>
      </Badge>
    </Tooltip>
  );
}

/** True when the "vs comptes de sa taille" comparison can be shown. */
function hasBand(post: ViralPost, report: ViralReport): post is ViralPost & { vsBand: number } {
  return isNumber(post.vsBand) && ratiosAllowedFor(report, post.platform) && !isExpiredPost(report, post);
}

/** "×2,3 vs comptes 10–100 k" — the multiplier against the median of creators of the same size. */
export function BandBadge({ post, report, size = "md", className }: ViralBadgeProps) {
  if (!hasBand(post, report)) return null;
  return (
    <Tooltip content="× son audience comparé à la médiane des comptes de même taille, même plateforme">
      <Badge size={size} tone={post.vsBand >= 3 ? "accent" : "neutral"} variant="outline" icon={<Scale />} className={className}>
        {formatRatio(post.vsBand)} vs comptes {post.band ?? "de sa taille"}
      </Badge>
    </Tooltip>
  );
}

/** Chip metric for evidence links: "×12" when the ratio is allowed, else the views. */
export function viralChipMetric(report: ViralReport): (post: ViralPost) => string | undefined {
  return (post) => {
    if (isExpiredPost(report, post)) return undefined;
    if (ratiosAllowedFor(report, post.platform) && isNumber(post.multiplier)) return `${formatMultiplier(post.multiplier)} audience`;
    return isNumber(post.metrics.views) ? formatCount(post.metrics.views, "vue", "vues") : undefined;
  };
}

/** "@handle · 12,3 k abonnés (10–100 k)" with the platform glyph; the handle links to the profile. */
export function AuthorLine({ post, report, className }: { post: ViralPost; report: ViralReport; className?: string }) {
  const { author } = post;
  const href = author.url ? safeHref(author.url) : null;
  const handle = viralAuthorLabel(post);
  const expired = isExpiredPost(report, post);
  const followers = !expired && isNumber(author.followers) ? author.followers : undefined;
  return (
    <p className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted", className)}>
      <PlatformIcon platform={post.platform} size="xs" tile={false} />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate font-medium text-ink underline-offset-2 hover:text-accent-ink hover:underline"
        >
          {handle}
          <span className="sr-only"> — profil {platformLabel(post.platform)} (nouvel onglet)</span>
        </a>
      ) : (
        <span className="min-w-0 truncate font-medium text-ink">{handle}</span>
      )}
      {author.displayName && author.displayName.trim() && author.displayName.trim() !== author.handle && !handle.includes(author.displayName.trim()) ? (
        <span className="hidden min-w-0 truncate sm:inline">({author.displayName.trim()})</span>
      ) : null}
      <span aria-hidden>·</span>
      {followers !== undefined ? (
        <span>
          <span className="font-medium tabular-nums text-ink">{formatCompact(followers)}</span>{" "}
          {pluralize(followers, "abonné", "abonnés")}
        </span>
      ) : (
        <span>{expired ? "abonnés effacés" : "abonnés inconnus"}</span>
      )}
    </p>
  );
}

/** "1,2 M vues · 34 k vues/jour · 4,1 % partages + enreg. · 12 k j'aime · 340 comm." */
export function viralMetricLabels(post: ViralPost, report: ViralReport): string[] {
  if (isExpiredPost(report, post)) return [];
  const { views, likes, comments } = post.metrics;
  const parts: string[] = [];
  if (isNumber(views)) parts.push(formatCount(views, "vue", "vues"));
  if (isNumber(post.viewsPerDay)) parts.push(`${formatCompact(post.viewsPerDay)} vues/jour`);
  if (isNumber(post.shareSaveRate) && ratiosAllowedFor(report, post.platform)) {
    parts.push(`${formatPct(post.shareSaveRate)} partages + enreg.`);
  }
  if (isNumber(likes) && likes >= 0) parts.push(`${formatCompact(likes)} j'aime`);
  if (isNumber(comments)) parts.push(`${formatCompact(comments)} comm.`);
  return parts;
}

/**
 * The left column of a video row (from `sm`): the headline number big —
 * × its creator's audience, or raw views where ratios are off or the
 * audience is unknown — and the tier.
 */
function ScoreCell({ post, report }: { post: ViralPost; report: ViralReport }) {
  const tier = TIER_META[post.tier] ?? TIER_META.normal;
  const strong = post.tier === "explose" || post.tier === "cartonne";
  const tone = post.tier === "explose" ? "hot" : post.tier === "cartonne" ? "accent" : "neutral";
  const variant = post.tier === "explose" ? "solid" : post.tier === "normal" ? "outline" : "soft";
  const numberTone = post.tier === "explose" ? "text-hot-ink" : post.tier === "cartonne" ? "text-accent-ink" : "text-ink";
  const expired = isExpiredPost(report, post);
  const allowed = ratiosAllowedFor(report, post.platform);
  const views = post.metrics.views;

  let value = "—";
  let unit = "";
  if (expired) unit = "chiffres expirés";
  else if (allowed && isNumber(post.multiplier)) {
    value = formatMultiplier(post.multiplier);
    unit = "son audience";
  } else if (isNumber(views)) {
    value = formatCompact(views);
    unit = allowed ? `${pluralize(views, "vue", "vues")} · audience inconnue` : pluralize(views, "vue", "vues");
  }

  return (
    <div aria-hidden className="hidden w-[6.5rem] shrink-0 flex-col items-start sm:flex">
      <span className={cn("text-xl font-semibold leading-tight tracking-tight", expired ? "text-muted" : numberTone)}>{value}</span>
      {unit ? <span className="text-xs leading-snug text-muted">{unit}</span> : null}
      {!expired && (strong || allowed) ? (
        <Badge size="sm" tone={tone} variant={variant} className="mt-1.5">
          {!allowed && strong ? "Top vues" : tier.label}
        </Badge>
      ) : null}
    </div>
  );
}

export interface ViralPostRowProps {
  post: ViralPost;
  report: ViralReport;
  now: number;
  /** 1-based rank shown in a small tile. */
  rank?: number;
}

/**
 * One real video of the niche: × its creator's audience (tier colour; a big
 * number column from `sm`, a badge on phones), vs creators of the same size,
 * linked title, author and audience, views, velocity, shares + saves, kind /
 * duration and date.
 */
export function ViralPostRow({ post, report, now, rank }: ViralPostRowProps) {
  const metrics = viralMetricLabels(post, report);
  const relative = post.publishedAt ? formatRelative(post.publishedAt, now) : "";
  const band = hasBand(post, report) ? <BandBadge post={post} report={report} size="sm" /> : null;
  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0 sm:gap-4">
      {rank !== undefined ? (
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-surface-2 px-1.5 text-xs font-bold tabular-nums text-muted"
        >
          {rank}
        </span>
      ) : null}
      <ScoreCell post={post} report={report} />
      <div className="min-w-0 flex-1">
        {/* Phones: the badge carries the number; from sm it is the score column (the badge stays for screen readers). */}
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 empty:hidden sm:mb-0">
          <span className="inline-flex sm:sr-only">
            <MultiplierBadge post={post} report={report} />
          </span>
          {band ? <span className="inline-flex sm:hidden">{band}</span> : null}
        </div>
        <p className="text-sm font-medium leading-snug">
          <PostLink post={post} className="break-words" />
        </p>
        <AuthorLine post={post} report={report} className="mt-1" />
        <p className="mt-1 text-xs text-muted">
          {metrics.length > 0 ? <span className="tabular-nums text-ink/80">{metrics.join(" · ")} · </span> : null}
          {postKindLabel(post)}
          {relative ? (
            <>
              {" · "}
              <time dateTime={post.publishedAt} title={formatDateTime(post.publishedAt)}>
                {relative}
              </time>
            </>
          ) : null}
        </p>
        {band ? <div className="mt-1.5 hidden sm:flex">{band}</div> : null}
      </div>
    </li>
  );
}
