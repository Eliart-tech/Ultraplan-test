"use client";

import { ExternalLink, Flame, Pin, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/popover";
import { safeHref } from "@/components/studio/studio-utils";
import { formatDateTime, formatRelative } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import type { CreatorPost } from "@/lib/types";
import { formatMultiplier, formatRatio, postKindLabel, postMetricLabels, type RankedPost } from "./report-utils";

/** "×3,4 sa médiane" — hot when the post is an outlier (≥ 2×). */
export function RatioBadge({ ratio, size = "sm" }: { ratio: number | undefined; size?: "sm" | "md" }) {
  if (ratio === undefined) return null;
  const strong = ratio >= 2;
  return (
    <Tooltip content="Performance de la publication ÷ sa médiane">
      <Badge size={size} tone={strong ? "hot" : "neutral"} icon={strong ? <Flame /> : undefined}>
        {formatRatio(ratio)} sa médiane
        <span className="sr-only"> ({formatRatio(ratio).replace("×", "")} fois sa performance médiane)</span>
      </Badge>
    </Tooltip>
  );
}

/** "×4,2 son audience" — views ÷ followers (reach beyond the subscribers). */
export function AudienceBadge({ multiplier, size = "sm" }: { multiplier: number | undefined; size?: "sm" | "md" }) {
  if (multiplier === undefined) return null;
  const strong = multiplier >= 1;
  return (
    <Tooltip content="Vues ÷ abonnés du compte">
      <Badge size={size} tone={strong ? "accent" : "neutral"} icon={<UsersRound />}>
        {formatMultiplier(multiplier)} son audience
        <span className="sr-only"> (vues égales à {formatMultiplier(multiplier).replace("×", "")} fois ses abonnés)</span>
      </Badge>
    </Tooltip>
  );
}

/** External link to a post, opening in a new tab without referrer. */
export function PostLink({
  post,
  className,
  children,
}: {
  post: CreatorPost;
  className?: string;
  children?: ReactNode;
}) {
  const href = safeHref(post.url);
  const label = children ?? post.title;
  if (!href) return <span className={className}>{label}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group text-ink underline-offset-2 transition-colors duration-150 hover:text-accent-ink hover:underline",
        className,
      )}
    >
      {label}
      <ExternalLink
        aria-hidden
        className="ml-1 inline size-3.5 align-[-2px] text-faint transition-colors duration-150 group-hover:text-accent-ink"
      />
      <span className="sr-only"> (s&apos;ouvre dans un nouvel onglet)</span>
    </a>
  );
}

export interface PostRowProps extends RankedPost {
  now: number;
  /** Optional 1-based rank shown in a small tile. */
  rank?: number;
  /** Show the "× sa médiane" badge (default true). */
  showRatio?: boolean;
  /** Hide the "× son audience" badge below this multiplier (default 0: always shown). */
  audienceMin?: number;
}

/**
 * One real post: badges (× median, × audience), linked title, kind, date and
 * metrics. Used by every evidence list of the report.
 */
export function PostRow({ post, ratio, multiplier, now, rank, showRatio = true, audienceMin = 0 }: PostRowProps) {
  const metrics = postMetricLabels(post);
  const relative = post.publishedAt ? formatRelative(post.publishedAt, now) : "";
  return (
    <li className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
      {rank !== undefined ? (
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-surface-2 px-1.5 text-xs font-bold tabular-nums text-muted"
        >
          {rank}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {showRatio ? <RatioBadge ratio={ratio} /> : null}
          <AudienceBadge multiplier={multiplier !== undefined && multiplier >= audienceMin ? multiplier : undefined} />
          {post.pinned ? (
            <Badge size="sm" tone="neutral" icon={<Pin />}>
              Épinglée
            </Badge>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm font-medium leading-snug">
          <PostLink post={post} className="break-words" />
        </p>
        <p className="mt-1 text-xs text-muted">
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
        {metrics.length > 0 ? <p className="mt-0.5 text-xs tabular-nums text-ink/75">{metrics.join(" · ")}</p> : null}
      </div>
    </li>
  );
}

/** List wrapper of PostRow items. */
export function PostList({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <ul aria-label={label} className={cn("divide-y divide-line", className)}>
      {children}
    </ul>
  );
}

/**
 * Compact evidence links next to a claim: the posts it rests on (max
 * `max`, then "+n").
 */
export function PostChips({
  posts,
  max = 3,
  label = "Publications citées",
  className,
}: {
  posts: CreatorPost[];
  max?: number;
  label?: string;
  className?: string;
}) {
  if (posts.length === 0) return null;
  const shown = posts.slice(0, max);
  const hidden = posts.length - shown.length;
  return (
    <ul aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((post) => {
        const metric = postMetricLabels(post)[0];
        const href = safeHref(post.url);
        const content = (
          <>
            <span className="min-w-0 truncate">{post.title || "Publication"}</span>
            {metric ? <span className="shrink-0 tabular-nums text-faint">· {metric}</span> : null}
            {href ? <ExternalLink aria-hidden className="size-3 shrink-0 text-faint" /> : null}
          </>
        );
        const chip =
          "inline-flex h-7 max-w-[17rem] items-center gap-1 rounded-lg border border-line bg-surface px-2 text-xs font-medium text-ink";
        return (
          <li key={post.id} className="max-w-full">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={post.title}
                className={cn(chip, "transition-colors duration-150 hover:border-accent/50 hover:text-accent-ink")}
              >
                {content}
                <span className="sr-only"> (s&apos;ouvre dans un nouvel onglet)</span>
              </a>
            ) : (
              <span className={chip} title={post.title}>
                {content}
              </span>
            )}
          </li>
        );
      })}
      {hidden > 0 ? (
        <li className="inline-flex h-7 items-center px-1 text-xs text-muted">
          +{hidden} autre{hidden > 1 ? "s" : ""}
        </li>
      ) : null}
    </ul>
  );
}
