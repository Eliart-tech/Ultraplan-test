"use client";

import { Download, FileText, HardDrive, Radar, Search, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { downloadFile } from "@/lib/client/export";
import { pluralize } from "@/lib/client/format";
import {
  MAX_SAVED_ANALYSES,
  MAX_SAVED_SCRIPTS,
  clearHistory,
  exportHistoryJson,
  removeAnalysisFromHistory,
  removeScriptFromHistory,
  useHistory,
  type SaveResult,
} from "@/lib/client/storage";
import { useNow } from "@/lib/client/use-now";
import { AnalysisHistoryCard } from "./analysis-history-card";
import { analysisTitle } from "./analysis-export";
import { ConfirmDialog } from "./confirm-dialog";
import { filterAnalyses, filterScripts } from "./history-search";
import { ScriptHistoryCard } from "./script-history-card";

type HistoryTab = "scripts" | "analyses";

type PendingAction =
  | { kind: "script"; id: string; title: string }
  | { kind: "analysis"; id: string; title: string }
  | { kind: "all" };

const STORAGE_REFUSED =
  "Le navigateur a refusé la modification : le stockage local est peut-être désactivé (navigation privée) ou plein.";

/**
 * /historique — saved scripts and analyses (browser storage only): search,
 * reopen in the Studio, export (.md / JSON), copy, delete with confirmation.
 * Nothing is rendered from storage before hydration (skeleton instead), so
 * the server HTML never disagrees with the browser.
 */
export function HistoryView() {
  const { scripts, analyses, hydrated } = useHistory();
  const now = useNow();
  const [tab, setTab] = useState<HistoryTab | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Until the user picks a tab, open the one that has something to show.
  const activeTab: HistoryTab = tab ?? (scripts.length === 0 && analyses.length > 0 ? "analyses" : "scripts");
  const visibleScripts = useMemo(() => filterScripts(scripts, query), [scripts, query]);
  const visibleAnalyses = useMemo(() => filterAnalyses(analyses, query), [analyses, query]);
  const isEmpty = scripts.length === 0 && analyses.length === 0;

  function exportAll() {
    const day = new Date().toISOString().slice(0, 10);
    downloadFile(`trendscript-historique-${day}.json`, exportHistoryJson(), "application/json");
    setAnnouncement("Export JSON de l'historique téléchargé.");
  }

  function confirmPending() {
    if (!pending) return;
    let result: SaveResult = { ok: true, evicted: 0 };
    let message: string;
    if (pending.kind === "script") {
      result = removeScriptFromHistory(pending.id);
      message = `Script « ${pending.title} » supprimé.`;
    } else if (pending.kind === "analysis") {
      result = removeAnalysisFromHistory(pending.id);
      message = `Analyse « ${pending.title} » supprimée.`;
    } else {
      clearHistory();
      setQuery("");
      message = "Historique effacé.";
    }
    const cleared = pending.kind === "all";
    setPending(null);
    if (!result.ok) {
      setFailure(STORAGE_REFUSED);
      return;
    }
    setFailure(null);
    setAnnouncement(message);
    // The deleted card took the focus with it: land somewhere sensible.
    requestAnimationFrame(() => {
      if (!cleared && searchRef.current) searchRef.current.focus();
      else document.getElementById("contenu")?.focus();
    });
  }

  const dialog = dialogCopy(pending, scripts.length, analyses.length);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Bibliothèque"
        title="Historique"
        description="Chaque script généré et chaque analyse lancée dans le Studio sont enregistrés ici automatiquement. Rouvrez-les, exportez-les ou faites le tri."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={exportAll}
              disabled={!hydrated || isEmpty}
              leftIcon={<Download aria-hidden className="size-4" />}
            >
              Tout exporter (JSON)
            </Button>
            <Button
              variant="ghost"
              onClick={() => setPending({ kind: "all" })}
              disabled={!hydrated || isEmpty}
              leftIcon={<Trash2 aria-hidden className="size-4" />}
              className="hover:bg-danger-soft! hover:text-danger-ink!"
            >
              Tout effacer
            </Button>
          </>
        }
      />

      <StorageNote scripts={hydrated ? scripts.length : null} analyses={hydrated ? analyses.length : null} />

      {failure ? (
        <Alert tone="danger" title="Modification impossible" onDismiss={() => setFailure(null)}>
          {failure}
        </Alert>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {!hydrated ? (
        <HistorySkeleton />
      ) : isEmpty ? (
        <EmptyHistory />
      ) : (
        <section aria-label="Éléments enregistrés" className="flex flex-col gap-4">
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            aria-label={activeTab === "scripts" ? "Rechercher un script" : "Rechercher une analyse"}
            placeholder={
              activeTab === "scripts"
                ? "Rechercher par titre, sujet, angle ou hashtag…"
                : "Rechercher par niche, mot-clé, pays ou sujet…"
            }
            leftIcon={<Search />}
            rightSlot={
              query ? (
                <IconButton
                  label="Effacer la recherche"
                  size="sm"
                  icon={<X aria-hidden className="size-4" />}
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                />
              ) : null
            }
            className="sm:max-w-md [&_input::-webkit-search-cancel-button]:appearance-none"
            autoComplete="off"
            enterKeyHint="search"
          />

          <Tabs<HistoryTab>
            aria-label="Type d'éléments"
            value={activeTab}
            onValueChange={setTab}
            items={[
              {
                value: "scripts",
                label: "Scripts",
                icon: <FileText />,
                count: scripts.length,
                content: (
                  <ResultList
                    total={scripts.length}
                    shown={visibleScripts.length}
                    query={query}
                    noun={["script", "scripts"]}
                    onClearQuery={() => setQuery("")}
                    empty={
                      <EmptyState
                        size="sm"
                        icon={<FileText />}
                        title="Aucun script enregistré pour l'instant"
                        description="Dans le Studio, choisissez un sujet et un angle puis cliquez sur « Générer le script » : chaque script est enregistré ici automatiquement, avec ses réglages."
                        action={
                          <ButtonLink
                            href="/"
                            variant="primary"
                            size="sm"
                            leftIcon={<Sparkles aria-hidden className="size-4" />}
                          >
                            Ouvrir le Studio
                          </ButtonLink>
                        }
                      />
                    }
                  >
                    {visibleScripts.map((entry) => (
                      <ScriptHistoryCard
                        key={entry.id}
                        entry={entry}
                        now={now}
                        onDelete={(item) =>
                          setPending({
                            kind: "script",
                            id: item.id,
                            title: item.script.title?.trim() || "Script sans titre",
                          })
                        }
                      />
                    ))}
                  </ResultList>
                ),
              },
              {
                value: "analyses",
                label: "Analyses",
                icon: <Radar />,
                count: analyses.length,
                content: (
                  <ResultList
                    total={analyses.length}
                    shown={visibleAnalyses.length}
                    query={query}
                    noun={["analyse", "analyses"]}
                    onClearQuery={() => setQuery("")}
                    empty={
                      <EmptyState
                        size="sm"
                        icon={<Radar />}
                        title="Aucune analyse enregistrée pour l'instant"
                        description="Lancez « Analyser les tendances » dans le Studio : les 10 dernières analyses sont conservées ici pour retrouver leurs sujets sans réinterroger les sources."
                        action={
                          <ButtonLink
                            href="/"
                            variant="primary"
                            size="sm"
                            leftIcon={<Sparkles aria-hidden className="size-4" />}
                          >
                            Lancer une analyse
                          </ButtonLink>
                        }
                      />
                    }
                  >
                    {visibleAnalyses.map((analysis) => (
                      <AnalysisHistoryCard
                        key={analysis.id}
                        analysis={analysis}
                        now={now}
                        onDelete={(item) => setPending({ kind: "analysis", id: item.id, title: analysisTitle(item) })}
                      />
                    ))}
                  </ResultList>
                ),
              },
            ]}
          />
        </section>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={dialog.title}
        description={dialog.description}
        confirmLabel={dialog.confirmLabel}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

function dialogCopy(
  pending: PendingAction | null,
  scriptCount: number,
  analysisCount: number,
): { title: string; description: ReactNode; confirmLabel: string } {
  if (pending?.kind === "script") {
    return {
      title: "Supprimer ce script ?",
      description: (
        <p>
          « {pending.title} » sera retiré de l&apos;historique de ce navigateur. C&apos;est définitif : exportez-le
          d&apos;abord si vous voulez le garder.
        </p>
      ),
      confirmLabel: "Supprimer le script",
    };
  }
  if (pending?.kind === "analysis") {
    return {
      title: "Supprimer cette analyse ?",
      description: (
        <p>
          L&apos;analyse « {pending.title} » et ses sujets seront retirés de l&apos;historique. Les scripts déjà générés
          à partir de ces sujets restent disponibles.
        </p>
      ),
      confirmLabel: "Supprimer l'analyse",
    };
  }
  return {
    title: "Effacer tout l'historique ?",
    description: (
      <p>
        {scriptCount} {pluralize(scriptCount, "script", "scripts")} et {analysisCount}{" "}
        {pluralize(analysisCount, "analyse", "analyses")} enregistrés dans ce navigateur seront supprimés
        définitivement. Utilisez « Tout exporter (JSON) » avant si vous voulez en garder une copie.
      </p>
    ),
    confirmLabel: "Tout effacer",
  };
}

interface ResultListProps {
  total: number;
  shown: number;
  query: string;
  noun: [singular: string, plural: string];
  onClearQuery: () => void;
  /** Shown when nothing is saved at all for this tab. */
  empty: ReactNode;
  children: ReactNode;
}

/** Cards grid + search summary + "no result" state for one tab. */
function ResultList({ total, shown, query, noun, onClearQuery, empty, children }: ResultListProps) {
  if (total === 0) return empty;
  const searching = query.trim() !== "";
  return (
    <div className="flex flex-col gap-4">
      {searching ? (
        <p role="status" className="text-sm text-muted">
          <span className="font-semibold tabular-nums text-ink">{shown}</span> {pluralize(shown, noun[0], noun[1])} sur{" "}
          <span className="tabular-nums">{total}</span> pour « <span className="text-ink">{query.trim()}</span> »
        </p>
      ) : null}
      {shown === 0 ? (
        <EmptyState
          size="sm"
          icon={<Search />}
          title="Aucun résultat"
          description="Essayez un autre mot : la recherche porte sur les titres, les sujets et les mots-clés, sans tenir compte des accents ni des majuscules."
          action={
            <Button variant="secondary" size="sm" onClick={onClearQuery}>
              Effacer la recherche
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">{children}</ul>
      )}
    </div>
  );
}

/** Where the history lives and how much it can hold. */
function StorageNote({ scripts, analyses }: { scripts: number | null; analyses: number | null }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface/70 px-4 py-3 text-[0.8125rem] leading-relaxed text-muted">
      <HardDrive aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
      <p>
        <span className="font-medium text-ink">Stocké uniquement dans ce navigateur.</span> Rien n&apos;est envoyé sur
        un serveur ni synchronisé entre vos appareils, et tout disparaît si vous effacez les données du site : exportez
        en JSON pour garder une copie. Capacité :{" "}
        <span className="tabular-nums">
          {scripts ?? "—"}/{MAX_SAVED_SCRIPTS} scripts et {analyses ?? "—"}/{MAX_SAVED_ANALYSES} analyses
        </span>{" "}
        — au-delà, les plus anciens sont remplacés.
      </p>
    </div>
  );
}

function EmptyHistory() {
  const steps = [
    {
      title: "Analysez les tendances",
      text: "Le Radar interroge vos sources ; l'analyse et ses sujets sont enregistrés ici.",
    },
    { title: "Choisissez un sujet et un angle", text: "Rouvrez une analyse plus tard sans réinterroger les sources." },
    { title: "Générez votre script", text: "Chaque version générée ou affinée rejoint l'historique automatiquement." },
  ];
  return (
    <EmptyState
      icon={<FileText />}
      title="Votre historique est vide"
      description="Rien n'a encore été enregistré dans ce navigateur. L'historique se remplit tout seul quand vous utilisez le Studio."
      action={
        <ButtonLink href="/" variant="primary" leftIcon={<Sparkles aria-hidden className="size-4" />}>
          Ouvrir le Studio
        </ButtonLink>
      }
    >
      <ol className="mt-6 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-xl border border-line bg-surface px-4 py-3.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold tabular-nums text-accent-ink">
              {index + 1}
            </span>
            <p className="mt-2 text-sm font-medium text-ink">{step.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.text}</p>
          </li>
        ))}
      </ol>
    </EmptyState>
  );
}

function HistorySkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only" role="status">
        Chargement de l&apos;historique…
      </span>
      <Skeleton className="h-10 w-full rounded-xl sm:max-w-md" />
      <Skeleton className="h-10 w-56 rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-start gap-3.5">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-2 h-4 w-3/4" />
              </div>
            </div>
            <SkeletonText lines={2} className="mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
