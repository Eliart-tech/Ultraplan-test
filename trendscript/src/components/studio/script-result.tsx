"use client";

import {
  CircleCheck,
  Clock3,
  FileDown,
  FileText,
  History,
  ListVideo,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  SearchCheck,
  TriangleAlert,
  Type,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { PlatformIcon, scriptPlatformToPlatform } from "@/components/ui/platform-icon";
import { Stat } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { downloadFile, scriptFileName, scriptToMarkdown, scriptToText, type ScriptExportContext } from "@/lib/client/export";
import { formatDateTime, formatDuration, pluralize } from "@/lib/client/format";
import { PLATFORM_LABELS, TONE_LABELS } from "@/lib/script/levels";
import { budgetRange } from "@/lib/script/metrics";
import type { Angle, GeneratedScript, ScriptSettings, Topic } from "@/lib/types";
import { applyHook } from "./apply-hook";
import { BeatTimeline } from "./beat-timeline";
import { FactsPanel } from "./facts-panel";
import { HookPicker } from "./hook-picker";
import { PublicationPanel } from "./publication-panel";
import { QualityPanel } from "./quality-panel";
import { RefinePanel } from "./refine-panel";
import type { SaveNotice } from "./studio-store";
import { Teleprompter } from "./teleprompter";

type ResultTab = "deroule" | "prompteur" | "publication" | "qualite" | "faits";

export interface ScriptResultProps {
  /** The script as generated (hooks[0] in use). */
  script: GeneratedScript;
  /** Hook currently used (index in `script.hooks`). */
  hookIndex: number;
  onHookChange: (index: number) => void;
  /** Settings the script was generated with (target duration, platform…). */
  settings: ScriptSettings;
  topic: Topic;
  angle: Angle;
  /** A generation is running (actions disabled, result dimmed). */
  busy: boolean;
  /** Generation possible (Claude configured). */
  canGenerate: boolean;
  onRegenerate: () => void;
  onRefine: (instruction: string) => void;
  saveNotice: SaveNotice | null;
}

/**
 * A generated script, ready to shoot: stats vs. targets, warnings, hook
 * picker, then tabs (déroulé, prompteur, publication, qualité, faits &
 * sources) and the actions bar (copy, export, regenerate, refine).
 */
export function ScriptResult({
  script,
  hookIndex,
  onHookChange,
  settings,
  topic,
  angle,
  busy,
  canGenerate,
  onRegenerate,
  onRefine,
  saveNotice,
}: ScriptResultProps) {
  const [tab, setTab] = useState<ResultTab>("deroule");
  const [refineOpen, setRefineOpen] = useState(false);
  const refineId = useId();
  const titleId = useId();
  // What the creator sees, exports and refines: the chosen hook applied.
  const effective = useMemo(() => applyHook(script, hookIndex), [script, hookIndex]);

  const context: ScriptExportContext = { topic, angle, settings };
  const range = budgetRange(effective.wordBudget);
  const wordsOff = effective.wordCount < range.min || effective.wordCount > range.max;
  const target = settings.durationSec;
  const durationOff = target > 0 && Math.abs(effective.estimatedDurationSec - target) / target > 0.1;
  const weakFacts = effective.factsToVerify.filter((fact) => fact.confidence === "faible").length;
  const saved = saveNotice?.scriptId === script.id ? saveNotice : null;

  function exportAs(extension: "md" | "txt") {
    const content = extension === "md" ? scriptToMarkdown(effective, context) : scriptToText(effective, context);
    downloadFile(scriptFileName(effective.title, extension), content, extension === "md" ? "text/markdown" : "text/plain");
  }

  return (
    <article aria-labelledby={titleId} aria-busy={busy} className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="neutral" size="sm" icon={<PlatformIcon platform={scriptPlatformToPlatform(settings.platform)} size="xs" tile={false} decorative />}>
            {PLATFORM_LABELS[settings.platform].label}
          </Badge>
          <Badge tone="neutral" size="sm">
            {settings.durationSec} s · {TONE_LABELS[settings.tone].label}
          </Badge>
          <span>
            Généré le <time dateTime={script.createdAt}>{formatDateTime(script.createdAt)}</time>
            {script.model ? ` · ${script.model}` : ""}
          </span>
        </div>
        <h2 id={titleId} className="mt-3 text-title font-semibold text-ink">
          {effective.title}
        </h2>

        {saved ? (
          saved.ok ? (
            <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs font-medium text-success-ink">
              <CircleCheck aria-hidden className="size-3.5" />
              Enregistré dans l&apos;historique
              {saved.evicted > 0
                ? ` (${saved.evicted} ${pluralize(saved.evicted, "ancien élément supprimé", "anciens éléments supprimés")} pour faire de la place)`
                : ""}
              <Link href="/historique" className="inline-flex items-center gap-1 text-accent-ink underline-offset-2 hover:underline">
                <History aria-hidden className="size-3.5" />
                Voir
              </Link>
            </p>
          ) : (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-warning-ink">
              <TriangleAlert aria-hidden className="size-3.5" />
              Non enregistré : le stockage de ce navigateur est plein ou désactivé. Exportez le script pour le garder.
            </p>
          )
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat
            label="Mots"
            icon={<Type />}
            value={
              <>
                {effective.wordCount}
                <span className="text-sm font-medium text-muted"> / {effective.wordBudget}</span>
              </>
            }
            hint={wordsOff ? `Hors budget (${range.min}–${range.max})` : `Dans le budget (${range.min}–${range.max})`}
            tone={wordsOff ? "warning" : "success"}
          />
          <Stat
            label="Durée estimée"
            icon={<Clock3 />}
            value={formatDuration(effective.estimatedDurationSec)}
            hint={`Cible : ${formatDuration(target)}`}
            tone={durationOff ? "warning" : "success"}
          />
          <Stat
            label="Plateforme"
            icon={<Send />}
            value={<span className="text-base">{PLATFORM_LABELS[settings.platform].label}</span>}
            hint={`${effective.hashtags.length} ${pluralize(effective.hashtags.length, "hashtag", "hashtags")}`}
          />
          <Stat
            label="Faits à vérifier"
            icon={<SearchCheck />}
            value={effective.factsToVerify.length}
            hint={weakFacts > 0 ? `dont ${weakFacts} à confiance faible` : "aucun à confiance faible"}
            tone={weakFacts > 0 ? "warning" : "neutral"}
          />
        </div>

        {effective.warnings.length > 0 ? (
          <Alert
            tone="warning"
            size="sm"
            role="none"
            className="mt-5"
            title={`${effective.warnings.length} ${pluralize(effective.warnings.length, "point à surveiller", "points à surveiller")}`}
          >
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {effective.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <CopyButton text={() => scriptToText(effective, context)} label="Copier tout" />
          <Button size="sm" variant="secondary" leftIcon={<FileDown aria-hidden className="size-4" />} onClick={() => exportAs("md")}>
            Exporter .md
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<FileText aria-hidden className="size-4" />} onClick={() => exportAs("txt")}>
            Exporter .txt
          </Button>
          <span className="hidden flex-1 sm:block" />
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<RefreshCw aria-hidden className="size-4" />}
            onClick={onRegenerate}
            disabled={busy || !canGenerate}
          >
            Régénérer
          </Button>
          <Button
            size="sm"
            variant={refineOpen ? "primary" : "soft"}
            leftIcon={<Wand2 aria-hidden className="size-4" />}
            aria-expanded={refineOpen}
            aria-controls={refineId}
            onClick={() => setRefineOpen(!refineOpen)}
            disabled={!canGenerate}
          >
            Affiner
          </Button>
        </div>

        {refineOpen ? (
          <div className="mt-4">
            <RefinePanel
              id={refineId}
              busy={busy}
              disabled={!canGenerate}
              onSubmit={(instruction) => {
                setRefineOpen(false);
                onRefine(instruction);
              }}
              onClose={() => setRefineOpen(false)}
            />
          </div>
        ) : null}
      </Card>

      <Card className="p-5 sm:p-6">
        <HookPicker hooks={script.hooks} value={hookIndex} onChange={onHookChange} disabled={busy} />
      </Card>

      <Card className="px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
        <Tabs<ResultTab>
          aria-label="Vues du script"
          value={tab}
          onValueChange={setTab}
          items={[
            {
              value: "deroule",
              label: "Déroulé",
              icon: <ListVideo />,
              count: effective.beats.length,
              content: <BeatTimeline beats={effective.beats} />,
            },
            {
              value: "prompteur",
              label: "Prompteur",
              icon: <ScrollText />,
              content: (
                <Teleprompter
                  text={effective.fullScript}
                  wordCount={effective.wordCount}
                  estimatedDurationSec={effective.estimatedDurationSec}
                />
              ),
            },
            {
              value: "publication",
              label: "Publication",
              icon: <Send />,
              content: (
                <PublicationPanel
                  caption={effective.caption}
                  hashtags={effective.hashtags}
                  cta={effective.cta}
                  platform={settings.platform}
                />
              ),
            },
            {
              value: "qualite",
              label: "Qualité",
              icon: <ShieldCheck />,
              content: (
                <QualityPanel strengths={effective.strengths} risks={effective.risks} checklist={effective.checklist} />
              ),
            },
            {
              value: "faits",
              label: "Faits & sources",
              icon: <SearchCheck />,
              count: effective.factsToVerify.length,
              content: (
                <FactsPanel facts={effective.factsToVerify} sources={effective.sources} research={effective.research} />
              ),
            },
          ]}
        />
      </Card>
    </article>
  );
}
