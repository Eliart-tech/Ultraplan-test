"use client";

import { ArrowRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import { Stepper, type StepItem } from "@/components/ui/stepper";
import { useHydrated } from "@/lib/client/storage";
import { AngleStep } from "./angle-step";
import { RadarStep } from "./radar-step";
import { ScriptStep } from "./script-step";
import { StudioSkeleton } from "./studio-skeleton";
import { STUDIO_STEPS, StudioProvider, reachableSteps, useStudio, type StudioStep } from "./studio-store";
import { TopicsStep } from "./topics-step";

const STEP_META: Record<StudioStep, { label: string; short: string; title: string; description: string }> = {
  radar: {
    label: "Radar",
    short: "Sources et ciblage",
    title: "Radar des tendances",
    description:
      "Choisissez votre marché, votre niche et vos sources : TrendScript collecte les signaux réels du moment, sans aucune donnée inventée.",
  },
  sujets: {
    label: "Sujets",
    short: "Ce qui monte",
    title: "Les sujets qui montent",
    description:
      "Classés par score : momentum, portée, présence multi-plateforme, fraîcheur et pertinence pour votre niche. Chaque sujet s'appuie sur des preuves.",
  },
  angle: {
    label: "Angle",
    short: "Votre point de vue",
    title: "Choisissez votre angle",
    description: "Le même sujet peut donner dix vidéos différentes : choisissez le point de vue qui vous ressemble.",
  },
  script: {
    label: "Script",
    short: "Prêt à tourner",
    title: "Votre script",
    description: "Réglez le format et le style, puis générez un script minuté, sourcé et prêt à tourner.",
  },
};

/**
 * The Studio page: reads `?analyse=` / `?script=` (links from the history
 * page) and mounts the store once browser storage can be read. Must be
 * rendered inside <Suspense> (useSearchParams).
 */
export function Studio() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  if (!hydrated) return <StudioSkeleton />;
  return (
    <StudioProvider entry={{ analyseId: params.get("analyse"), scriptId: params.get("script") }}>
      <StudioShell />
    </StudioProvider>
  );
}

/** The wizard itself (step bar, step title, current step); needs <StudioProvider>. */
export function StudioShell() {
  const { state, dispatch } = useStudio();
  const { draft, analysisRun, scriptRun, notice, announcement } = state;
  const step = draft.step;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);

  // Step change: bring the new step's title into view and move focus to it,
  // so keyboard and screen-reader users land at the start of the new step.
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const heading = headingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const top = heading.getBoundingClientRect().top + window.scrollY - 140;
    if (window.scrollY > top) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
    }
  }, [step]);

  const reachable = reachableSteps(draft);
  const currentIndex = STUDIO_STEPS.indexOf(step);
  const steps: StepItem<StudioStep>[] = STUDIO_STEPS.map((id, index) => ({
    id,
    label: STEP_META[id].label,
    description: STEP_META[id].short,
    status: index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming",
    clickable: id !== step && reachable[id],
  }));
  const meta = STEP_META[step];

  return (
    <>
      <div className="z-30 border-b border-line glass sm:sticky sm:top-[4.0625rem]">
        <Container size="xl" className="flex min-h-[3.25rem] items-center justify-between gap-4 py-2">
          <Stepper
            steps={steps}
            onStepSelect={(id) => dispatch({ type: "goTo", step: id })}
            aria-label="Étapes du Studio"
            className="min-w-0 flex-1"
          />
          <RunIndicator
            analysisRunning={analysisRun.status === "running" && step !== "radar"}
            scriptRunning={scriptRun.status === "running" && step !== "script"}
            onOpen={(target) => dispatch({ type: "goTo", step: target })}
          />
        </Container>
      </div>

      <Container size="xl" className="py-8 sm:py-10">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-ink">
            Studio · Étape {currentIndex + 1} sur {STUDIO_STEPS.length}
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-ink outline-none sm:text-display"
          >
            {meta.title}
          </h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{meta.description}</p>
        </header>

        {notice ? (
          <Alert tone="warning" className="mt-6" onDismiss={() => dispatch({ type: "dismissNotice" })}>
            {notice}
          </Alert>
        ) : null}

        <div key={step} className="mt-6 animate-fade-in sm:mt-8">
          {step === "radar" ? <RadarStep /> : null}
          {step === "sujets" ? <TopicsStep /> : null}
          {step === "angle" ? <AngleStep /> : null}
          {step === "script" ? <ScriptStep /> : null}
        </div>
      </Container>

      {/* One polite live region for the whole Studio: progress, results, errors. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

interface RunIndicatorProps {
  analysisRunning: boolean;
  scriptRunning: boolean;
  onOpen: (step: StudioStep) => void;
}

/** Pill shown in the step bar while a request runs on another step. */
function RunIndicator({ analysisRunning, scriptRunning, onOpen }: RunIndicatorProps) {
  if (!analysisRunning && !scriptRunning) return null;
  const target: StudioStep = analysisRunning ? "radar" : "script";
  return (
    <button
      type="button"
      onClick={() => onOpen(target)}
      className="hidden h-8 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink shadow-xs transition-colors duration-150 hover:bg-surface-2 sm:inline-flex"
    >
      <Spinner size="xs" className="text-accent" />
      {analysisRunning ? "Analyse en cours" : "Script en cours"}
      <ArrowRight aria-hidden className="size-3.5 text-muted" />
    </button>
  );
}
