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
  removeCompetitorReport,
  reportKey,
  saveStudioHandoff,
  useCompetitors,
  useHydrated,
  useProfile,
} from "@/lib/client/storage";
import { useNow } from "@/lib/client/use-now";
import { useServerStatus } from "@/lib/client/use-server-status";
import { ideaToStudio } from "@/lib/creators/idea";
import type { CompetitorReport, CompetitorRequest, CreatorPlatform } from "@/lib/types";
import { CompetitorForm, DEFAULT_FORM, type CompetitorFormValues } from "./competitor-form";
import { CompetitorProgress } from "./competitor-progress";
import {
  cancelCompetitorRun,
  resetCompetitorRun,
  startCompetitorRun,
  useCompetitorRun,
  type CompetitorRun,
} from "./competitor-run";
import { CompetitorsSkeleton } from "./competitors-skeleton";
import { reportHref, scriptPlatformFor } from "./report-utils";
import { ReportPreview, ReportView } from "./report-view";
import { SavedCompetitors } from "./saved-competitors";

/**
 * /concurrents — reads `?rapport=<platform:handle>` and mounts once browser
 * storage can be read (saved reports live in localStorage). Must be rendered
 * inside <Suspense> (useSearchParams).
 */
export function CompetitorsView() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  if (!hydrated) return <CompetitorsSkeleton />;
  return <CompetitorsScreen selectedKey={params.get("rapport")} />;
}

/** Screen-reader summary of the run. */
function runAnnouncement(run: CompetitorRun): string {
  if (run.status === "running") {
    if (run.step === "stats") return "Calcul des statistiques…";
    if (run.step === "analysis") return "Analyse par Claude en cours…";
    return "Récupération des publications…";
  }
  if (run.status === "done") return "Analyse terminée : le rapport est prêt.";
  if (run.status === "error") return `Échec de l'analyse : ${run.error ?? ""}`;
  if (run.status === "cancelled") return "Analyse annulée.";
  return "";
}

/** Posts to re-analyse: at least the default, more if the previous report had more. */
function reanalysePosts(report: CompetitorReport): number {
  const rounded = Math.ceil(report.stats.postCount / 5) * 5;
  return Math.min(50, Math.max(DEFAULT_FORM.maxPosts, rounded));
}

