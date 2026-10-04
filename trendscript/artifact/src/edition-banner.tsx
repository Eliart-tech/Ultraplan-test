"use client";

import { CircleCheck, FileCode2, Info, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { Container } from "@/components/ui/container";
import { useNow } from "@/lib/client/use-now";
import { cn } from "@/lib/cn";
import { useEditionState } from "./capabilities";
import { ageLabel, frenchDateTime, STALE_AFTER_MS } from "./edition";
import { claudeBannerSentence, liveBannerSentence } from "./edition-text";
import { dismissNotice, useNotices } from "./notices";

/** Dismissal is per snapshot: a new capture shows the banner again. */
const dismissKey = (capturedAt: string) => `trendscript:edition-banner:v2:${capturedAt}`;

function readDismissed(capturedAt: string): boolean {
  try {
    return window.localStorage.getItem(dismissKey(capturedAt)) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(capturedAt: string): void {
  try {
    window.localStorage.setItem(dismissKey(capturedAt), "1");
  } catch {
    // storage blocked: the banner just comes back next time
  }
}

/** Slim, dismissible notice under the header: what is real, live, or server-only here, and how old the snapshot is. */
export function EditionBanner({ capturedAt }: { capturedAt: string }) {
  const state = useEditionState();
  const now = useNow();
  const [dismissed, setDismissed] = useState(() => readDismissed(capturedAt));
  if (dismissed) return null;
  const age = now - Date.parse(capturedAt);
  return (
    <div className="border-b border-line bg-surface/70">
      <Container className="flex items-start gap-2.5 py-2.5 text-[0.8125rem] leading-relaxed text-muted">
        <FileCode2 aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold text-ink">Édition HTML</span> — données réelles : instantané du{" "}
          {frenchDateTime(capturedAt)} (heure de Paris,{" "}
          <span className={cn(age > STALE_AFTER_MS && "font-medium text-warning-ink")}>{ageLabel(Math.max(0, age))}</span>){" "}
          {liveBannerSentence(state)} · {claudeBannerSentence(state)} · Concurrents : chaînes YouTube et profils LinkedIn
          via Firecrawl · Instagram, TikTok, la recherche YouTube, SerpApi, l&apos;engagement LinkedIn et « Ce qui
          cartonne » nécessitent la version serveur (clés API).
        </p>
        <button
          type="button"
          onClick={() => {
            writeDismissed(capturedAt);
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
