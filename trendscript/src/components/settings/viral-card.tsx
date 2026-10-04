"use client";

import { ArrowRight, CircleCheck, CircleDashed, Flame, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import type { ViralCapability } from "@/lib/client/api";
import { RichText } from "./rich-text";

/**
 * "Ce qui cartonne" in Sources & clés: for each platform, whether the lab can
 * find the niche's recent videos and their authors' audience, through what,
 * at what cost, and what is missing — straight from GET /api/sources
 * (`viral`).
 */
export function ViralCard({ capabilities }: { capabilities: ViralCapability[] }) {
  const available = capabilities.filter((status) => status.available).length;
  return (
    <Card as="article" id="cartonne" aria-labelledby="source-cartonne" className="scroll-mt-24 overflow-hidden">
      <div className="flex flex-col gap-5 px-5 pt-5 pb-5 sm:px-6">
        <div className="flex items-start gap-3.5">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-hot-soft text-hot-ink">
            <Flame className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="source-cartonne" className="text-base font-semibold leading-snug text-ink">
              Ce qui cartonne
            </h3>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">
              Trouver les vidéos récentes d&apos;une niche, lire l&apos;audience de leurs auteurs et mesurer de combien
              chacune la dépasse : la base des recettes et des idées de la page « Ce qui cartonne ».
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Badge tone={available > 0 ? "success" : "neutral"} icon={available > 0 ? <CircleCheck /> : <CircleDashed />}>
                {available}/{capabilities.length} plateforme{capabilities.length > 1 ? "s" : ""} disponible
                {available > 1 ? "s" : ""}
              </Badge>
            </div>
          </div>
        </div>

        <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Plateformes de Ce qui cartonne">
          {capabilities.map((status) => (
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

        <p className="flex gap-2 text-xs leading-relaxed text-muted">
          <Scale aria-hidden className="mt-px size-3.5 shrink-0 text-faint" />
          <span>
            Aucune plateforme ne publie les abonnements gagnés par vidéo pour le compte d&apos;un autre : « Ce qui cartonne »
            mesure les vues ÷ abonnés de l&apos;auteur, le meilleur signal public de ce qui fait gagner des abonnés.
          </span>
        </p>
      </div>
      <CardFooter className="py-3">
        <ButtonLink href="/ce-qui-cartonne" size="sm" variant="soft" rightIcon={<ArrowRight aria-hidden className="size-4" />}>
          Ouvrir Ce qui cartonne
        </ButtonLink>
      </CardFooter>
    </Card>
  );
}
