"use client";

import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { EnvVarChip } from "./env-var-chip";
import { inlineCodeClass } from "./rich-text";

/**
 * Password gate status (APP_PASSWORD). When it is off, explains why it must
 * be set before the app goes online.
 */
export function AuthCard({ enabled }: { enabled: boolean }) {
  const code = (text: string) => <code className={inlineCodeClass}>{text}</code>;
  return (
    <Card as="section" aria-labelledby="protection-mot-de-passe" className={cn(!enabled && "border-warning/40")}>
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:px-6">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            enabled ? "bg-success-soft text-success-ink" : "bg-warning-soft text-warning-ink",
          )}
        >
          {enabled ? <LockKeyhole className="size-5" /> : <LockKeyholeOpen className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="protection-mot-de-passe" className="text-base font-semibold text-ink">
              Protection par mot de passe
            </h3>
            {enabled ? (
              <Badge tone="success" dot>
                Activée
              </Badge>
            ) : (
              <Badge tone="warning" dot>
                Désactivée
              </Badge>
            )}
          </div>
          {enabled ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              L&apos;application et son API demandent le mot de passe défini dans {code("APP_PASSWORD")} ; une connexion
              reste valable 30 jours dans ce navigateur. Pour changer de mot de passe, modifiez la variable puis
              redémarrez ou redéployez. Recommandé en ligne : une valeur aléatoire d&apos;au moins 32 caractères dans{" "}
              {code("AUTH_SECRET")} (par exemple {code("openssl rand -base64 32")}).
            </p>
          ) : (
            <>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Toute personne qui connaît l&apos;adresse de l&apos;application peut l&apos;utiliser et consommer vos
                quotas et crédits payants. Sans importance sur votre ordinateur ;{" "}
                <strong className="font-semibold text-warning-ink">
                  avant de la mettre en ligne, définissez {code("APP_PASSWORD")}
                </strong>{" "}
                (et idéalement {code("AUTH_SECRET")}, une valeur aléatoire d&apos;au moins 32 caractères) chez votre
                hébergeur, puis redéployez.
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Variables de la protection par mot de passe">
                <li className="max-w-full">
                  <EnvVarChip name="APP_PASSWORD" />
                </li>
                <li className="max-w-full">
                  <EnvVarChip name="AUTH_SECRET" optional />
                </li>
              </ul>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
