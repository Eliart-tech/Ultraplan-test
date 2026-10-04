"use client";

import { Flame } from "lucide-react";
import { useState } from "react";
import { ReportSection } from "@/components/competitors/report-section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { platformLabel } from "@/components/ui/platform-icon";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { pluralize } from "@/lib/client/format";
import type { ViralPlatform, ViralReport } from "@/lib/types";
import { ViralScatter } from "./viral-chart";
import { ViralPostRow } from "./viral-post-items";
import {
  DEFAULT_FILTERS,
  SORT_LABELS,
  TIER_META,
  TIER_ORDER,
  filterViralPosts,
  reportPlatforms,
  scatterPoints,
  sortViralPosts,
  tierCounts,
  type TierFilter,
  type ViralFilters,
  type ViralSort,
} from "./viral-utils";

const INITIAL_ROWS = 12;

export interface VideosSectionProps {
  report: ViralReport;
  now: number;
}

/**
 * "Les vidéos qui explosent": one filter row (platform, level, sort) scoping
 * both the scatter plot (views vs the creator's followers) and the list of
 * real videos, best first.
 */
export function VideosSection({ report, now }: VideosSectionProps) {
  const [filters, setFilters] = useState<ViralFilters>(DEFAULT_FILTERS);
  const [expanded, setExpanded] = useState(false);
  const platforms = reportPlatforms(report);
  const platform = filters.platform !== "all" && !platforms.includes(filters.platform) ? "all" : filters.platform;
  const counts = tierCounts(filterViralPosts(report.posts, { platform, tier: "all" }));
  const total = TIER_ORDER.reduce((sum, tier) => sum + counts[tier], 0);
  const filtered = filterViralPosts(report.posts, { platform, tier: filters.tier });
  const sorted = sortViralPosts(filtered, filters.sort);
  const shown = expanded ? sorted : sorted.slice(0, INITIAL_ROWS);
  const { points, excluded } = scatterPoints(report, filtered);
  const update = (patch: Partial<ViralFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setExpanded(false);
  };

  const tierOptions: { value: TierFilter; label: string }[] = [
    { value: "all", label: `Tous les niveaux (${total})` },
    { value: "top", label: `Explose + cartonne (${counts.explose + counts.cartonne})` },
    ...TIER_ORDER.map((tier) => ({ value: tier, label: `${TIER_META[tier].label} (${counts[tier]})` })),
  ];

  return (
    <ReportSection
      id="videos"
      tone="hot"
      icon={<Flame />}
      title="Les vidéos qui explosent"
      description="Classées par niveau : combien de fois l'audience de leur créateur elles ont fait en vues. Plus un point est haut au-dessus des diagonales, plus la vidéo a été poussée à des non-abonnés — ceux qui peuvent s'abonner."
    >
      <div className="mb-4 grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        {platforms.length > 1 ? (
          <Field label="Plateforme" group className="col-span-2 sm:col-span-1">
            <Segmented
              size="sm"
              fullWidth
              value={platform}
              onValueChange={(value: ViralPlatform | "all") => update({ platform: value })}
              options={[
                { value: "all", label: "Toutes" },
                ...platforms.map((item) => ({ value: item, label: platformLabel(item) })),
              ]}
            />
          </Field>
        ) : null}
        <Field label="Niveau" className="min-w-0 sm:w-56">
          <Select
            size="sm"
            value={filters.tier}
            onChange={(event) => update({ tier: event.target.value as TierFilter })}
            options={tierOptions}
          />
        </Field>
        <Field label="Trier par" className="min-w-0 sm:w-60">
          <Select
            size="sm"
            value={filters.sort}
            onChange={(event) => update({ sort: event.target.value as ViralSort })}
            options={(Object.keys(SORT_LABELS) as ViralSort[]).map((value) => ({ value, label: SORT_LABELS[value] }))}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="px-5 py-5 sm:px-6">
          <ViralScatter points={points} excluded={excluded} tableId="liste-videos" />
        </Card>

        <Card id="liste-videos" className="scroll-mt-32 px-5 py-4 sm:px-6">
          {shown.length > 0 ? (
            <ul aria-label={`Vidéos (${sorted.length})`} className="divide-y divide-line">
              {shown.map((post, index) => (
                <ViralPostRow key={post.id} post={post} report={report} now={now} rank={index + 1} />
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-muted">Aucune vidéo pour ces filtres.</p>
          )}
          {sorted.length > INITIAL_ROWS ? (
            <div className="mt-4 border-t border-line pt-3">
              <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
                {expanded ? "Afficher moins" : `Afficher les ${sorted.length} ${pluralize(sorted.length, "vidéo", "vidéos")}`}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </ReportSection>
  );
}
