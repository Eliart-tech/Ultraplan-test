"use client";

import { ArrowLeft, FileSearch, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/history/confirm-dialog";
import { countryLanguage } from "@/components/studio/studio-options";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import {
  isProfileFilled,
  removeViralReport,
  saveStudioHandoff,
  useHydrated,
  useProfile,
  useViralReports,
  viralReportKey,
} from "@/lib/client/storage";
import { useNow } from "@/lib/client/use-now";
import { useServerStatus } from "@/lib/client/use-server-status";
import type { ViralPlatform, ViralReport, ViralRequest } from "@/lib/types";
import { viralIdeaToStudio } from "@/lib/viral/brief";
import { SavedViralReports } from "./saved-viral";
import { ViralForm, initialViralForm, type ViralFormValues } from "./viral-form";
import { ViralProgress } from "./viral-progress";
import { AudienceExplainer, ViralReportView } from "./viral-report";
import { cancelViralRun, resetViralRun, startViralRun, useViralRun, type ViralRun } from "./viral-run";
import { ViralSkeleton } from "./viral-skeleton";
import { ideaScriptPlatform, keywordsLabel, viralReportHref, viralReportTitle } from "./viral-utils";

/**
 * /ce-qui-cartonne — reads `?rapport=<key>` and mounts once browser storage
 * can be read (saved reports and the profile live in localStorage). Must be
 * rendered inside <Suspense> (useSearchParams).
 */
export function ViralView() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  if (!hydrated) return <ViralSkeleton />;
  return <ViralScreen selectedKey={params.get("rapport")} />;
}

/** Screen-reader summary of the run. */
function runAnnouncement(run: ViralRun): string {
  if (run.status === "running") {
    if (run.step === "enrich") return "Récupération des abonnés des auteurs…";
    if (run.step === "analysis") return "Analyse par Claude en cours…";
    return "Collecte des vidéos…";
  }
  if (run.status === "done") return "Analyse terminée : le rapport est prêt.";
  if (run.status === "error") return `Échec de l'analyse : ${run.error ?? ""}`;
  if (run.status === "cancelled") return "Analyse annulée.";
  return "";
}

