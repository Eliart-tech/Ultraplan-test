"use client";

import { AtSign, KeyRound, Search, Settings2, UserRound } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/components/studio/studio-options";
import type { CreatorPlatform, CreatorPlatformStatus } from "@/lib/types";
import {
  CREATOR_PLATFORM_ORDER,
  HANDLE_PLACEHOLDERS,
  detectPlatformFromInput,
  effectivePlatform,
} from "./report-utils";

export interface CompetitorFormValues {
  /** Explicit choice; null = first available platform. */
  platform: CreatorPlatform | null;
  handle: string;
  focus: string;
  maxPosts: number;
  geo: string;
}

export const DEFAULT_FORM: CompetitorFormValues = {
  platform: null,
  handle: "",
  focus: "",
  maxPosts: 30,
  geo: "FR",
};

export interface CompetitorFormProps {
  values: CompetitorFormValues;
  onChange: (patch: Partial<CompetitorFormValues>) => void;
  onSubmit: (platform: CreatorPlatform) => void;
  /** From GET /api/sources (`creators`); null while loading or on older servers. */
  capabilities: CreatorPlatformStatus[] | null;
  /** null while /api/sources is loading. */
  aiConfigured: boolean | null;
  profileFilled: boolean;
  busy: boolean;
}

/**
 * "Analyser un créateur": platform (unavailable ones disabled, with the
 * reason), handle or profile URL (a pasted URL switches the platform), what
 * to understand, number of posts and market.
 */
