"use client";

import { ArrowRight, BarChart3, Flame, Lightbulb, RefreshCw, Sparkles, Trash2, TrendingUp, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import { formatDateTime, formatRelative, pluralize } from "@/lib/client/format";
import { MAX_SAVED_VIRAL, isViralMetricsStripped, isViralRetentionExpired, viralReportKey } from "@/lib/client/storage";
import type { ViralReport } from "@/lib/types";
import { VIRAL_PLATFORM_ORDER, keywordsLabel, tierCounts, viralReportHref, viralReportTitle } from "./viral-utils";

export interface SavedViralReportsProps {
  reports: ViralReport[];
  now: number;
  /** An analysis is running (re-run disabled). */
  busy: boolean;
  onRerun: (report: ViralReport) => void;
  onDelete: (report: ViralReport) => void;
}

/** "Mes analyses": saved lab reports (max 6), newest first, with open / re-run / delete. */
export function SavedViralReports({ reports, now, busy, onRerun, onDelete }: SavedViralReportsProps) {
  return (
    <section aria-labelledby="analyses-cartonne-titre" className="flex flex-col gap-4">
      <div>
        <h2 id="analyses-cartonne-titre" className="flex items-center gap-2 text-base font-semibold text-ink">
          Mes analyses
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted">
            {reports.length}/{MAX_SAVED_VIRAL}
          </span>
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Enregistrées dans ce navigateur. Le Studio s&apos;en sert pour bâtir vos scripts sur ce qui marche dans votre niche.
        </p>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={<Flame />}
          title="Aucune analyse pour l'instant"
          description="Indiquez les mots-clés de votre niche : TrendScript récupère les vidéos récentes sur Instagram, TikTok et YouTube, mesure de combien chacune dépasse l'audience de son créateur, puis Claude en tire les recettes qui font des vues et des abonnés."
        >
          <ul className="mt-3 grid w-full max-w-lg gap-2 text-left text-sm sm:grid-cols-2">
            {[
              { icon: <Flame />, text: "Les vidéos qui explosent au-delà de leur audience" },
              { icon: <Sparkles />, text: "Les recettes gagnantes, avec les vraies vidéos" },
              { icon: <UserPlus />, text: "Ce qui fait s'abonner, pas seulement regarder" },
              { icon: <Lightbulb />, text: "Des idées pour vous, à scripter en un clic" },
            ].map((item) => (
              <li key={item.text} className="flex gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
                <span aria-hidden className="mt-0.5 text-hot [&_svg]:size-4">
                  {item.icon}
                </span>
                <span className="text-ink/85">{item.text}</span>
              </li>
            ))}
          </ul>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Analyses enregistrées">
          {reports.map((report) => {
            const key = viralReportKey(report);
            const title = viralReportTitle(report);
            const counts = tierCounts(report.posts);
            const expired = isViralMetricsStripped(report) || isViralRetentionExpired(report, now);
            const keywords = keywordsLabel(report.request.keywords);
            const titleId = `analyse-${report.id.replace(/[^a-z0-9]/gi, "-")}`;
            const platforms = VIRAL_PLATFORM_ORDER.filter((platform) => report.request.platforms.includes(platform));
            return (
              <Card as="li" key={key} className="flex flex-col">
                <div className="flex flex-1 flex-col gap-3 px-5 pt-5">
                  <div className="min-w-0">
                    <h3 id={titleId} className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug text-ink">
                      {title}
                    </h3>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                      <span className="inline-flex shrink-0 items-center gap-0.5" role="img" aria-label={platforms.map(platformLabel).join(", ")}>
                        {platforms.map((platform) => (
                          <PlatformIcon key={platform} platform={platform} size="xs" tile={false} decorative />
                        ))}
                      </span>
                      <span className="truncate">
                        {keywords !== title ? `${keywords} · ` : ""}
                        {report.request.periodDays} j
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {counts.explose > 0 ? (
                      <Badge size="sm" tone="hot" variant="solid" icon={<Flame />}>
                        {counts.explose} {pluralize(counts.explose, "explose", "explosent")}
                      </Badge>
                    ) : null}
                    {counts.cartonne > 0 ? (
                      <Badge size="sm" tone="accent" icon={<TrendingUp />}>
                        {counts.cartonne} {pluralize(counts.cartonne, "cartonne", "cartonnent")}
                      </Badge>
                    ) : null}
                    {report.mode === "ai" ? (
                      <Badge size="sm" tone="neutral" icon={<Sparkles />}>
                        {report.patterns?.ideas.length
                          ? `${report.patterns.ideas.length} ${pluralize(report.patterns.ideas.length, "idée", "idées")}`
                          : "Analyse complète"}
                      </Badge>
                    ) : (
                      <Badge size="sm" tone="warning" icon={<BarChart3 />}>
                        Statistiques seules
                      </Badge>
                    )}
                    {expired ? (
                      <Badge size="sm" tone="warning" dot title="Statistiques YouTube effacées après 30 jours">
                        YouTube expiré
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">
                    {report.posts.length} {pluralize(report.posts.length, "vidéo", "vidéos")} · analysé{" "}
                    <time dateTime={report.createdAt} title={formatDateTime(report.createdAt)}>
                      {formatRelative(report.createdAt, now)}
                    </time>
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 border-t border-line px-3 py-2.5 sm:px-4">
                  <ButtonLink
                    href={viralReportHref(key)}
                    size="sm"
                    variant="soft"
                    rightIcon={<ArrowRight aria-hidden className="size-4" />}
                    aria-describedby={titleId}
                  >
                    Ouvrir
                  </ButtonLink>
                  <span className="flex-1" />
                  <IconButton
                    size="sm"
                    label={`Relancer l'analyse « ${title} »`}
                    icon={<RefreshCw aria-hidden className="size-4" />}
                    onClick={() => onRerun(report)}
                    disabled={busy}
                  />
                  <IconButton
                    size="sm"
                    label={`Supprimer l'analyse « ${title} »`}
                    icon={<Trash2 aria-hidden className="size-4" />}
                    onClick={() => onDelete(report)}
                  />
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </section>
  );
}