function ViralScreen({ selectedKey }: { selectedKey: string | null }) {
  const router = useRouter();
  const { reports } = useViralReports();
  const run = useViralRun();
  const { status } = useServerStatus();
  const { profile } = useProfile();
  const now = useNow();
  // The screen mounts after hydration: the profile is the saved one.
  const [form, setForm] = useState<ViralFormValues>(() => initialViralForm(profile));
  const [pendingDelete, setPendingDelete] = useState<ViralReport | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const mounted = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const capabilities = status?.viral ?? null;
  const aiConfigured = status?.ai.configured ?? null;
  const running = run.status === "running";

  async function analyse(request: ViralRequest) {
    if (selectedKey) router.push("/ce-qui-cartonne");
    else if (window.matchMedia("(max-width: 1023px)").matches) {
      // On phones the progress sits below the form.
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      progressRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
    const report = await startViralRun(request);
    if (report && mounted.current) router.push(viralReportHref(viralReportKey(report)));
  }

  function submitForm(platforms: ViralPlatform[]) {
    void analyse({
      platforms,
      keywords: form.keywords,
      niche: form.niche.trim(),
      periodDays: form.periodDays,
      geo: form.geo,
      language: countryLanguage(form.geo) ?? "fr",
      profile,
    });
  }

  function rerun(report: ViralReport) {
    const { request } = report;
    setForm({
      niche: request.niche,
      keywords: request.keywords,
      platforms: request.platforms,
      periodDays: request.periodDays,
      geo: request.geo,
    });
    void analyse({ ...request, profile });
  }

  function retry() {
    if (run.request) void analyse({ ...run.request, profile });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const key = viralReportKey(pendingDelete);
    removeViralReport(key);
    setPendingDelete(null);
    if (selectedKey === key) router.push("/ce-qui-cartonne");
  }

  function writeIdea(report: ViralReport, ideaIndex: number) {
    setHandoffError(null);
    let ok = false;
    try {
      const { topic, signals, angle } = viralIdeaToStudio(report, ideaIndex);
      const idea = report.patterns?.ideas[ideaIndex];
      const scriptPlatform = idea ? ideaScriptPlatform(report, idea) : undefined;
      ok = saveStudioHandoff({
        topic,
        signals,
        angle,
        viralKey: viralReportKey(report),
        ...(scriptPlatform ? { scriptPlatform } : {}),
        label: `« ${viralReportTitle(report)} »`,
      });
    } catch (error) {
      console.error("[ce-qui-cartonne] idée → Studio", error);
    }
    if (!ok) {
      setHandoffError(
        "Impossible de transmettre cette idée au Studio : le stockage de session de ce navigateur est indisponible (navigation privée ?).",
      );
      return;
    }
    router.push("/");
  }

  const selected =
    selectedKey !== null
      ? (reports.find((report) => viralReportKey(report) === selectedKey) ??
        (run.report && viralReportKey(run.report) === selectedKey ? run.report : null))
      : null;
  const saveFailed = Boolean(selected && run.report?.id === selected.id && run.saved && !run.saved.ok);

  return (
    <Container size="xl" className="py-8 sm:py-10">
      {selectedKey !== null ? (
        <div className="flex flex-col gap-6">
          <nav aria-label="Fil d'Ariane">
            <Link
              href="/ce-qui-cartonne"
              className="inline-flex items-center gap-1.5 rounded-lg py-1 text-sm font-medium text-muted transition-colors duration-150 hover:text-ink"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Toutes mes analyses
            </Link>
          </nav>

          {running ? (
            <Alert
              tone="info"
              size="sm"
              icon={<Spinner size="sm" />}
              action={
                <ButtonLink href="/ce-qui-cartonne" size="sm" variant="secondary">
                  Suivre l&apos;analyse
                </ButtonLink>
              }
            >
              Analyse de « {run.request ? keywordsLabel(run.request.keywords) : "votre niche"} » en cours.
            </Alert>
          ) : null}

          {handoffError ? (
            <Alert tone="danger" onDismiss={() => setHandoffError(null)}>
              {handoffError}
            </Alert>
          ) : null}

          {selected ? (
            <ViralReportView
              report={selected}
              now={now}
              aiConfigured={aiConfigured}
              busy={running}
              onRerun={() => rerun(selected)}
              onDelete={() => setPendingDelete(selected)}
              onWriteIdea={(ideaIndex) => writeIdea(selected, ideaIndex)}
              notice={
                saveFailed ? (
                  <Alert tone="warning" size="sm">
                    Ce rapport n&apos;a pas pu être enregistré : le stockage de ce navigateur est plein ou désactivé.
                    Supprimez d&apos;anciennes analyses ou d&apos;anciens scripts pour faire de la place.
                  </Alert>
                ) : null
              }
            />
          ) : (
            <EmptyState
              icon={<FileSearch />}
              title="Rapport introuvable"
              description="Cette analyse n'est pas (ou plus) enregistrée dans ce navigateur : elle a pu être supprimée, remplacée par une analyse plus récente des mêmes mots-clés, ou faite sur un autre appareil."
              action={
                <ButtonLink href="/ce-qui-cartonne" variant="primary">
                  Voir mes analyses
                </ButtonLink>
              }
            />
          )}
        </div>
      ) : (
        <>
          <PageHeader
            eyebrow="Labo · Instagram, TikTok, YouTube"
            title="Ce qui cartonne"
            description="Les vidéos de votre niche qui explosent bien au-delà de l'audience de leur créateur, pourquoi elles marchent, et quoi publier pour gagner des vues et des abonnés. Que des vidéos réelles, liées, chiffres à l'appui."
          />
          <AudienceExplainer className="mt-5 max-w-4xl" />

          {run.status === "done" && run.report ? (
            <Alert
              tone={run.saved?.ok === false ? "warning" : "success"}
              className="mt-6"
              title="Analyse terminée"
              onDismiss={resetViralRun}
              action={
                <ButtonLink href={viralReportHref(viralReportKey(run.report))} size="sm" variant="primary">
                  Ouvrir le rapport
                </ButtonLink>
              }
            >
              Le rapport « {viralReportTitle(run.report)} » est prêt
              {run.saved?.ok === false
                ? ", mais n'a pas pu être enregistré (stockage du navigateur plein ou désactivé)."
                : run.saved && run.saved.evicted > 0
                  ? ` (${run.saved.evicted} ancien${run.saved.evicted > 1 ? "s" : ""} rapport${run.saved.evicted > 1 ? "s" : ""} supprimé${run.saved.evicted > 1 ? "s" : ""} pour faire de la place).`
                  : "."}
            </Alert>
          ) : null}

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <ViralForm
              values={form}
              onChange={(patch) => setForm((previous) => ({ ...previous, ...patch }))}
              onSubmit={submitForm}
              capabilities={capabilities}
              aiConfigured={aiConfigured}
              profileFilled={isProfileFilled(profile)}
              busy={running}
            />

            <div ref={progressRef} className="flex min-w-0 scroll-mt-28 flex-col gap-6">
              {running ? <ViralProgress run={run} aiConfigured={aiConfigured} onCancel={cancelViralRun} /> : null}

              {run.status === "error" ? (
                <Alert
                  tone="danger"
                  title="L'analyse a échoué"
                  onDismiss={resetViralRun}
                  action={
                    run.request ? (
                      <Button size="sm" leftIcon={<RotateCcw aria-hidden className="size-4" />} onClick={retry}>
                        Réessayer
                      </Button>
                    ) : null
                  }
                >
                  {run.error}
                </Alert>
              ) : null}

              {run.status === "cancelled" ? (
                <Alert
                  tone="info"
                  onDismiss={resetViralRun}
                  action={
                    run.request ? (
                      <Button size="sm" variant="secondary" leftIcon={<RotateCcw aria-hidden className="size-4" />} onClick={retry}>
                        Relancer
                      </Button>
                    ) : null
                  }
                >
                  Analyse annulée.
                </Alert>
              ) : null}

              <SavedViralReports reports={reports} now={now} busy={running} onRerun={rerun} onDelete={setPendingDelete} />
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Supprimer l'analyse « ${pendingDelete ? viralReportTitle(pendingDelete) : ""} » ?`}
        description="Le rapport est effacé de ce navigateur et ne servira plus à vos scripts. Vous pourrez relancer l'analyse à tout moment."
        confirmLabel="Supprimer"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {runAnnouncement(run)}
      </p>
    </Container>
  );
}