export function CompetitorForm({
  values,
  onChange,
  onSubmit,
  capabilities,
  aiConfigured,
  profileFilled,
  busy,
}: CompetitorFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<CreatorPlatform | null>(null);
  const platform = effectivePlatform(values.platform, capabilities);
  const statusOf = (target: CreatorPlatform) => capabilities?.find((status) => status.platform === target);
  const current = statusOf(platform);
  const unavailable = capabilities?.filter((status) => !status.available) ?? [];
  const currentBlocked = current !== undefined && !current.available;
  const noneAvailable = capabilities !== null && capabilities.length > 0 && unavailable.length === capabilities.length;

  function changeHandle(handle: string) {
    if (error) setError(null);
    const fromUrl = detectPlatformFromInput(handle);
    if (fromUrl && fromUrl !== platform && statusOf(fromUrl)?.available !== false) {
      onChange({ handle, platform: fromUrl });
      setDetected(fromUrl);
      return;
    }
    if (!fromUrl) setDetected(null);
    onChange({ handle });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (values.handle.trim().replace(/^@+/, "").length < 2) {
      setError("Indiquez le pseudo du créateur, ou collez le lien de son profil.");
      return;
    }
    onSubmit(platform);
  }

  return (
    <Card as="section" aria-labelledby="analyser-titre">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6">
        <div>
          <h2 id="analyser-titre" className="flex items-center gap-2 text-base font-semibold text-ink">
            <Search aria-hidden className="size-[18px] text-accent" />
            Analyser un créateur
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Ses dernières publications réelles, ce qui marche chez lui, et comment vous en démarquer.
          </p>
        </div>

        <Field
          label="Plateforme"
          group
          hint={
            current?.available ? (
              <>Source : {current.via}</>
            ) : currentBlocked ? (
              <span className="text-warning-ink">{current.note}</span>
            ) : undefined
          }
        >
          <Segmented
            fullWidth
            size="sm"
            value={platform}
            onValueChange={(next: CreatorPlatform) => {
              onChange({ platform: next });
              setDetected(null);
            }}
            options={CREATOR_PLATFORM_ORDER.map((option) => {
              const status = statusOf(option);
              return {
                value: option,
                // Icons only where the four labels have room (the single wide column between sm and lg).
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="hidden sm:inline-flex lg:hidden">
                      <PlatformIcon platform={option} size="xs" tile={false} decorative />
                    </span>
                    {platformLabel(option)}
                  </span>
                ),
                disabled: status ? !status.available : false,
                description: status ? (status.available ? status.via : `Indisponible : ${status.note}`) : undefined,
              };
            })}
          />
        </Field>

        {unavailable.length > 0 ? (
          <div className="-mt-2 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-xs leading-relaxed text-muted">
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <KeyRound aria-hidden className="size-3.5 text-faint" />
              {unavailable.length === 1 ? "Plateforme indisponible sur ce serveur" : "Plateformes indisponibles sur ce serveur"}
            </p>
            <ul className="mt-1.5 space-y-1">
              {unavailable.map((status) => (
                <li key={status.platform} className="flex gap-1.5">
                  <PlatformIcon platform={status.platform} size="xs" tile={false} decorative className="mt-0.5" />
                  <span>
                    <span className="font-medium text-ink">{platformLabel(status.platform)} : </span>
                    {status.note}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/reglages#concurrents"
              className="mt-2 inline-flex items-center gap-1 font-medium text-accent-ink underline-offset-2 hover:underline"
            >
              <Settings2 aria-hidden className="size-3.5" />
              Configurer dans Réglages
            </Link>
          </div>
        ) : null}

        <Field
          label="Pseudo ou lien du profil"
          required
          error={error}
          hint={
            detected ? (
              <>Lien {platformLabel(detected)} détecté : plateforme sélectionnée.</>
            ) : (
              "Avec ou sans @, ou l'adresse complète de son profil."
            )
          }
        >
          <Input
            leftIcon={<AtSign />}
            value={values.handle}
            onChange={(event) => changeHandle(event.target.value)}
            placeholder={HANDLE_PLACEHOLDERS[platform]}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={300}
            inputMode="url"
          />
        </Field>

        <Field
          label="Ce que je veux comprendre"
          optional
          labelAside={<span className="tabular-nums">{values.focus.length}/300</span>}
        >
          <Textarea
            value={values.focus}
            maxLength={300}
            rows={2}
            autoResize
            onChange={(event) => onChange({ focus: event.target.value })}
            placeholder="Ex. : comment il accroche en 3 secondes, pourquoi ses vidéos d'actu explosent, ce qui fait s'abonner…"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_9rem]">
          <Field label="Publications à analyser" hint="Plus il y en a, plus les médianes sont fiables (et le coût Apify élevé).">
            <Slider
              value={values.maxPosts}
              onValueChange={(maxPosts) => onChange({ maxPosts })}
              min={10}
              max={50}
              step={5}
              formatValue={(value) => `${value} publications`}
              minLabel="10"
              maxLabel="50"
            />
          </Field>
          <Field label="Marché" hint="Fuseau des heures de publication.">
            <Select
              value={values.geo}
              onChange={(event) => onChange({ geo: event.target.value })}
              options={COUNTRIES.map((country) => ({ value: country.value, label: country.label }))}
            />
          </Field>
        </div>

        {!profileFilled ? (
          <Alert
            tone="info"
            size="sm"
            role="none"
            icon={<UserRound />}
            title="Des conseils calibrés sur votre niche"
            action={
              <ButtonLink href="/reglages#profil" size="sm" variant="secondary">
                Compléter mon profil
              </ButtonLink>
            }
          >
            La différenciation et les idées de vidéos s&apos;appuient sur votre profil créateur (niche, audience,
            positionnement).
          </Alert>
        ) : null}

        {aiConfigured === false ? (
          <Alert tone="warning" size="sm" role="none" title="Mode statistiques">
            Sans <code className="rounded bg-surface px-1 font-mono text-xs">ANTHROPIC_API_KEY</code>, vous obtenez les
            publications et les chiffres réels, sans l&apos;analyse ni les idées de Claude.
          </Alert>
        ) : null}

        {noneAvailable ? (
          <Alert tone="warning" size="sm" role="none" title="Aucune plateforme disponible">
            Configurez au moins une source (voir Réglages) pour analyser un créateur.
          </Alert>
        ) : null}

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={busy}
          loadingText="Analyse en cours…"
          disabled={currentBlocked || noneAvailable}
          leftIcon={<Search aria-hidden className="size-5" />}
        >
          Analyser ce créateur
        </Button>
        <p className="-mt-2 text-center text-xs text-faint">
          {aiConfigured === false ? "Statistiques : 10 s à 2 min." : "Publications + statistiques + analyse : 1 à 3 min."}
        </p>
      </form>
    </Card>
  );
}
