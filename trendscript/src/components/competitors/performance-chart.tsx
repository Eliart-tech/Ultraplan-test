"use client";

import { useCallback, useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatCompact, formatDate, formatNumber } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import {
  barLayout,
  barPath,
  formatRatio,
  metricUnit,
  niceScale,
  type ChartSeries,
} from "./report-utils";

const PLOT_HEIGHT = 200;
const TOP = 20; // room for the outlier labels
const AXIS_BAND = 24; // x-axis date labels
const LEFT = 44; // y-axis tick labels
const RIGHT = 8;
const HEIGHT = TOP + PLOT_HEIGHT + AXIS_BAND;

/**
 * Outliers wear the "hot" token. In dark mode it is mixed 10 % with the
 * surface so it stays inside the validated lightness band (dataviz palette
 * check: accent + hot pass CVD, normal-vision and contrast in both modes).
 */
const HOT_FILL = "fill-hot dark:fill-[color-mix(in_oklab,var(--ts-hot)_90%,var(--ts-surface))]";
const HOT_SWATCH = "bg-hot dark:bg-[color-mix(in_oklab,var(--ts-hot)_90%,var(--ts-surface))]";

/** Width of an element, measured with ResizeObserver (0 until measured). */
function useMeasuredWidth<T extends HTMLElement>(): [(node: T | null) => (() => void) | undefined, number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: T | null) => {
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((previous) => (previous === next ? previous : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export interface PerformanceChartProps {
  series: ChartSeries;
  /** id of the table twin (publications list) for the "données en tableau" link. */
  tableId?: string;
  className?: string;
}

/**
 * Column chart of the analysed posts, oldest → newest: one column per post
 * (its views, or engagement when views are hidden), outliers (≥ 2× the
 * creator's median) in the hot colour with their ratio, the median as a
 * reference line. Hover or keyboard (←/→ once focused) shows the details;
 * the same values are in the publications table.
 */
export function PerformanceChart({ series, tableId, className }: PerformanceChartProps) {
  const [containerRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const descriptionId = useId();
  const { bars, metric } = series;

  const plotWidth = Math.max(0, width - LEFT - RIGHT);
  const maxValue = bars.reduce((max, bar) => Math.max(max, bar.value), 0);
  const scale = niceScale(maxValue);
  const layout = barLayout(
    bars.map((bar) => bar.value),
    { width: plotWidth, height: PLOT_HEIGHT, scaleMax: scale.max },
  );
  const y = (value: number) => TOP + PLOT_HEIGHT - (value / scale.max) * PLOT_HEIGHT;
  const outlierCount = bars.filter((bar) => bar.outlier).length;
  // Direct labels only on the strongest outliers, and only when the slot is wide enough.
  const labelled = new Set(
    layout.slot >= 26
      ? bars
          .map((bar, index) => ({ bar, index }))
          .filter(({ bar }) => bar.outlier)
          .sort((a, b) => b.bar.value - a.bar.value)
          .slice(0, 5)
          .map(({ index }) => index)
      : [],
  );

  const unit = metricUnit(metric);
  const summary = `${bars.length} publications de la plus ancienne à la plus récente, ${unit} par publication. Médiane : ${formatNumber(series.median)} ${unit}. ${outlierCount} ${outlierCount > 1 ? "publications dépassent" : "publication dépasse"} 2 fois la médiane. Maximum : ${formatNumber(maxValue)} ${unit}.`;

  function describe(index: number): string {
    const bar = bars[index];
    if (!bar) return "";
    const date = bar.publishedAt ? formatDate(bar.publishedAt) : "date inconnue";
    const ratio = bar.ratio !== undefined ? `, ${formatRatio(bar.ratio)} sa médiane` : "";
    return `Publication ${index + 1} sur ${bars.length}, ${date} : ${formatNumber(bar.value)} ${unit}${ratio}. ${bar.title}`;
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (layout.slot <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - LEFT;
    const index = Math.floor(x / layout.slot);
    setActive(index >= 0 && index < bars.length ? index : null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (bars.length === 0) return;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = Math.min(bars.length - 1, (active ?? -1) + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, (active ?? bars.length) - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = bars.length - 1;
    else if (event.key === "Escape") {
      setActive(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  if (bars.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
        Aucune publication n&apos;a de {metric === "views" ? "vues visibles" : "métrique d'engagement"} : graphique
        indisponible.
      </p>
    );
  }

  const activeBar = active !== null ? bars[active] : undefined;
  const activeGeometry = active !== null ? layout.bars[active] : undefined;
  const tooltipWidth = 224;
  const tooltipLeft =
    activeGeometry !== undefined
      ? Math.min(Math.max(0, LEFT + activeGeometry.x + activeGeometry.width / 2 - tooltipWidth / 2), Math.max(0, width - tooltipWidth))
      : 0;
  const firstDate = bars[0]?.publishedAt;
  const lastDate = bars[bars.length - 1]?.publishedAt;

  return (
    <figure className={cn("min-w-0", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-accent" />
          Publication
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[3px]", HOT_SWATCH)} />
          Au moins 2× sa médiane
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 bg-ink/60" />
          Médiane
        </span>
      </div>

      <div
        ref={containerRef}
        role="group"
        aria-roledescription="graphique"
        aria-label={`Performance par publication. ${summary}`}
        aria-describedby={descriptionId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        className="relative rounded-lg outline-offset-4"
        style={{ height: HEIGHT }}
      >
        <p id={descriptionId} className="sr-only">
          Flèches gauche et droite pour parcourir les publications.
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
            {/* Gridlines + y ticks */}
            {scale.ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={LEFT}
                  x2={width - RIGHT}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-line"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={LEFT - 8}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-faint text-[10px] tabular-nums"
                >
                  {formatCompact(tick)}
                </text>
              </g>
            ))}

            <g transform={`translate(${LEFT},${TOP})`}>
              {/* Hover column behind the active bar */}
              {activeGeometry !== undefined ? (
                <rect
                  x={(active ?? 0) * layout.slot}
                  y={0}
                  width={layout.slot}
                  height={PLOT_HEIGHT}
                  className="fill-surface-2"
                />
              ) : null}
              {layout.bars.map((geometry, index) => {
                const bar = bars[index];
                return (
                  <path
                    key={bar.postId}
                    d={barPath(geometry)}
                    className={cn(bar.outlier ? HOT_FILL : "fill-accent", "transition-opacity duration-150")}
                    opacity={active !== null && active !== index ? 0.55 : 1}
                  />
                );
              })}
              {layout.bars.map((geometry, index) =>
                labelled.has(index) ? (
                  <text
                    key={`label-${bars[index].postId}`}
                    x={geometry.x + geometry.width / 2}
                    y={geometry.y - 5}
                    textAnchor="middle"
                    className="fill-ink stroke-surface text-[10px] font-semibold tabular-nums"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {bars[index].ratio !== undefined ? formatRatio(bars[index].ratio) : ""}
                  </text>
                ) : null,
              )}
            </g>

            {/* Median reference line */}
            {series.median !== undefined && series.median > 0 ? (
              <g>
                <line
                  x1={LEFT}
                  x2={width - RIGHT}
                  y1={y(series.median)}
                  y2={y(series.median)}
                  className="stroke-ink/60"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={width - RIGHT}
                  y={y(series.median) - 4}
                  textAnchor="end"
                  className="fill-muted stroke-surface text-[10px] font-medium"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  médiane {formatCompact(series.median)}
                </text>
              </g>
            ) : null}

            {/* Baseline */}
            <line
              x1={LEFT}
              x2={width - RIGHT}
              y1={TOP + PLOT_HEIGHT}
              y2={TOP + PLOT_HEIGHT}
              className="stroke-line-strong"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />

            {/* X axis: first and last dates only */}
            {firstDate ? (
              <text x={LEFT} y={HEIGHT - 6} className="fill-faint text-[10px]">
                {formatDate(firstDate)}
              </text>
            ) : null}
            {lastDate && bars.length > 1 ? (
              <text x={width - RIGHT} y={HEIGHT - 6} textAnchor="end" className="fill-faint text-[10px]">
                {formatDate(lastDate)}
              </text>
            ) : null}
          </svg>
        ) : null}

        {activeBar && activeGeometry ? (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop"
            style={{ left: tooltipLeft, bottom: HEIGHT - TOP - activeGeometry.y + 10, width: tooltipWidth }}
          >
            <p className="text-sm font-semibold tabular-nums text-ink">
              {formatNumber(activeBar.value)} {metricUnit(metric, activeBar.value)}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-muted">
              {activeBar.ratio !== undefined ? (
                <span className="inline-flex items-center gap-1">
                  <span className={cn("h-0.5 w-3 rounded-full", activeBar.outlier ? HOT_SWATCH : "bg-accent")} />
                  {formatRatio(activeBar.ratio)} sa médiane
                </span>
              ) : null}
              {activeBar.publishedAt ? <span>{formatDate(activeBar.publishedAt)}</span> : null}
            </p>
            <p className="mt-1 line-clamp-2 text-ink/85">{activeBar.title}</p>
          </div>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {active !== null ? describe(active) : ""}
      </p>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {bars.length} publications, de la plus ancienne à la plus récente
          {series.excluded > 0
            ? ` · ${series.excluded} sans ${metric === "views" ? "vues visibles" : "métrique"} non affichée${series.excluded > 1 ? "s" : ""}`
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
