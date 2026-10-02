"use client";

import { ArrowRight, Hash, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { SourceId, SourceStatus } from "@/lib/types";

export interface SourcePickerProps {
  /** null while /api/sources is loading (or failed before the first answer). */
  sources: SourceStatus[] | null;
  /** Effective selection (configured sources only). */
  selected: SourceId[];
  onChange: (next: SourceId[]) => void;
  /** Whether the Radar has niche keywords (keyword-driven sources need some). */
  hasKeywords: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Validation message ("Choisissez au moins une source"). */
  invalid?: string | null;
  disabled?: boolean;
}

/**
 * Source cards of the Radar: one switch per source, with what it measures,
 * whether it is free, whether it needs keywords and what it costs.
 * Unconfigured sources are shown (honestly) but disabled, with a link to
 * the setup steps in Réglages.
 */
export function SourcePicker({
  sources,
  selected,
  onChange,
  hasKeywords,
  loading,
  error,
  onRetry,
  invalid,
  disabled = false,
}: SourcePickerProps) {
  const configured = sources?.filter((source) => source.configured) ?? [];
  const ordered = sources
    ? [...sources].sort((a, b) => Number(b.configured) - Number(a.configured) || Number(b.free) - Number(a.free))
    : [];

  function toggle(id: SourceId, on: boolean) {
    onChange(on ? [...selected, id] : selected.filter((item) => item !== id));
  }

  const summary =
    sources === null
      ? null
      : `${selected.length} source${selected.length > 1 ? "s" : ""} sur ${configured.length} configurée${configured.length > 1 ? "s" : ""}`;

  return (
    <Card as="section" aria-label="Sources">
      <CardHeader
        title="Sources"
        description={summary ?? "Données réelles, collectées au moment de l'analyse."}
        actions={
          sources && configured.length > 1 ? (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(configured.filter((source) => source.free).map((source) => source.id))}
              >
                Gratuites
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(configured.map((source) => source.id))}
              >
                Toutes
              </Button>
            </div>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {invalid ? (
          <p role="alert" className="text-sm font-medium text-danger-ink">
            {invalid}
          </p>
        ) : null}

        {sources === null && error && !loading ? (
          <Alert
            tone="danger"
            title="Impossible de charger les sources"
            action={
              <Button size="sm" variant="secondary" leftIcon={<RotateCcw aria-hidden className="size-4" />} onClick={onRetry}>
                Réessayer
              </Button>
            }
          >
            {error}
          </Alert>
        ) : null}

        {sources === null && !(error && !loading) ? (
          <ul aria-busy="true" aria-label="Chargement des sources" className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <li key={index} className="rounded-xl border border-line p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-lg" />
                  <Skeleton className="h-3.5 w-36" />
                </div>
                <SkeletonText lines={2} className="mt-4" />
              </li>
            ))}
          </ul>
        ) : null}

        {sources !== null ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {ordered.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                checked={source.configured && selected.includes(source.id)}
                onToggle={(on) => toggle(source.id, on)}
                hasKeywords={hasKeywords}
                disabled={disabled}
              />
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}

interface SourceCardProps {
  source: SourceStatus;
  checked: boolean;
  onToggle: (on: boolean) => void;
  hasKeywords: boolean;
  disabled: boolean;
}

function SourceCard({ source, checked, onToggle, hasKeywords, disabled }: SourceCardProps) {
  const missingKeywords = source.needsKeywords && !hasKeywords;
  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border p-4 transition-[border-color,background-color] duration-150",
        !source.configured
          ? "border-dashed border-line-strong bg-surface-2/50"
          : checked
            ? "border-accent/50 bg-accent-soft/40"
            : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <PlatformIcon platform={source.platform} size="md" decorative className={cn(!source.configured && "opacity-60")} />
      <div className="min-w-0 flex-1">
        <Switch
          size="sm"
          checked={checked}
          onCheckedChange={onToggle}
          disabled={!source.configured || disabled}
          label={source.label}
          description={source.description}
        />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Badge size="sm" tone={source.free ? "success" : "neutral"} variant={source.free ? "soft" : "outline"}>
            {source.free ? "Gratuit" : "Payant"}
          </Badge>
          {source.needsKeywords ? (
            <Badge size="sm" tone={missingKeywords && source.configured ? "warning" : "neutral"} icon={<Hash />}>
              Nécessite des mots-clés
            </Badge>
          ) : null}
          {!source.configured ? (
            <Badge size="sm" tone="neutral" variant="outline">
              Non configurée
            </Badge>
          ) : null}
        </div>
        {missingKeywords && source.configured && checked ? (
          <p className="mt-2 text-xs font-medium leading-relaxed text-warning-ink">
            Ajoutez au moins un mot-clé : sans mots-clés, cette source ne renverra rien.
          </p>
        ) : null}
        {source.costNote ? <p className="mt-2 text-xs leading-relaxed text-faint">{source.costNote}</p> : null}
        {!source.configured ? (
          <Link
            href="/reglages"
            className="mt-2 inline-flex items-center gap-1 rounded text-xs font-medium text-accent-ink transition-colors duration-150 hover:text-accent"
          >
            Non configurée — voir Réglages
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </li>
  );
}
