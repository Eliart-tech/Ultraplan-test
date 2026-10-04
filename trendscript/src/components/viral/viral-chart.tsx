"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { HOT_FILL, HOT_SWATCH, useMeasuredWidth } from "@/components/competitors/performance-chart";
import { formatMultiplier } from "@/components/competitors/report-utils";
import { platformLabel } from "@/components/ui/platform-icon";
import { formatCompact, formatNumber, pluralize } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import type { ViralTier } from "@/lib/types";
import {
  FOLLOWER_FLOOR,
  formatTick,
  logDomain,
  logPosition,
  logTicks,
  nearestPoint,
  type ScatterPoint,
} from "./viral-utils";

const TOP = 14;
const RIGHT = 14;
const LEFT = 44; // y-axis tick labels
const AXIS_BAND = 40; // x-axis tick labels + axis title
const PLOT_HEIGHT = 260;
const HEIGHT = TOP + PLOT_HEIGHT + AXIS_BAND;
const DIAGONALS = [
  { factor: 1, label: "×1" },
  { factor: 3, label: "×3" },
  { factor: 10, label: "×10" },
];

/** Drawing order: context first, the breakouts on top. */
const TIER_LAYER: Record<ViralTier, number> = { normal: 0, bon: 1, cartonne: 2, explose: 3 };

function fillClass(tier: ViralTier): string {
  if (tier === "explose") return HOT_FILL;
  if (tier === "cartonne") return "fill-accent";
  return "fill-faint/55";
}

function swatchClass(tier: ViralTier): string {
  if (tier === "explose") return HOT_SWATCH;
  if (tier === "cartonne") return "bg-accent";
  return "bg-faint/55";
}

export interface ViralScatterProps {
  points: ScatterPoint[];
  /** Videos of the current selection that could not be placed (no followers, YouTube ratios off…). */
  excluded: number;
  /** id of the list twin, for the "données en tableau" link. */
  tableId?: string;
  className?: string;
}

/**
 * Every placeable video of the niche: its views (y) against its creator's
 * followers (x), both on log scales, with the ×1 / ×3 / ×10 diagonals. A dot
 * far above the diagonals was watched far beyond its creator's audience —
 * pushed to non-followers. Breakouts wear the tier colours (hot = explose,
 * violet = cartonne), the rest is grey context; the strongest are labelled.
 * Hover / keyboard (←/→, from the strongest) shows the details; the same
 * values are in the video list.
 */
