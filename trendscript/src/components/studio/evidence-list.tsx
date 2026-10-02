"use client";

import { ExternalLink, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import { Thumbnail } from "@/components/ui/thumbnail";
import { formatDateTime, formatRelative, formatSignalMetrics } from "@/lib/client/format";
import type { Signal } from "@/lib/types";
import { SIGNAL_KIND_LABELS } from "./studio-options";
import { safeHref } from "./studio-utils";

export interface EvidenceListProps {
  signals: Signal[];
  /** Timestamp from `useNow()`, for relative dates. */
  now: number;
  className?: string;
}

/**
 * The real signals behind a topic: platform, linked title, author, metrics
 * (fr-FR compact), relative date, "Virale" outliers, thumbnail and related
 * headlines. Links open in a new tab without referrer.
 */
export function EvidenceList({ signals, now, className }: EvidenceListProps) {
  if (signals.length === 0) {
    return <p className="text-sm text-muted">Les preuves de ce sujet ne sont plus disponibles dans cette session.</p>;
  }
  return (
    <ul className={className ?? "divide-y divide-line"}>
      {signals.map((signal) => (
        <EvidenceItem key={signal.id} signal={signal} now={now} />
      ))}
    </ul>
  );
}

function EvidenceItem({ signal, now }: { signal: Signal; now: number }) {
  const href = safeHref(signal.url);
  const metrics = formatSignalMetrics(signal.metrics);
  const related = signal.related.filter((link) => safeHref(link.url)).slice(0, 3);
  const vertical = signal.kind === "short_video";
  const relative = signal.publishedAt ? formatRelative(signal.publishedAt, now) : "";

  return (
    <li className="flex gap-3 py-3.5 first:pt-0 last:pb-0 sm:gap-4">
      {signal.thumbnailUrl ? (
        <Thumbnail
          src={signal.thumbnailUrl}
          alt=""
          platform={signal.platform}
          aspect={vertical ? "portrait" : "video"}
          className={vertical ? "w-12 sm:w-14" : "w-24 sm:w-32"}
        />
      ) : (
        <PlatformIcon platform={signal.platform} size="md" decorative className="mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          {signal.thumbnailUrl ? <PlatformIcon platform={signal.platform} size="xs" tile={false} decorative /> : null}
          <span className="font-medium text-ink/80">
            {platformLabel(signal.platform)} · {SIGNAL_KIND_LABELS[signal.kind] ?? signal.kind}
          </span>
          {signal.author ? (
            <>
              <span aria-hidden>·</span>
              <span className="max-w-[14rem] truncate">{signal.author}</span>
            </>
          ) : null}
          {relative ? (
            <>
              <span aria-hidden>·</span>
              <time dateTime={signal.publishedAt} title={formatDateTime(signal.publishedAt)}>
                {relative}
              </time>
            </>
          ) : null}
          {signal.outlier ? (
            <Badge size="sm" tone="hot" icon={<Flame />} className="ml-0.5">
              Virale
            </Badge>
          ) : null}
        </div>

        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-1 block text-sm font-medium leading-snug text-ink underline-offset-2 transition-colors duration-150 hover:text-accent-ink hover:underline"
          >
            {signal.title}
            <ExternalLink
              aria-hidden
              className="ml-1 inline size-3.5 align-[-2px] text-faint transition-colors duration-150 group-hover:text-accent-ink"
            />
            <span className="sr-only"> (s&apos;ouvre dans un nouvel onglet)</span>
          </a>
        ) : (
          <p className="mt-1 text-sm font-medium leading-snug text-ink">{signal.title}</p>
        )}

        {metrics.length > 0 ? (
          <p className="mt-1 text-xs tabular-nums text-muted">{metrics.join(" · ")}</p>
        ) : null}

        {related.length > 0 ? (
          <ul className="mt-2 space-y-1 border-l-2 border-line pl-3" aria-label="Titres liés">
            {related.map((link, index) => (
              <li key={`${index}-${link.url}`} className="text-xs leading-relaxed">
                <a
                  href={safeHref(link.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted underline-offset-2 transition-colors duration-150 hover:text-accent-ink hover:underline"
                >
                  {link.title}
                </a>
                {link.source ? <span className="text-faint"> — {link.source}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}
