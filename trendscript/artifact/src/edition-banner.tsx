"use client";

import { CircleCheck, FileCode2, Info, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import { useEditionState, type EditionState } from "./capabilities";
import { frenchDateTime } from "./edition";
import { dismissNotice, useNotices } from "./notices";

const DISMISS_KEY = "trendscript:edition-banner:v1";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // storage blocked: the banner just comes back next time
  }
}

function liveSentence(state: EditionState): string {
  switch (state.firecrawl) {
    case "available":
      return "+ Google Actualités et Tendances en direct via votre connecteur Firecrawl";
    case "blocked":
      return `(pas de données en direct : ${state.firecrawlNote ?? "Firecrawl refusé"})`;
    case "absent":
      return "(pas de connecteur Firecrawl ici : pas de données en direct)";
    default:
      return "+ données en direct via votre connecteur Firecrawl (vérification…)";
  }
}

function claudeSentence(state: EditionState): string {
  switch (state.claude) {
    case "available":
      return "Claude via votre compte claude.ai";
    case "blocked":
      return `mode sans IA (${state.claudeNote ?? "Claude refusé"})`;
    case "absent":
      return "Claude indisponible hors de claude.ai : mode sans IA";
    default:
      return "Claude via votre compte claude.ai (vérification…)";
  }
}

/** Slim, dismissible notice under the header: what is real, live, or server-only here. */
export function EditionBanner({ capturedAt }: { capturedAt: string }) {
  const state = useEditionState();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;
  return (
    <div className="border-b border-line bg-surface/70">
      <Container className="flex items-start gap-2.5 py-2.5 text-[0.8125rem] leading-relaxed text-muted">
        <FileCode2 aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold text-ink">Édition HTML</span> — données réelles : instantané du{" "}
          {frenchDateTime(capturedAt)} {liveSentence(state)} · {claudeSentence(state)} · Instagram, TikTok, YouTube et
          SerpApi nécessitent la version serveur (clés API).
        </p>
        <button
          type="button"
          onClick={() => {
            writeDismissed();
            setDismissed(true);
          }}
          aria-label="Masquer ce bandeau"
          title="Masquer ce bandeau"
          className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-faint transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </Container>
    </div>
  );
}

const TONE_ICON = {
  success: <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success-ink" />,
  info: <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-ink" />,
  warning: <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-ink" />,
};

/** Download / copy feedback, bottom of the screen. */
export function Toaster() {
  const notices = useNotices();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-4"
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={cn(
            "pointer-events-auto flex w-full max-w-md animate-pop-in items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-pop",
          )}
        >
          {TONE_ICON[notice.tone]}
          <p className="min-w-0 flex-1 leading-relaxed">{notice.text}</p>
          <button
            type="button"
            onClick={() => dismissNotice(notice.id)}
            aria-label="Fermer"
            className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-faint hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
