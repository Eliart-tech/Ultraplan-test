"use client";

import { Maximize2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/client/format";
import { splitPlaceholders } from "./studio-utils";

type PrompterSize = "md" | "lg" | "xl";

const SIZES: Record<PrompterSize, string> = {
  md: "text-lg leading-relaxed",
  lg: "text-xl leading-relaxed sm:text-2xl",
  xl: "text-2xl leading-snug sm:text-[2rem]",
};

function SizeGlyph({ className, name }: { className: string; name: string }) {
  return (
    <>
      <span aria-hidden className={cn("font-semibold", className)}>
        A
      </span>
      <span className="sr-only">{name}</span>
    </>
  );
}

export interface TeleprompterProps {
  text: string;
  wordCount?: number;
  estimatedDurationSec?: number;
}

/**
 * Teleprompter view of the voice-over: large, high-contrast text on a dark
 * panel (in both themes), adjustable size, full screen and copy.
 * `{À VÉRIFIER : …}` placeholders are highlighted.
 */
export function Teleprompter({ text, wordCount, estimatedDurationSec }: TeleprompterProps) {
  const [size, setSize] = useState<PrompterSize>("lg");
  const panelRef = useRef<HTMLDivElement>(null);
  const paragraphs = text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  function enterFullscreen() {
    const panel = panelRef.current;
    if (panel?.requestFullscreen) void panel.requestFullscreen().catch(() => undefined);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Segmented
            size="sm"
            aria-label="Taille du texte"
            value={size}
            onValueChange={setSize}
            options={[
              { value: "md", label: <SizeGlyph className="text-xs" name="Petit" />, description: "Petit" },
              { value: "lg", label: <SizeGlyph className="text-sm" name="Moyen" />, description: "Moyen" },
              { value: "xl", label: <SizeGlyph className="text-base" name="Grand" />, description: "Grand" },
            ]}
          />
          {typeof wordCount === "number" ? (
            <p className="text-xs tabular-nums text-muted">
              {wordCount} mots
              {typeof estimatedDurationSec === "number" ? ` · ≈ ${formatDuration(estimatedDurationSec)}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" leftIcon={<Maximize2 aria-hidden className="size-4" />} onClick={enterFullscreen}>
            Plein écran
          </Button>
          <CopyButton text={text} label="Copier le texte" />
        </div>
      </div>

      <div
        ref={panelRef}
        tabIndex={0}
        role="region"
        aria-label="Texte du prompteur"
        className={cn(
          "max-h-[32rem] overflow-y-auto rounded-2xl border border-line bg-[#0b0c12] px-6 py-7 text-[#f1f2f8] sm:px-10 sm:py-9",
          "[&:fullscreen]:max-h-none [&:fullscreen]:rounded-none [&:fullscreen]:px-[8vw] [&:fullscreen]:py-[10vh]",
          "[&:fullscreen]:text-[2.75rem] [&:fullscreen]:leading-snug",
          SIZES[size],
        )}
      >
        {paragraphs.length === 0 ? (
          <p className="text-base text-[#9a9eb5]">Le texte du prompteur est vide.</p>
        ) : (
          <div className="mx-auto max-w-3xl space-y-[1em] font-medium tracking-[-0.01em]">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>
                {splitPlaceholders(paragraph).map((part, partIndex) =>
                  part.placeholder ? (
                    <mark key={partIndex} className="rounded bg-[#f5b23d]/25 px-1 text-[#f7c76f]">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={partIndex}>{part.text}</span>
                  ),
                )}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
