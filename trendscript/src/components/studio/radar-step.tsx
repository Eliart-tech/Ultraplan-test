"use client";

import { ArrowRight, Info, Radar, Sparkles, Target, UserRound } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ChipInput } from "@/components/ui/chip-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { formatRelative } from "@/lib/client/format";
import { useProfile } from "@/lib/client/storage";
import { useNow } from "@/lib/client/use-now";
import { useServerStatus } from "@/lib/client/use-server-status";
import type { AnalyzeRequest } from "@/lib/types";
import { AnalysisProgress } from "./analysis-progress";
import { SourcePicker } from "./source-picker";
import {
  COUNTRIES,
  LANGUAGES,
  MAX_KEYWORDS,
  MAX_TOPICS,
  MIN_TOPICS,
  countryLabel,
  countryLanguage,
  languageLabel,
} from "./studio-options";
import { useStudio } from "./studio-store";
import { effectiveSources } from "./studio-utils";

/**
 * Step 1 — Radar: market, niche, keywords and sources, then a streamed
 * analysis with live per-source progress.
 */
export function RadarStep() {
  const { state, dispatch, actions } = useStudio();
  const { draft, analysisRun: run } = state;
  const { form } = draft;
  const { status, error, loading, reload } = useServerStatus();
  const { profile } = useProfile();
  const now = useNow();
  const [attempted, setAttempted] = useState(false);

  const statuses = status?.sources ?? null;
  const selected = effectiveSources(form.sources, statuses);
  const noSource = statuses !== null && selected.length === 0;
  const aiConfigured = status?.ai.configured ?? null;

  function buildRequest(): AnalyzeRequest {
    return {
      geo: form.geo,
      language: form.language,
      niche: form.niche.trim(),
      keywords: form.keywords,
      sources: selected,
      maxTopics: form.maxTopics,
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (!statuses || selected.length === 0) return;
    void actions.runAnalysis(buildRequest());
  }

  function changeGeo(geo: string) {
    // Follow the country's language unless the user picked another one.
    const previousDefault = countryLanguage(form.geo);
    const nextDefault = countryLanguage(geo);
    const language = form.language === previousDefault && nextDefault ? nextDefault : form.language;
    dispatch({ type: "updateForm", patch: { geo, language } });
  }

  if (run.status !== "idle" && run.request) {
    return (
      <div className="mx-auto max-w-3xl">
        <AnalysisProgress
          run={run}
          statuses={statuses}
          onCancel={actions.cancelAnalysis}
          onRetry={() => {
            if (run.request) void actions.runAnalysis(run.request);
          }}
          onEdit={() => dispatch({ type: "analysisReset" })}
        />
      </div>
    );
  }

  const profileNiche = profile.niche.trim();
  const sourcesError = attempted && noSource ? "Choisissez au moins une source configurée." : null;

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Paramètres de l'analyse">
      {draft.analysis ? (
        <Alert
          tone="info"
          role="none"
          icon={<Radar />}
          className="mb-6"
          action={
            <Button
              size="sm"
              variant="secondary"
              rightIcon={<ArrowRight aria-hidden className="size-4" />}
              onClick={() => dispatch({ type: "goTo", step: "sujets" })}
            >
              Voir les sujets
            </Button>
          }
        >
          Dernière analyse : {draft.analysis.topics.length} sujet{draft.analysis.topics.length > 1 ? "s" : ""}{" "}
          ({formatRelative(draft.analysis.createdAt, now)}). Une nouvelle analyse la remplacera dans le Studio ; elle reste
          disponible dans l&apos;historique.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5 xl:col-span-4">
          <Card as="section" aria-label="Ciblage">
            <CardHeader title="Ciblage" description="Où et pour qui chercher les tendances." icon={<Target />} />
            <CardBody className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pays">
                  <Select value={form.geo} onChange={(event) => changeGeo(event.target.value)} options={COUNTRIES} />
                </Field>
                <Field label="Langue">
                  <Select
                    value={form.language}
                    onChange={(event) => dispatch({ type: "updateForm", patch: { language: event.target.value } })}
                    options={LANGUAGES}
                  />
                </Field>
              </div>

              <Field
                label="Niche"
                optional
                hint="Sert à évaluer la pertinence de chaque sujet pour votre audience."
                labelAside={
                  profileNiche && profileNiche !== form.niche.trim() ? (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "updateForm", patch: { niche: profileNiche.slice(0, 300) } })}
                      className="inline-flex items-center gap-1 rounded font-medium text-accent-ink transition-colors duration-150 hover:text-accent"
                    >
                      <UserRound aria-hidden className="size-3.5" />
                      Ma niche
                    </button>
                  ) : null
                }
              >
                <Input
                  value={form.niche}
                  maxLength={300}
                  onChange={(event) => dispatch({ type: "updateForm", patch: { niche: event.target.value } })}
                  placeholder="Ex. : finance perso pour jeunes actifs"
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Mots-clés et hashtags"
                optional
                hint={`Entrée ou virgule pour ajouter, ${MAX_KEYWORDS} maximum. Ils guident Google Actualités, YouTube, Instagram, TikTok et SerpApi vers votre niche.`}
              >
                <ChipInput
                  value={form.keywords}
                  onValueChange={(keywords) => dispatch({ type: "updateForm", patch: { keywords } })}
                  max={MAX_KEYWORDS}
                  placeholder={form.keywords.length ? "Ajouter…" : "Ex. : budget, épargne, #investir"}
                />
              </Field>

              <Field
                label="Nombre de sujets"
                labelAside={
                  <span className="font-semibold tabular-nums text-ink">
                    {form.maxTopics} sujets
                  </span>
                }
              >
                <Slider
                  value={form.maxTopics}
                  onValueChange={(maxTopics) => dispatch({ type: "updateForm", patch: { maxTopics } })}
                  min={MIN_TOPICS}
                  max={MAX_TOPICS}
                  hideBubble
                  formatValue={(value) => `${value} sujets`}
                  minLabel={`${MIN_TOPICS}`}
                  maxLabel={`${MAX_TOPICS}`}
                />
              </Field>
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-7 xl:col-span-8">
          <SourcePicker
            sources={statuses}
            selected={selected}
            onChange={(sources) => dispatch({ type: "updateForm", patch: { sources } })}
            hasKeywords={form.keywords.length > 0}
            loading={loading}
            error={error}
            onRetry={reload}
            invalid={sourcesError}
          />
        </div>
      </div>

      <LaunchDock
        summary={`${countryLabel(form.geo)} · ${languageLabel(form.language)} · ${
          statuses ? `${selected.length} source${selected.length > 1 ? "s" : ""}` : "sources…"
        } · ${form.maxTopics} sujets`}
        aiConfigured={aiConfigured}
        disabled={!statuses}
        label={!statuses && loading ? "Chargement des sources…" : "Analyser les tendances"}
        warning={noSource ? "Activez au moins une source." : null}
      />
    </form>
  );
}

interface LaunchDockProps {
  summary: string;
  aiConfigured: boolean | null;
  disabled: boolean;
  label: string;
  warning: string | null;
}

/** Floating action bar: always-visible recap of the request and the submit button. */
function LaunchDock({ summary, aiConfigured, disabled, label, warning }: LaunchDockProps) {
  return (
    <div className="sticky bottom-3 z-20 mt-6 rounded-2xl border border-line px-4 py-3 shadow-pop glass sm:bottom-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{summary}</p>
          {warning ? (
            <p className="mt-0.5 text-xs font-medium text-warning-ink">{warning}</p>
          ) : aiConfigured === false ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <Info aria-hidden className="size-3.5 shrink-0 text-warning-ink" />
              <span>
                Mode sans IA : sujets regroupés automatiquement, sans angles.{" "}
                <Link href="/reglages" className="font-medium text-accent-ink hover:underline">
                  Activer Claude
                </Link>
              </span>
            </p>
          ) : aiConfigured ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <Sparkles aria-hidden className="size-3.5 shrink-0 text-accent" />
              Synthèse par Claude et 3 angles par sujet · 30 s à 2 min
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={disabled}
          leftIcon={<Radar aria-hidden className="size-5" />}
          className="w-full sm:w-auto"
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
