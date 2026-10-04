"use client";

import { Database, LockKeyhole, RefreshCw, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import { useServerStatus } from "@/lib/client/use-server-status";
import type { SourceStatus } from "@/lib/types";
import { AuthCard } from "./auth-card";
import { ClaudeCard } from "./claude-card";
import { CreatorsCard } from "./creators-card";
import { missingEnvTemplate } from "./env-template";
import { KeyHowTo } from "./key-howto";
import { SourceCard } from "./source-card";

/**
 * "Sources de données" — everything comes from GET /api/sources (shared
 * `useServerStatus` store): overview, Claude, competitor analysis per
 * platform, each source (active ones first), how to add a key, password
 * protection.
 */
export function SourcesPanel() {
  const { status, error, loading, reload } = useServerStatus();

  if (!status) {
    if (error && !loading) {
      return (
        <Alert
          tone="danger"
          title="Impossible de lire la configuration du serveur"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={reload}
              leftIcon={<RefreshCw aria-hidden className="size-4" />}
            >
              Réessayer
            </Button>
          }
        >
          {error}
        </Alert>
      );
    }
    return <SourcesSkeleton />;
  }

  const active = status.sources.filter((source) => source.configured);
  const inactive = status.sources.filter((source) => !source.configured);
  const total = status.sources.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            icon={<Sparkles />}
            label="Claude"
            value={status.ai.configured ? "Actif" : "Inactif"}
            tone={status.ai.configured ? "success" : "warning"}
            hint={status.ai.configured ? "Analyse IA et scripts" : "Mode sans IA"}
          />
          <Stat
            icon={<Database />}
            label="Sources actives"
            value={
              <>
                {active.length}
                <span className="text-base font-medium text-muted">/{total}</span>
              </>
            }
            hint={inactive.length ? `${inactive.length} à configurer` : "Toutes configurées"}
          />
          <Stat
            icon={<LockKeyhole />}
            label="Accès"
            value={status.auth.enabled ? "Protégé" : "Ouvert"}
            tone={status.auth.enabled ? "success" : "warning"}
            hint={status.auth.enabled ? "Mot de passe actif" : "Sans mot de passe"}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8125rem] text-muted">
            Statut lu sur le serveur. Après avoir ajouté une clé et redémarré, actualisez.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={reload}
            loading={loading}
            loadingText="Actualisation…"
            leftIcon={<RefreshCw aria-hidden className="size-4" />}
          >
            Actualiser
          </Button>
        </div>
        {error ? (
          <Alert tone="warning" size="sm">
            Dernière actualisation impossible ({error}) : le statut affiché date peut-être un peu.
          </Alert>
        ) : null}
      </div>

      <ClaudeCard ai={status.ai} />

      {status.creators?.length ? <CreatorsCard creators={status.creators} /> : null}

      <SourceGroup
        id="sources-actives"
        title="Sources actives"
        count={active.length}
        description="Proposées dans le Radar du Studio. Les sources gratuites sans clé sont actives d'office."
        sources={active}
        empty="Aucune source n'est active sur ce serveur."
      />

      <SourceGroup
        id="sources-a-configurer"
        title="Sources à configurer"
        count={inactive.length}
        description="Ajoutez la ou les variables indiquées pour les activer. Sans elles, la source est simplement ignorée — jamais remplacée par des données fictives."
        sources={inactive}
        empty="Tout est configuré : chaque source disponible est active."
      />

      <KeyHowTo template={missingEnvTemplate(status)} onReload={reload} reloading={loading} />

      <AuthCard enabled={status.auth.enabled} />
    </div>
  );
}

function SourceGroup({
  id,
  title,
  count,
  description,
  sources,
  empty,
}: {
  id: string;
  title: string;
  count: number;
  description: ReactNode;
  sources: SourceStatus[];
  empty: string;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div>
        <h3 id={id} className="flex items-center gap-2 text-base font-semibold text-ink">
          {title}
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted">
            {count}
          </span>
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      {sources.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">
          {empty}
        </p>
      )}
    </section>
  );
}

function SourcesSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span role="status" className="sr-only">
        Lecture de la configuration du serveur…
      </span>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-[5.5rem] rounded-xl" />
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-start gap-3.5">
          <Skeleton className="size-11 rounded-xl" />
          <div className="flex-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-64 max-w-full" />
          </div>
        </div>
        <SkeletonText lines={3} className="mt-5" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="rounded-2xl border border-line bg-surface p-5">
            <Skeleton className="h-4 w-48" />
            <SkeletonText lines={3} className="mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
