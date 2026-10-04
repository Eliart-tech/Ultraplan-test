"use client";

import { Check, Globe, PenLine, ShieldCheck, SpellCheck2, Wand2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { formatNumber, pluralize } from "@/lib/client/format";
import type { ScriptPhase, ScriptRun } from "./studio-store";

type StepState = "done" | "current" | "upcoming" | "skipped";

const ORDER: ScriptPhase[] = ["research", "writing", "review", "finalizing"];

export function stepState(phase: ScriptPhase, run: ScriptRun): StepState {
  if (phase === "research" && !run.research) return "skipped";
  // An unexpected review event (older client state) still shows as current.
  if (phase === "review" && !run.review && run.phase !== "review") return "skipped";
  // Before the first status event, the first expected step is current.
  const current = run.phase ?? (run.research ? "research" : "writing");
  const index = ORDER.indexOf(phase);
  const currentIndex = ORDER.indexOf(current);
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "upcoming";
}

function StepRow({
  state,
  icon,
  label,
  detail,
}: {
  state: StepState;
  icon: ReactNode;
  label: string;
  detail?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3" aria-current={state === "current" ? "step" : undefined}>
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 [&_svg]:size-4",
          state === "done" && "border-accent bg-accent text-accent-fg",
          state === "current" && "border-accent bg-accent-soft text-accent-ink",
          state === "upcoming" && "border-line-strong bg-surface text-faint",
          state === "skipped" && "border-dashed border-line-strong bg-surface text-faint",
        )}
      >
        {state === "done" ? <Check strokeWidth={3} /> : state === "current" ? <Spinner size="sm" /> : icon}
      </span>
      <div className="min-w-0 pt-1">
        <p className={cn("text-sm font-medium", state === "upcoming" || state === "skipped" ? "text-muted" : "text-ink")}>
          {label}
          <span className="sr-only">
            {" "}
            ({state === "done" ? "terminé" : state === "current" ? "en cours" : state === "skipped" ? "désactivé" : "à venir"})
          </span>
        </p>
        {detail ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p> : null}
      </div>
    </li>
  );
}

export interface ScriptProgressProps {
  run: ScriptRun;
  onCancel: () => void;
}

/**
 * Live panel of a generation: Recherche des faits → Écriture (n caractères)
 * → Relecture critique → Finalisation, with a cancel button. The Studio's
 * live region announces each phase.
 */
export function ScriptProgress({ run, onCancel }: ScriptProgressProps) {
  const research = stepState("research", run);
  const writing = stepState("writing", run);
  const review = stepState("review", run);
  const finalizing = stepState("finalizing", run);
  const sources = run.brief?.sources.length ?? 0;

  return (
    <Card as="section" aria-label="Progression de la génération" elevated className="overflow-hidden animate-fade-in">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-white">
            {run.kind === "refine" ? <Wand2 aria-hidden className="size-5" /> : <PenLine aria-hidden className="size-5" />}
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">
              {run.kind === "refine" ? "Affinage du script" : "Écriture du script"}
            </h2>
            <p className="text-sm text-muted">
              {run.kind === "refine" && run.instruction ? `« ${run.instruction} »` : "Claude travaille à partir des preuves réelles du sujet."}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" leftIcon={<X aria-hidden className="size-4" />} onClick={onCancel}>
          Annuler
        </Button>
      </div>

      <div className="px-5 pb-5 pt-5 sm:px-6">
        <Progress label="Progression de la génération" value={null} size="xs" />
        <ol className="mt-5 space-y-4">
          <StepRow
            state={research}
            icon={<Globe />}
            label="Recherche des faits"
            detail={
              research === "skipped"
                ? "Recherche web désactivée : seuls les signaux du sujet sont utilisés."
                : research === "current"
                  ? run.message || "Claude vérifie les faits en ligne…"
                  : research === "done"
                    ? sources > 0
                      ? `${sources} ${pluralize(sources, "source trouvée", "sources trouvées")}`
                      : "Terminée"
                    : undefined
            }
          />
          <StepRow
            state={writing}
            icon={<PenLine />}
            label="Écriture"
            detail={
              writing === "current"
                ? run.chars > 0
                  ? `${formatNumber(run.chars)} caractères écrits`
                  : run.message || "Accroches, déroulé, légende…"
                : writing === "done"
                  ? `${formatNumber(run.draftChars ?? run.chars)} caractères`
                  : undefined
            }
          />
          {run.kind === "generate" ? (
            <StepRow
              state={review}
              icon={<SpellCheck2 />}
              label="Relecture critique"
              detail={
                review === "skipped"
                  ? "Seconde passe désactivée dans les réglages."
                  : review === "current"
                    ? run.message || "Claude relit le brouillon en rédacteur en chef exigeant…"
                    : review === "upcoming"
                      ? "Accroche, rétention, différenciation : Claude améliore son brouillon."
                      : undefined
              }
            />
          ) : null}
          <StepRow
            state={finalizing}
            icon={<ShieldCheck />}
            label="Finalisation"
            detail={finalizing === "current" ? run.message || "Vérifications, minutage, garde-fous…" : undefined}
          />
        </ol>
      </div>
    </Card>
  );
}
