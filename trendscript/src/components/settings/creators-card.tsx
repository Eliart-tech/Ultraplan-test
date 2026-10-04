"use client";

import { ArrowRight, CircleCheck, CircleDashed, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import type { CreatorPlatformStatus } from "@/lib/types";
import { RichText } from "./rich-text";

/**
 * "Analyse de concurrents" in Sources & clés: for each platform, whether the
 * server can read a creator's posts, through what, and what is missing —
 * straight from GET /api/sources (`creators`).
 */
export function CreatorsCard({ creators }: { creators: CreatorPlatformStatus[] }) {
  const available = creators.filter((status) => status.available).length;
  return (
    <Card as="article" id="concurrents" aria-labelledby="source-concurrents" className="scroll-mt-24 overflow-hidden">
      <div className="flex flex-col gap-5 px-5 pt-5 pb-5 sm:px-6">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"
          >
            <Swords className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="source-concurrents" className="text-base font-semibold leading-snug text-ink">
              Analyse de concurrents
            </h3>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">
              Lire les dernières publications d&apos;un créateur à partir de son pseudo (page Concurrents) : ce qui
              surperforme, ce qui fait venir des abonnés, et des idées pour s&apos;en démarquer.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Badge tone={available > 0 ? "success" : "neutral"} icon={available > 0 ? <CircleCheck /> : <CircleDashed />}>
                {available}/{creators.length} plateforme{creators.length > 1 ? "s" : ""} disponible{available > 1 ? "s" : ""}
              </Badge>
            </div>
          </div>
        </div>

        <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Plateformes de l'analyse de concurrents">
          {creators.map((status) => (
            <li key={status.platform} className="flex gap-3 px-4 py-3">
              <PlatformIcon platform={status.platform} size="md" decorative className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">{platformLabel(status.platform)}</p>
                  {status.available ? (
                    <Badge size="sm" tone="success" icon={<CircleCheck />}>
                      Disponible
                    </Badge>
                  ) : (
                    <Badge size="sm" tone="neutral" icon={<CircleDashed />}>
                      Indisponible
                    </Badge>
                  )}
                </div>
                {status.via ? (
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink/85">
                    <span className="text-muted">Via : </span>
                    <RichText text={status.via} />
                  </p>
                ) : null}
                {status.note ? (
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
                    <RichText text={status.note} />
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <CardFooter className="py-3">
        <ButtonLink href="/concurrents" size="sm" variant="soft" rightIcon={<ArrowRight aria-hidden className="size-4" />}>
          Ouvrir Concurrents
        </ButtonLink>
      </CardFooter>
    </Card>
  );
}
