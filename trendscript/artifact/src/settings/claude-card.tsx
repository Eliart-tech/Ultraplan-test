"use client";

/**
 * Edition version of src/components/settings/claude-card.tsx (swapped in at
 * build time): Claude runs on the viewer's claude.ai account here — no API
 * key, no environment variable, no per-use Anthropic bill.
 */

import { Check, CircleCheck, CircleDashed, Cpu, Loader, Sparkles, Wallet } from "lucide-react";
import { ExternalAnchor } from "@/components/settings/rich-text";
import { SetupSteps } from "@/components/settings/setup-steps";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import type { ServerStatus } from "@/lib/client/api";
import { useEditionState } from "../capabilities";
import { claudeProblemSentence } from "../edition-text";

const UNLOCKS = [
  "Regroupe les signaux de toutes les sources en sujets clairs et explique pourquoi ils montent maintenant.",
  "Évalue la pertinence de chaque sujet pour votre niche et propose trois angles de vidéo.",
  "Écrit le script complet : trois accroches, déroulé seconde par seconde, texte prompteur, légende et hashtags.",
  "Liste les faits à vérifier, affine le script à la demande et, en option, cherche des faits sourcés sur le web.",
];

const STEPS = [
  "Ouvrez cette page dans claude.ai, connecté à votre compte (un fichier ouvert directement dans le navigateur n'a pas accès à Claude).",
  "Lancez une analyse : claude.ai vous demande d'autoriser cette page à utiliser Claude. Acceptez.",
  "Si vous avez refusé, rechargez la page : la demande reviendra à la prochaine analyse.",
  "Si Claude reste indisponible, votre organisation claude.ai a peut-être désactivé cet usage : voyez avec son administrateur.",
];

export function ClaudeCard({ ai }: { ai: ServerStatus["ai"] }) {
  const state = useEditionState();
  return (
    <Card as="article" aria-labelledby="source-claude" className="overflow-hidden">
      <div aria-hidden className="h-1 bg-brand" />
      <div className="flex flex-col gap-5 px-5 pt-5 pb-5 sm:px-6">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
          >
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="source-claude" className="text-base font-semibold leading-snug text-ink">
              Claude <span className="font-normal text-muted">· votre compte claude.ai</span>
            </h3>
            <p className="mt-0.5 text-sm text-muted">Le moteur d&apos;analyse et d&apos;écriture de TrendScript.</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {ai.configured ? (
                <Badge tone="success" icon={<CircleCheck />}>
                  Disponible
                </Badge>
              ) : state.claude === "pending" ? (
                <Badge tone="neutral" icon={<Loader />}>
                  Vérification…
                </Badge>
              ) : (
                <Badge tone="neutral" icon={<CircleDashed />}>
                  Indisponible ici
                </Badge>
              )}
              <Badge tone="neutral" variant="outline">
                Inclus dans votre abonnement
              </Badge>
            </div>
          </div>
        </div>

        {ai.configured ? null : (
          <Alert tone="warning" title="Mode sans IA" role="none">
            {claudeProblemSentence(state)} En attendant, les analyses regroupent les tendances automatiquement, sans
            angles ni pertinence pour votre niche, et la génération de script est indisponible.
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
              {ai.configured ? "Ce que Claude fait pour vous" : "Ce que Claude débloque"}
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {UNLOCKS.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-ink/85">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Cpu aria-hidden className="size-3.5 text-faint" />
                Modèle
              </p>
              <p className="mt-1.5 text-sm text-ink">
                Claude, choisi par claude.ai pour votre compte (la page demande le niveau le plus capable).
              </p>
            </div>
            <div className="flex gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink/85">
              <Wallet aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
              <p>
                <span className="sr-only">Coût : </span>
                Inclus dans votre abonnement claude.ai, dans les limites d&apos;usage de votre compte. Les données en
                direct et la recherche web consomment des crédits de votre connecteur Firecrawl : 1 par flux lu, 5
                recherches au maximum par script.
              </p>
            </div>
          </div>
        </div>

        <Disclosure
          summary={ai.configured ? "Si Claude ne répond plus" : `Activer Claude (${STEPS.length} étapes)`}
          openSummary="Masquer les étapes"
          defaultOpen={!ai.configured}
          buttonClassName="text-[0.8125rem]"
        >
          <SetupSteps steps={STEPS} />
        </Disclosure>
      </div>
      <CardFooter className="py-3 text-[0.8125rem]">
        <ExternalAnchor href="https://claude.ai">Ouvrir claude.ai</ExternalAnchor>
      </CardFooter>
    </Card>
  );
}