function CompetitorsScreen({ selectedKey }: { selectedKey: string | null }) {
  const router = useRouter();
  const { reports } = useCompetitors();
  const run = useCompetitorRun();
  const { status } = useServerStatus();
  const { profile } = useProfile();
  const now = useNow();
  const [form, setForm] = useState<CompetitorFormValues>(DEFAULT_FORM);
  const [pendingDelete, setPendingDelete] = useState<CompetitorReport | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const mounted = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const capabilities = status?.creators ?? null;
  const aiConfigured = status?.ai.configured ?? null;
  const running = run.status === "running";

  async function analyse(request: CompetitorRequest) {
    if (selectedKey) router.push("/concurrents");
    else if (window.matchMedia("(max-width: 1023px)").matches) {
      // On phones the progress sits below the form.
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      progressRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
    const report = await startCompetitorRun(request);
    if (report && mounted.current) router.push(reportHref(reportKey(report)));
  }

  function submitForm(platform: CreatorPlatform) {
    const focus = form.focus.trim();
    void analyse({
      platform,
      handle: form.handle.trim(),
      ...(focus ? { focus } : {}),
      maxPosts: form.maxPosts,
      profile,
      language: countryLanguage(form.geo) ?? "fr",
      geo: form.geo,
    });
  }

  function reanalyse(report: CompetitorReport) {
    const { account } = report.data;
    const values: CompetitorFormValues = {
      ...form,
      platform: account.platform,
      handle: account.handle,
      focus: report.focus ?? "",
      maxPosts: reanalysePosts(report),
    };
    setForm(values);
    void analyse({
      platform: account.platform,
      handle: account.handle,
      ...(report.focus?.trim() ? { focus: report.focus.trim() } : {}),
      maxPosts: values.maxPosts,
      profile,
      language: countryLanguage(values.geo) ?? "fr",
      geo: values.geo,
    });
  }

  function retry() {
    if (run.request) void analyse({ ...run.request, profile });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const key = reportKey(pendingDelete);
    removeCompetitorReport(key);
    setPendingDelete(null);
    if (selectedKey === key) router.push("/concurrents");
  }

  function writeIdea(report: CompetitorReport, ideaIndex: number) {
    setHandoffError(null);
    let ok = false;
    try {
      const { topic, signals, angle } = ideaToStudio(report, ideaIndex);
      ok = saveStudioHandoff({
        topic,
        signals,
        angle,
        competitorKey: reportKey(report),
        scriptPlatform: scriptPlatformFor(report.data.account.platform),
        label: `@${report.data.account.handle}`,
      });
    } catch (error) {
      console.error("[concurrents] idée → Studio", error);
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
      ? (reports.find((report) => reportKey(report) === selectedKey) ??
        (run.report && reportKey(run.report) === selectedKey ? run.report : null))
      : null;
  const saveFailed = Boolean(selected && run.report?.id === selected.id && run.saved && !run.saved.ok);

  return (
    <Container size="xl" className="py-8 sm:py-10">
      {selectedKey !== null ? (
        <div className="flex flex-col gap-6">
          <nav aria-label="Fil d'Ariane">
            <Link
              href="/concurrents"
              className="inline-flex items-center gap-1.5 rounded-lg py-1 text-sm font-medium text-muted transition-colors duration-150 hover:text-ink"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Tous les concurrents
            </Link>
          </nav>

          {running ? (
            <Alert
              tone="info"
              size="sm"
              icon={<Spinner size="sm" />}
              action={
                <ButtonLink href="/concurrents" size="sm" variant="secondary">
                  Suivre l&apos;analyse
                </ButtonLink>
              }
            >
              Analyse de {run.request?.handle ?? "un créateur"} en cours.
            </Alert>
          ) : null}

          {handoffError ? (
            <Alert tone="danger" onDismiss={() => setHandoffError(null)}>
              {handoffError}
            </Alert>
          ) : null}

          {selected ? (
            <ReportView
              report={selected}
              now={now}
              aiConfigured={aiConfigured}
              busy={running}
              onReanalyse={() => reanalyse(selected)}
              onDelete={() => setPendingDelete(selected)}
              onWriteIdea={(ideaIndex) => writeIdea(selected, ideaIndex)}
              notice={
                saveFailed ? (
                  <Alert tone="warning" size="sm">
                    Ce rapport n&apos;a pas pu être enregistré : le stockage de ce navigateur est plein ou désactivé.
                    Supprime d&apos;anciens concurrents ou scripts pour faire de la place.
                  </Alert>
                ) : null
              }
            />
          ) : (
            <EmptyState
              icon={<FileSearch />}
              title="Rapport introuvable"
              description="Ce concurrent n'est pas (ou plus) enregistré dans ce navigateur : il a pu être supprimé, ou analysé sur un autre appareil."
              action={
                <ButtonLink href="/concurrents" variant="primary">
                  Voir les concurrents suivis
                </ButtonLink>
              }
            />
          )}
        </div>
      ) : (
        <>
          <PageHeader
            eyebrow="Veille concurrentielle"
            title="Concurrents"
            description="Analyse un créateur à partir de son pseudo : ce qu'il publie, ce qui cartonne vraiment et fait venir des abonnés, et comment t'en démarquer. Que des publications réelles, liées, chiffres à l'appui."
          />

          {run.status === "done" && run.report ? (
            <Alert
              tone={run.saved?.ok === false ? "warning" : "success"}
              className="mt-6"
              title="Analyse terminée"
              onDismiss={resetCompetitorRun}
              action={
                <ButtonLink href={reportHref(reportKey(run.report))} size="sm" variant="primary">
                  Ouvrir le rapport
                </ButtonLink>
              }
            >
              Le rapport de @{run.report.data.account.handle} est prêt
              {run.saved?.ok === false
                ? ", mais n'a pas pu être enregistré (stockage du navigateur plein ou désactivé)."
                : run.saved && run.saved.evicted > 0
                  ? ` (${run.saved.evicted} ancien${run.saved.evicted > 1 ? "s" : ""} rapport${run.saved.evicted > 1 ? "s" : ""} supprimé${run.saved.evicted > 1 ? "s" : ""} pour faire de la place).`
                  : "."}
            </Alert>
          ) : null}

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <CompetitorForm
              values={form}
              onChange={(patch) => setForm((previous) => ({ ...previous, ...patch }))}
              onSubmit={submitForm}
              capabilities={capabilities}
              aiConfigured={aiConfigured}
              profileFilled={isProfileFilled(profile)}
              busy={running}
            />

            <div ref={progressRef} className="flex min-w-0 scroll-mt-28 flex-col gap-6">
              {running ? <CompetitorProgress run={run} aiConfigured={aiConfigured} onCancel={cancelCompetitorRun} /> : null}

              {run.status === "error" ? (
                <Alert
                  tone="danger"
                  title="L'analyse a échoué"
                  onDismiss={resetCompetitorRun}
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
                  onDismiss={resetCompetitorRun}
                  action={
                    run.request ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<RotateCcw aria-hidden className="size-4" />}
                        onClick={retry}
                      >
                        Relancer
                      </Button>
                    ) : null
                  }
                >
                  Analyse annulée.
                </Alert>
              ) : null}

              {running && run.preview ? (
                <ReportPreview
                  now={now}
                  report={{
                    id: "apercu",
                    createdAt: run.preview.data.fetchedAt,
                    mode: "stats",
                    data: run.preview.data,
                    stats: run.preview.stats,
                    notes: [],
                  }}
                />
              ) : (
                <SavedCompetitors
                  reports={reports}
                  now={now}
                  busy={running}
                  onReanalyse={reanalyse}
                  onDelete={setPendingDelete}
                />
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Supprimer l'analyse de @${pendingDelete?.data.account.handle ?? ""} ?`}
        description="Le rapport est effacé de ce navigateur et ne servira plus à différencier tes scripts. Tu pourras le ré-analyser à tout moment."
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