export function ViralScatter({ points, excluded, tableId, className }: ViralScatterProps) {
  const [containerRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const descriptionId = useId();
  // useId contains characters that are awkward inside url(#…) references.
  const clipId = `viral-plot-${descriptionId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const plotWidth = Math.max(0, width - LEFT - RIGHT);
  const xDomain = logDomain(points.map((point) => point.followers));
  const yDomain = logDomain(points.map((point) => point.views));
  const x = (value: number) => LEFT + logPosition(value, xDomain, [0, plotWidth]);
  const y = (value: number) => TOP + logPosition(value, yDomain, [PLOT_HEIGHT, 0]);
  const placed = points.map((point) => ({ x: x(point.followers), y: y(point.views) }));
  // Keyboard order: strongest first.
  const order = points
    .map((point, index) => ({ index, multiplier: point.multiplier }))
    .sort((a, b) => b.multiplier - a.multiplier)
    .map((entry) => entry.index);
  const drawOrder = points.map((_, index) => index).sort((a, b) => TIER_LAYER[points[a].tier] - TIER_LAYER[points[b].tier]);

  // Direct labels: the three strongest breakouts, skipping collisions.
  const labels: { index: number; x: number; y: number; anchor: "start" | "end"; text: string }[] = [];
  if (plotWidth > 0) {
    for (const index of order) {
      if (labels.length >= 3) break;
      const point = points[index];
      if (point.tier !== "explose" && point.tier !== "cartonne") continue;
      const text = formatMultiplier(point.multiplier);
      const { x: px, y: py } = placed[index];
      const anchor = px > LEFT + plotWidth - 48 ? "end" : "start";
      const lx = anchor === "start" ? px + 9 : px - 9;
      const box = { x0: anchor === "start" ? lx : lx - text.length * 7, x1: anchor === "start" ? lx + text.length * 7 : lx, y0: py - 8, y1: py + 6 };
      const collides = labels.some((label) => {
        const other = {
          x0: label.anchor === "start" ? label.x : label.x - label.text.length * 7,
          x1: label.anchor === "start" ? label.x + label.text.length * 7 : label.x,
          y0: label.y - 8,
          y1: label.y + 6,
        };
        return box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0;
      });
      if (!collides) labels.push({ index, x: lx, y: py, anchor, text });
    }
  }

  const explose = points.filter((point) => point.tier === "explose").length;
  const cartonne = points.filter((point) => point.tier === "cartonne").length;
  const best = order.length > 0 ? points[order[0]] : undefined;
  const summary = `Nuage de ${points.length} ${pluralize(points.length, "vidéo", "vidéos")} : vues selon les abonnés de leur auteur, échelles logarithmiques, avec les diagonales ×1, ×3 et ×10. ${explose} ${pluralize(explose, "explose", "explosent")}, ${cartonne} ${pluralize(cartonne, "cartonne", "cartonnent")}.${best ? ` La plus forte : ${formatMultiplier(best.multiplier)} son audience (${best.author}).` : ""}`;

  function describe(index: number): string {
    const point = points[index];
    if (!point) return "";
    return `${formatNumber(point.views)} vues, ${formatMultiplier(point.multiplier)} son audience, ${point.author} (${formatNumber(point.followers)} abonnés, ${platformLabel(point.platform)}). ${point.title}`;
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setActive(nearestPoint(placed, event.clientX - rect.left, event.clientY - rect.top, 24));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (order.length === 0) return;
    const position = active !== null ? order.indexOf(active) : -1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = order[Math.min(order.length - 1, position + 1)];
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = order[Math.max(0, position < 0 ? 0 : position - 1)];
    else if (event.key === "Home") next = order[0];
    else if (event.key === "End") next = order[order.length - 1];
    else if (event.key === "Escape") {
      setActive(null);
      return;
    }
    if (next === null || next === undefined) return;
    event.preventDefault();
    setActive(next);
  }

  if (points.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
        Aucune vidéo de cette sélection n&apos;a à la fois ses vues et les abonnés de son auteur : nuage indisponible.
        La liste ci-dessous reste complète.
      </p>
    );
  }

  const xTicks = logTicks(xDomain);
  const yTicks = logTicks(yDomain);
  const activePoint = active !== null ? points[active] : undefined;
  const activePlace = active !== null ? placed[active] : undefined;
  const tooltipWidth = 236;
  const tooltipLeft =
    activePlace !== undefined ? Math.min(Math.max(0, activePlace.x - tooltipWidth / 2), Math.max(0, width - tooltipWidth)) : 0;
  const tooltipBelow = activePlace !== undefined && activePlace.y < 120;

  return (
    <figure className={cn("min-w-0", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", swatchClass("explose"))} />
          Explose (×10 et plus)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", swatchClass("cartonne"))} />
          Cartonne
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", swatchClass("normal"))} />
          Autres
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 bg-ink/45" />
          Vues = ×1, ×3, ×10 les abonnés
        </span>
      </div>

      <div
        ref={containerRef}
        role="group"
        aria-roledescription="graphique"
        aria-label={summary}
        aria-describedby={descriptionId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        className="relative rounded-lg outline-offset-4"
        style={{ height: HEIGHT }}
      >
        <p id={descriptionId} className="sr-only">
          Flèches pour parcourir les vidéos, de la plus forte à la plus faible.
        </p>
        {width > 0 ? (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            aria-hidden
            className="block overflow-visible"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setActive(null)}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={LEFT} y={TOP} width={plotWidth} height={PLOT_HEIGHT} />
              </clipPath>
            </defs>

            {/* Gridlines + ticks (one per power of ten) */}
            {yTicks.map((tick) => (
              <g key={`y-${tick}`}>
                <line
                  x1={LEFT}
                  x2={LEFT + plotWidth}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-line"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text x={LEFT - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-faint text-[10px] tabular-nums">
                  {formatTick(tick)}
                </text>
              </g>
            ))}
            {xTicks.map((tick, index) => (
              <g key={`x-${tick}`}>
                <line
                  x1={x(tick)}
                  x2={x(tick)}
                  y1={TOP}
                  y2={TOP + PLOT_HEIGHT}
                  className="stroke-line"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={x(tick)}
                  y={TOP + PLOT_HEIGHT + 14}
                  textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}
                  className="fill-faint text-[10px] tabular-nums"
                >
                  {formatTick(tick)}
                </text>
              </g>
            ))}

            {/* Diagonals: views = ×1, ×3, ×10 the followers */}
            <g clipPath={`url(#${clipId})`}>
              {DIAGONALS.map(({ factor, label }) => {
                const start = Math.max(xDomain[0], yDomain[0] / factor);
                const end = Math.min(xDomain[1], yDomain[1] / factor);
                if (!(end > start)) return null;
                const x1 = x(start);
                const y1 = y(start * factor);
                const x2 = x(end);
                const y2 = y(end * factor);
                return (
                  <g key={factor}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-ink/30" strokeWidth={1} />
                    <text
                      x={x2 - 4}
                      y={y2 + 12}
                      textAnchor="end"
                      className="fill-muted stroke-surface text-[10px] font-medium"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Axes */}
            <line
              x1={LEFT}
              x2={LEFT + plotWidth}
              y1={TOP + PLOT_HEIGHT}
              y2={TOP + PLOT_HEIGHT}
              className="stroke-line-strong"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text x={LEFT + plotWidth} y={HEIGHT - 4} textAnchor="end" className="fill-muted text-[10px] font-medium">
              Abonnés de l&apos;auteur →
            </text>
            <text x={LEFT} y={TOP - 4} className="fill-muted text-[10px] font-medium">
              ↑ Vues
            </text>

            {/* Dots: 2 px surface ring, breakouts drawn last */}
            {drawOrder.map((index) => {
              const point = points[index];
              const place = placed[index];
              const isActive = active === index;
              return (
                <circle
                  key={point.postId}
                  cx={place.x}
                  cy={place.y}
                  r={isActive ? 7 : 5}
                  className={cn(fillClass(point.tier), "stroke-surface transition-[r,opacity] duration-150")}
                  strokeWidth={2}
                  opacity={active !== null && !isActive ? 0.45 : 1}
                />
              );
            })}
            {activePlace ? (
              <circle cx={activePlace.x} cy={activePlace.y} r={9} fill="none" className="stroke-ink/70" strokeWidth={1.5} />
            ) : null}

            {/* Direct labels on the strongest breakouts */}
            {labels.map((label) => (
              <text
                key={`label-${label.index}`}
                x={label.x}
                y={label.y}
                dy="0.32em"
                textAnchor={label.anchor}
                className="fill-ink stroke-surface text-[10px] font-semibold tabular-nums"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {label.text}
              </text>
            ))}
          </svg>
        ) : null}

        {activePoint && activePlace ? (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop"
            style={
              tooltipBelow
                ? { left: tooltipLeft, top: activePlace.y + 14, width: tooltipWidth }
                : { left: tooltipLeft, bottom: HEIGHT - activePlace.y + 14, width: tooltipWidth }
            }
          >
            <p className="text-sm font-semibold tabular-nums text-ink">
              {formatMultiplier(activePoint.multiplier)} son audience
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-muted">
              <span className="inline-flex items-center gap-1">
                <span className={cn("h-0.5 w-3 rounded-full", swatchClass(activePoint.tier))} />
                {formatCompact(activePoint.views)} vues
              </span>
              <span>
                · {activePoint.author} ({formatCompact(activePoint.followers)}
                {activePoint.followers <= FOLLOWER_FLOOR ? " ou moins" : ""} abonnés)
              </span>
            </p>
            <p className="mt-1 line-clamp-2 text-ink/85">{activePoint.title}</p>
          </div>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {active !== null ? describe(active) : ""}
      </p>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {points.length} {pluralize(points.length, "vidéo placée", "vidéos placées")} · échelles logarithmiques · comptes
          de moins de 1 000 abonnés placés à 1 000
          {excluded > 0
            ? ` · ${excluded} sans abonnés connus ou sans ratio autorisé, dans la liste seulement`
            : ""}
        </span>
        {tableId ? (
          <a href={`#${tableId}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
            Données en tableau
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}
