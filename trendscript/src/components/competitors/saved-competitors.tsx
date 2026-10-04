"use client";

import { ArrowRight, BarChart3, Flame, Lightbulb, RefreshCw, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import { formatCompact, formatDateTime, formatRelative, pluralize } from "@/lib/client/format";
import { isMetricsStripped, isRetentionExpired, reportKey } from "@/lib/client/storage";
import type { CompetitorReport } from "@/lib/types";
import { isStale, reportHref } from "./report-utils";

export interface SavedCompetitorsProps {
  reports: CompetitorReport[];
  now: number;
  /** An analysis is running (re-analyse disabled). */
  busy: boolean;
  onReanalyse: (report: CompetitorReport) => void;
  onDelete: (report: CompetitorReport) => void;
}

/** "Concurrents suivis": saved reports (max 12), newest first, with open / re-analyse / delete. */
export function SavedCompetitors({ reports, now, busy, onReanalyse, onDelete }: SavedCompetitorsProps) {
  return (
    <section aria-labelledby="suivis-titre" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="suivis-titre" className="flex items-center gap-2 text-base font-semibold text-ink">
            Concurrents suivis
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted">
              {reports.length}/12
            </span>
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Enregistrés dans ce navigateur. Le Studio s&apos;en sert pour que tes scripts s&apos;en démarquent.
          </p>
        </div>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Aucun concurrent analysé pour l'instant"
          description="Indique le pseudo d'un créateur de ta niche : TrendScript récupère ses dernières publications réelles, calcule ce qui surperforme et ce qui fait venir des abonnés, puis Claude en tire des angles morts et des idées de vidéos pour toi."
        >
          <ul className="mt-3 grid w-full max-w-lg gap-2 text-left text-sm sm:grid-cols-2">
            {[
              { icon: <Flame />, text: "Ses publications qui surperforment, chiffres à l'appui" },
              { icon: <UserPlus />, text: "Ce qui fait venir des abonnés" },
              { icon: <Sparkles />, text: "Ses hooks, piliers et angles morts" },
              { icon: <Lightbulb />, text: "Des idées de vidéos pour toi, à scripter en un clic" },
            ].map((item) => (
              <li key={item.text} className="flex gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
                <span aria-hidden className="mt-0.5 text-accent [&_svg]:size-4">
                  {item.icon}
                </span>
                <span className="text-ink/85">{item.text}</span>
              </li>
            ))}
          </ul>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Concurrents suivis">
          {reports.map((report) => {
            const key = reportKey(report);
            const { account } = report.data;
            const name = account.displayName?.trim() || `@${account.handle}`;
            const expired = isMetricsStripped(report) || isRetentionExpired(report, now);
            const stale = !expired && isStale(report, now);
            const titleId = `suivi-${key.replace(/[^a-z0-9]/gi, "-")}`;
            return (
              <Card as="li" key={key} className="flex flex-col">
                <div className="flex flex-1 flex-col gap-3 px-5 pt-5">
                  <div className="flex items-start gap-3">
                    <PlatformIcon platform={account.platform} size="md" />
                    <div className="min-w-0 flex-1">
                      <h3 id={titleId} className="truncate text-[0.9375rem] font-semibold leading-snug text-ink">
                        {name}
                      </h3>
                      <p className="truncate text-xs text-muted">
                        @{account.handle} · {platformLabel(account.platform)}
                        {account.followers !== undefined
                          ? ` · ${formatCompact(account.followers)} ${pluralize(account.followers, "abonné", "abonnés")}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {report.mode === "ai" ? (
                      <Badge size="sm" tone="accent" icon={<Sparkles />}>
                        Analyse complète
                      </Badge>
                    ) : (
                      <Badge size="sm" tone="warning" icon={<BarChart3 />}>
                        Statistiques seules
                      </Badge>
                    )}
                    {report.stats.outliers.length > 0 ? (
                      <Badge size="sm" tone="hot" icon={<Flame />}>
                        {report.stats.outliers.length} {pluralize(report.stats.outliers.length, "carton", "cartons")}
                      </Badge>
                    ) : null}
                    {expired ? (
                      <Badge size="sm" tone="warning" dot title="Statistiques YouTube effacées après 30 jours">
                        Chiffres expirés : à relancer
                      </Badge>
                    ) : stale ? (
                      <Badge size="sm" tone="warning" dot title="Plus de 30 jours : chiffres datés">
                        À actualiser
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">
                    {report.stats.postCount} publications
                    {report.stats.medianViews !== undefined ? ` · médiane ${formatCompact(report.stats.medianViews)} vues` : ""}
                    {report.insights?.ideas.length ? ` · ${report.insights.ideas.length} idées de vidéos` : ""}
                    <br />
                    Analysé{" "}
                    <time dateTime={report.createdAt} title={formatDateTime(report.createdAt)}>
                      {formatRelative(report.createdAt, now)}
                    </time>
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 border-t border-line px-3 py-2.5 sm:px-4">
                  <ButtonLink
                    href={reportHref(key)}
                    size="sm"
                    variant="soft"
                    rightIcon={<ArrowRight aria-hidden className="size-4" />}
                    aria-describedby={titleId}
                  >
                    Ouvrir le rapport
                  </ButtonLink>
                  <span className="flex-1" />
                  <IconButton
                    size="sm"
                    label={`Ré-analyser ${name}`}
                    icon={<RefreshCw aria-hidden className="size-4" />}
                    onClick={() => onReanalyse(report)}
                    disabled={busy}
                  />
                  <IconButton
                    size="sm"
                    label={`Supprimer ${name}`}
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
