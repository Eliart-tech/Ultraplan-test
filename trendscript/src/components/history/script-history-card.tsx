"use client";

import { ArrowUpRight, Clock, Download, FileText, Gauge, Timer, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Disclosure } from "@/components/ui/disclosure";
import { PlatformIcon, scriptPlatformToPlatform } from "@/components/ui/platform-icon";
import { ScoreRing } from "@/components/ui/score-ring";
import {
  downloadFile,
  scriptFileName,
  scriptToMarkdown,
  scriptToText,
  type ScriptExportContext,
} from "@/lib/client/export";
import { formatDuration } from "@/lib/client/format";
import type { SavedScript } from "@/lib/client/storage";
import { ANGLE_TYPE_LABELS, PLATFORM_LABELS, TONE_LABELS } from "@/lib/script/levels";
import { SCRIPT_PLATFORMS, type ScriptPlatform } from "@/lib/types";
import { MetaItem, RelativeTime, ResponsiveLabel } from "./history-card-parts";

export interface ScriptHistoryCardProps {
  entry: SavedScript;
  /** Current time (from `useNow`) for the relative date. */
  now: number;
  /** Asks for confirmation; the parent removes the entry. */
  onDelete: (entry: SavedScript) => void;
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function knownPlatform(value: unknown): ScriptPlatform | null {
  return SCRIPT_PLATFORMS.includes(value as ScriptPlatform) ? (value as ScriptPlatform) : null;
}

/** Export context shared by "Exporter .md" and "Copier". */
function exportContext(entry: SavedScript): ScriptExportContext {
  return { topic: entry.topic, angle: entry.angle, settings: entry.settings };
}

/** Studio URL that reopens this script (handled by the Studio page). */
export function scriptStudioHref(id: string): string {
  return `/?script=${encodeURIComponent(id)}`;
}

/**
 * A saved script in the history: platform, title, topic, angle, date,
 * length vs. budget, topic score; open in the Studio, export, copy, delete,
 * and a quick read-only preview of the teleprompter text.
 */
export function ScriptHistoryCard({ entry, now, onDelete }: ScriptHistoryCardProps) {
  const { script, topic, angle, settings } = entry;
  const title = script.title?.trim() || "Script sans titre";
  const platform = knownPlatform(settings?.platform);
  const total = topic?.scores?.total;
  const warnings = Array.isArray(script.warnings) ? script.warnings.length : 0;
  const angleLabel = angle?.type ? (ANGLE_TYPE_LABELS[angle.type] ?? angle.type) : null;
  const toneLabel = settings?.tone ? TONE_LABELS[settings.tone]?.label : undefined;
  const fullScript = typeof script.fullScript === "string" ? script.fullScript.trim() : "";

  function exportMarkdown() {
    downloadFile(scriptFileName(title, "md"), scriptToMarkdown(script, exportContext(entry)), "text/markdown");
  }

  return (
    <Card as="li" className="flex flex-col">
      <div className="flex-1 pb-4">
        <div className="flex items-start gap-3.5 px-4 pt-4 sm:px-5 sm:pt-5">
          {platform ? (
            <PlatformIcon platform={scriptPlatformToPlatform(platform)} size="lg" decorative className="mt-0.5" />
          ) : (
            <span
              aria-hidden
              className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted"
            >
              <FileText className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">
              {platform ? PLATFORM_LABELS[platform].label : "Plateforme inconnue"}
              {isNumber(settings?.durationSec) ? ` · ${settings.durationSec} s` : null}
            </p>
            <h2 className="mt-0.5 text-[0.9375rem] font-semibold leading-snug text-ink">{title}</h2>
            {topic?.title ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted">
                <span className="text-faint">Sujet : </span>
                {topic.title}
              </p>
            ) : null}
          </div>
          {isNumber(total) ? <ScoreRing value={total} size={44} label="Score du sujet" className="shrink-0" /> : null}
        </div>

        <div className="flex flex-wrap gap-1.5 px-4 pt-3 sm:px-5">
          {angleLabel ? (
            <Badge tone="accent" size="sm">
              {angleLabel}
            </Badge>
          ) : null}
          {toneLabel ? (
            <Badge tone="neutral" size="sm">
              Ton {toneLabel.toLowerCase()}
            </Badge>
          ) : null}
          {warnings > 0 ? (
            <Badge tone="warning" size="sm" icon={<TriangleAlert />}>
              {warnings} alerte{warnings > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>

        <ul
          className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 pt-3 text-xs text-muted sm:px-5"
          aria-label="Détails du script"
        >
          <MetaItem icon={<Clock />}>
            <RelativeTime iso={entry.savedAt} now={now} />
          </MetaItem>
          {isNumber(script.wordCount) ? (
            <MetaItem icon={<FileText />}>
              <span className="tabular-nums">
                {script.wordCount} mots{isNumber(script.wordBudget) ? ` / ${script.wordBudget} visés` : ""}
              </span>
            </MetaItem>
          ) : null}
          {isNumber(script.estimatedDurationSec) ? (
            <MetaItem icon={<Timer />}>
              <span className="tabular-nums">≈ {formatDuration(script.estimatedDurationSec)} à l&apos;oral</span>
            </MetaItem>
          ) : null}
          {isNumber(settings?.virality) && isNumber(settings?.pedagogy) ? (
            <MetaItem icon={<Gauge />}>
              <span className="tabular-nums">
                Viralité {settings.virality} · Pédagogie {settings.pedagogy}
              </span>
            </MetaItem>
          ) : null}
        </ul>

        {fullScript ? (
          <Disclosure
            summary="Aperçu du texte"
            openSummary="Masquer l'aperçu"
            className="px-4 pt-3 sm:px-5"
            buttonClassName="text-[0.8125rem]"
          >
            <blockquote className="max-h-64 overflow-y-auto whitespace-pre-line rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink">
              {fullScript}
            </blockquote>
          </Disclosure>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        <ButtonLink
          href={scriptStudioHref(entry.id)}
          variant="primary"
          size="sm"
          leftIcon={<ArrowUpRight aria-hidden className="size-4" />}
          aria-label={`Ouvrir « ${title} » dans le Studio`}
        >
          Ouvrir
        </ButtonLink>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportMarkdown}
            leftIcon={<Download aria-hidden className="size-4" />}
            aria-label={`Exporter .md : « ${title} »`}
          >
            <ResponsiveLabel short=".md" full="Exporter .md" />
          </Button>
          <CopyButton text={() => scriptToText(script, exportContext(entry))} label="Copier" />
          <IconButton
            label={`Supprimer « ${title} »`}
            size="sm"
            icon={<Trash2 aria-hidden className="size-4" />}
            onClick={() => onDelete(entry)}
            className="hover:bg-danger-soft! hover:text-danger-ink!"
          />
        </div>
      </div>
    </Card>
  );
}
