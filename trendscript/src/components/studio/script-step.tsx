"use client";

import { Clapperboard, FileCheck2, Hash, ListVideo, RotateCcw, ScrollText, SearchCheck } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { getHistory, isProfileFilled, saveScriptToHistory, useProfile } from "@/lib/client/storage";
import { useServerStatus } from "@/lib/client/use-server-status";
import { cn } from "@/lib/cn";
import { applyGuardrails } from "@/lib/script/guardrails";
import type { ScriptRequest } from "@/lib/types";
import { applyHook } from "./apply-hook";
import { ScriptProgress } from "./script-progress";
import { ScriptResult } from "./script-result";
import { ScriptSettingsPanel } from "./script-settings";
import { useStudio } from "./studio-store";
import { cleanSettings, toScriptDraft } from "./studio-utils";
import { TopicRecap } from "./topic-recap";

/** Max evidence signals per request (API schema limit). */
const MAX_EVIDENCE = 100;

/**
 * Step 4 — Script: settings on the left, progress and result on the right
 * (stacked on phones). Builds the API request (guardrails applied), and
 * keeps the history entry in sync when another hook is chosen.
 */
export function ScriptStep() {
  const { state, dispatch, actions } = useStudio();
  const { draft, scriptRun: run, saveNotice } = state;
  const { topic, angle, result } = draft;
  const { status } = useServerStatus();
  const { profile } = useProfile();
  const resultRef = useRef<HTMLDivElement>(null);

  if (!topic || !angle) return null;

  const guard = applyGuardrails(topic, draft.settings);
  const aiConfigured = status?.ai.configured ?? null;
  const running = run.status === "running";
  const analysisId = draft.analysis?.topics.some((item) => item.id === topic.id) ? draft.analysis.id : undefined;

  const revealResult = () => {
    // On phones the result sits below the long settings panel.
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  const baseRequest: Omit<ScriptRequest, "settings"> = {
    topic,
    signals: draft.evidence.slice(0, MAX_EVIDENCE),
    angle,
    profile,
    ...(draft.geo ? { geo: draft.geo } : {}),
  };

  const generate = () => {
    const settings = cleanSettings(guard.settings);
    void actions.runScript({ request: { ...baseRequest, settings }, kind: "generate", analysisId });
    revealResult();
  };

  const refine = (instruction: string) => {
    if (!result) return;
    // Refine with the settings the script was written with, from what the creator sees (chosen hook).
    const previous = toScriptDraft(applyHook(result.script, result.hookIndex));
    void actions.runScript({
      request: { ...baseRequest, settings: result.settings, refine: { previous, instruction } },
      kind: "refine",
      analysisId,
    });
  };

  const changeHook = (index: number) => {
    if (!result) return;
    dispatch({ type: "selectHook", index });
    // Keep the saved copy in sync: history stores the script as shown.
    const entry = getHistory().scripts.find((item) => item.id === result.script.id);
    if (entry) saveScriptToHistory({ ...entry, script: applyHook(result.script, index) });
  };

  return (
    <div className="space-y-6">
      <TopicRecap
        topic={topic}
        angle={angle}
        onChangeAngle={() => dispatch({ type: "goTo", step: "angle" })}
        onChangeTopic={draft.analysis ? () => dispatch({ type: "goTo", step: "sujets" }) : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <ScriptSettingsPanel
          settings={draft.settings}
          onChange={(patch) => dispatch({ type: "updateSettings", patch })}
          topic={topic}
          notices={guard.notices}
          aiConfigured={aiConfigured}
          profile={profile}
          profileFilled={isProfileFilled(profile)}
          onGenerate={generate}
          busy={running}
          hasResult={result !== null}
        />

        <div ref={resultRef} className="min-w-0 scroll-mt-4 space-y-5">
          {running ? <ScriptProgress run={run} onCancel={actions.cancelScript} /> : null}

          {run.status === "error" ? (
            <Alert
              tone="danger"
              title={run.kind === "refine" ? "L'affinage a échoué" : "La génération a échoué"}
              onDismiss={() => dispatch({ type: "scriptReset" })}
              action={
                <>
                  <Button size="sm" leftIcon={<RotateCcw aria-hidden className="size-4" />} onClick={actions.retryScript}>
                    Réessayer
                  </Button>
                  {run.error?.includes("ANTHROPIC_API_KEY") ? (
                    <Link href="/reglages" className="text-sm font-medium text-accent-ink underline-offset-2 hover:underline">
                      Ouvrir les réglages
                    </Link>
                  ) : null}
                </>
              }
            >
              {run.error}
            </Alert>
          ) : null}

          {run.status === "cancelled" ? (
            <Alert
              tone="info"
              onDismiss={() => dispatch({ type: "scriptReset" })}
              action={
                <Button size="sm" variant="secondary" leftIcon={<RotateCcw aria-hidden className="size-4" />} onClick={actions.retryScript}>
                  Relancer
                </Button>
              }
            >
              {run.kind === "refine" ? "Affinage annulé." : "Génération annulée."}
              {result ? " Le script précédent est conservé." : ""}
            </Alert>
          ) : null}

          {result ? (
            <div className={cn("transition-opacity duration-200", running && "pointer-events-none opacity-55")}>
              <ScriptResult
                script={result.script}
                hookIndex={result.hookIndex}
                onHookChange={changeHook}
                settings={result.settings}
                topic={topic}
                angle={angle}
                busy={running}
                canGenerate={aiConfigured !== false}
                onRegenerate={generate}
                onRefine={refine}
                saveNotice={saveNotice}
              />
            </div>
          ) : running ? (
            <ResultSkeleton />
          ) : run.status === "idle" || run.status === "cancelled" ? (
            <ResultPlaceholder />
          ) : null}
        </div>
      </div>
    </div>
  );
}

const DELIVERABLES = [
  { icon: <Clapperboard />, title: "3 accroches", text: "Trois styles d'ouverture testés, à choisir en un clic." },
  { icon: <ListVideo />, title: "Déroulé minuté", text: "Voix off, texte à l'écran, visuel et montage, seconde par seconde." },
  { icon: <ScrollText />, title: "Prompteur", text: "Le texte complet à lire, calé sur la durée et le débit choisis." },
  { icon: <Hash />, title: "Légende et hashtags", text: "Adaptés aux règles de la plateforme, avec le CTA." },
  { icon: <SearchCheck />, title: "Faits à vérifier", text: "Chaque chiffre avec sa source et un niveau de confiance." },
  { icon: <FileCheck2 />, title: "Checklist qualité", text: "Points forts, risques et critères validés avant publication." },
];

/** Before the first generation: what the creator will get (no fake preview). */
function ResultPlaceholder() {
  return (
    <Card className="border-dashed p-6 sm:p-8">
      <h2 className="text-base font-semibold text-ink">Votre script apparaîtra ici</h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
        Ajustez les réglages puis lancez la génération : Claude écrit à partir des preuves réelles du sujet et de votre
        angle, sans inventer de chiffres.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {DELIVERABLES.map((item) => (
          <li key={item.title} className="flex gap-3 rounded-xl border border-line bg-surface-2/50 p-3.5">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink [&_svg]:size-4"
            >
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{item.title}</span>
              <span className="block text-xs leading-relaxed text-muted">{item.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ResultSkeleton() {
  return (
    <div aria-hidden className="space-y-5">
      <Card className="p-5 sm:p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-7 w-3/4" />
        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
      </Card>
      <Card className="p-5 sm:p-6">
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-xl border border-line p-4">
              <Skeleton className="h-4 w-20" />
              <SkeletonText lines={3} className="mt-4" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
