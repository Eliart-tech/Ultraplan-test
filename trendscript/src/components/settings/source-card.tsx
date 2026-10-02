"use client";

import { CircleCheck, CircleDashed, KeyRound, Tags, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { PlatformIcon } from "@/components/ui/platform-icon";
import type { SourceStatus } from "@/lib/types";
import { EnvVarChip } from "./env-var-chip";
import { ExternalAnchor, RichText } from "./rich-text";
import { SetupSteps } from "./setup-steps";

/** Configured / free / keyword badges shared by the source and Claude cards. */
export function StatusBadge({ configured, feminine = true }: { configured: boolean; feminine?: boolean }) {
  return configured ? (
    <Badge tone="success" icon={<CircleCheck />}>
      {feminine ? "Configurée" : "Configuré"}
    </Badge>
  ) : (
    <Badge tone="neutral" icon={<CircleDashed />}>
      {feminine ? "Non configurée" : "Non configuré"}
    </Badge>
  );
}

/**
 * One data source as reported by GET /api/sources: platform, status, price,
 * keyword requirement, description, cost/quota note, env vars (copyable),
 * setup steps (open by default when the source isn't configured) and docs.
 */
export function SourceCard({ source }: { source: SourceStatus }) {
  const headingId = `source-${source.id}`;
  return (
    <Card as="article" aria-labelledby={headingId} className="flex flex-col">
      <div className="flex flex-1 flex-col gap-4 px-5 pt-5 pb-5">
        <div className="flex items-start gap-3">
          <PlatformIcon platform={source.platform} size="lg" />
          <div className="min-w-0 flex-1">
            <h4 id={headingId} className="text-[0.9375rem] font-semibold leading-snug text-ink">
              {source.label}
            </h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge configured={source.configured} />
              {source.free ? (
                <Badge tone="accent" variant="outline">
                  Gratuit
                </Badge>
              ) : (
                <Badge tone="hot" variant="outline">
                  Payant
                </Badge>
              )}
              {source.needsKeywords ? (
                <Badge tone="warning" icon={<Tags />}>
                  Nécessite des mots-clés
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted">{source.description}</p>

        <div className="flex gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink/85">
          <Wallet aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
          <p>
            <span className="sr-only">Coût et quotas : </span>
            <RichText text={source.costNote} />
          </p>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <KeyRound aria-hidden className="size-3.5 text-faint" />
            Variables d&apos;environnement
          </p>
          {source.envVars.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Variables de ${source.label}`}>
              {source.envVars.map((name) => (
                <li key={name} className="max-w-full">
                  <EnvVarChip name={name} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-ink/85">Aucune clé nécessaire.</p>
          )}
        </div>

        {source.setup.length ? (
          <Disclosure
            summary={
              source.configured ? "Détails de configuration" : `Étapes de configuration (${source.setup.length})`
            }
            openSummary="Masquer les étapes"
            defaultOpen={!source.configured}
            buttonClassName="text-[0.8125rem]"
          >
            <SetupSteps steps={source.setup} />
          </Disclosure>
        ) : null}
      </div>

      {source.docsUrl ? (
        <CardFooter className="py-3 text-[0.8125rem]">
          <ExternalAnchor href={source.docsUrl}>Documentation officielle</ExternalAnchor>
        </CardFooter>
      ) : null}
    </Card>
  );
}
