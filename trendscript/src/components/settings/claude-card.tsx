"use client";

import { Check, Cpu, KeyRound, Sparkles, Wallet } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import type { ServerStatus } from "@/lib/client/api";
import { EnvVarChip } from "./env-var-chip";
import { ExternalAnchor, inlineCodeClass } from "./rich-text";
import { SetupSteps } from "./setup-steps";
import { StatusBadge } from "./source-card";

const UNLOCKS = [
  "Regroupe les signaux de toutes les sources en sujets clairs et explique pourquoi ils montent maintenant.",
  "Évalue la pertinence de chaque sujet pour votre niche et propose trois angles de vidéo.",
  "Écrit le script complet : trois accroches, déroulé seconde par seconde, texte prompteur, légende et hashtags.",
  "Liste les faits à vérifier, affine le script à la demande et, en option, cherche des faits sourcés sur le web.",
];

function setupSteps(model: string): string[] {
  return [
    "Créez un compte sur https://console.anthropic.com et ajoutez du crédit dans la rubrique de facturation : l'API est facturée à l'usage, indépendamment d'un abonnement Claude.ai.",
    "Ouvrez https://console.anthropic.com/settings/keys et cliquez sur « Create Key » ; nommez-la par exemple « TrendScript ».",
    "Copiez la clé (elle commence par sk-ant-) : elle ne sera plus affichée ensuite.",
    "Ajoutez ANTHROPIC_API_KEY=votre_clé dans .env.local (en local) ou dans les variables d'environnement de votre hébergeur, puis redémarrez l'application.",
    `Facultatif : ANTHROPIC_MODEL choisit un autre modèle Claude (modèle actuel : ${model}).`,
    "Conseil : fixez une limite de dépense mensuelle dans les paramètres de la console Anthropic.",
  ];
}

/**
 * Claude status, shown before the data sources: configured or not, model,
 * what it unlocks, the env var to set and how to get a key.
 */
export function ClaudeCard({ ai }: { ai: ServerStatus["ai"] }) {
  const steps = setupSteps(ai.model);
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
              Claude <span className="font-normal text-muted">· Anthropic</span>
            </h3>
            <p className="mt-0.5 text-sm text-muted">Le moteur d&apos;analyse et d&apos;écriture de TrendScript.</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <StatusBadge configured={ai.configured} feminine={false} />
              <Badge tone="hot" variant="outline">
                Payant à l&apos;usage
              </Badge>
            </div>
          </div>
        </div>

        {ai.configured ? null : (
          <Alert tone="warning" title="Mode sans IA" role="none">
            Les analyses regroupent les tendances automatiquement, sans angles ni pertinence pour votre niche, et la
            génération de script reste indisponible tant que <code className={inlineCodeClass}>ANTHROPIC_API_KEY</code>{" "}
            n&apos;est pas définie.
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
                <code className={inlineCodeClass}>{ai.model}</code>
                {ai.configured ? null : <span className="text-muted"> (utilisé dès que la clé est ajoutée)</span>}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <KeyRound aria-hidden className="size-3.5 text-faint" />
                Variables d&apos;environnement
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Variables de Claude">
                <li className="max-w-full">
                  <EnvVarChip name="ANTHROPIC_API_KEY" />
                </li>
                <li className="max-w-full">
                  <EnvVarChip name="ANTHROPIC_MODEL" optional />
                </li>
              </ul>
            </div>
            <div className="flex gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink/85">
              <Wallet aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
              <p>
                <span className="sr-only">Coût : </span>
                Facturé par Anthropic selon le volume de texte traité. Une génération avec recherche web coûte un peu
                plus : chaque recherche est facturée en supplément.
              </p>
            </div>
          </div>
        </div>

        <Disclosure
          summary={ai.configured ? "Comment changer de clé" : `Obtenir une clé API (${steps.length} étapes)`}
          openSummary="Masquer les étapes"
          defaultOpen={!ai.configured}
          buttonClassName="text-[0.8125rem]"
        >
          <SetupSteps steps={steps} />
        </Disclosure>
      </div>
      <CardFooter className="py-3 text-[0.8125rem]">
        <ExternalAnchor href="https://console.anthropic.com">Console Anthropic</ExternalAnchor>
      </CardFooter>
    </Card>
  );
}
