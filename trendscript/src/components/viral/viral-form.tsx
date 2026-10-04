"use client";

import { Check, Flame, KeyRound, Settings2, UserRound } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { COUNTRIES } from "@/components/studio/studio-options";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipInput } from "@/components/ui/chip-input";
import { Field, useField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PlatformIcon, platformLabel } from "@/components/ui/platform-icon";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import type { ViralCapability } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import type { CreatorProfile, ViralPlatform } from "@/lib/types";
import { MAX_VIRAL_KEYWORDS, VIRAL_PLATFORM_ORDER, effectiveViralPlatforms, keywordsFromNiche } from "./viral-utils";

export interface ViralFormValues {
  niche: string;
  keywords: string[];
  /** Explicit choice; null = every available platform. */
  platforms: ViralPlatform[] | null;
  periodDays: 7 | 30;
  geo: string;
}

/** Starting values: the creator profile's niche, and keywords drawn from it. */
export function initialViralForm(profile: Pick<CreatorProfile, "niche">): ViralFormValues {
  const niche = profile.niche.trim().slice(0, 300);
  return { niche, keywords: keywordsFromNiche(niche), platforms: null, periodDays: 30, geo: "FR" };
}

export interface ViralFormProps {
  values: ViralFormValues;
  onChange: (patch: Partial<ViralFormValues>) => void;
  /** Called with the platforms to analyse (available ones only). */
  onSubmit: (platforms: ViralPlatform[]) => void;
  /** From GET /api/sources (`viral`); null while loading or on older servers. */
  capabilities: ViralCapability[] | null;
  /** null while /api/sources is loading. */
  aiConfigured: boolean | null;
  profileFilled: boolean;
  busy: boolean;
}

/** The three platform toggles, labelled by the surrounding Field; unavailable ones disabled with their reason. */
function PlatformToggles({
  selected,
  capabilities,
  onToggle,
}: {
  selected: ViralPlatform[];
  capabilities: ViralCapability[] | null;
  onToggle: (platform: ViralPlatform, on: boolean) => void;
}) {
  const field = useField();
  return (
    <div role="group" aria-labelledby={field?.labelId} aria-describedby={field?.describedBy} className="grid gap-2">
      {VIRAL_PLATFORM_ORDER.map((platform) => {
        const status = capabilities?.find((item) => item.platform === platform);
        const unavailable = status ? !status.available : false;
        const checked = selected.includes(platform);
        const detail = status ? (status.available ? status.via : status.note) : undefined;
        return (
          <label
            key={platform}
            className={cn(
              "relative flex cursor-pointer items-start gap-3 rounded-xl border bg-surface px-3.5 py-3",
              "transition-[border-color,background-color,box-shadow] duration-150 ease-out",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              checked ? "border-accent bg-accent-soft/50 ring-1 ring-accent" : "border-line hover:border-line-strong",
              unavailable && "cursor-not-allowed border-dashed bg-surface-2/50 hover:border-line",
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              disabled={unavailable}
              onChange={(event) => onToggle(platform, event.target.checked)}
              aria-describedby={detail ? `${field?.id ?? "plateforme"}-${platform}` : undefined}
            />
            <PlatformIcon platform={platform} size="md" decorative className={cn(unavailable && "opacity-50")} />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm font-medium", unavailable ? "text-muted" : "text-ink")}>
                {platformLabel(platform)}
                {unavailable ? <span className="font-normal"> · indisponible</span> : null}
              </span>
              {detail ? (
                <span
                  id={`${field?.id ?? "plateforme"}-${platform}`}
                  className={cn("mt-0.5 block text-xs leading-relaxed", unavailable ? "text-warning-ink" : "text-muted")}
                >
                  {detail}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-[1.125rem] shrink-0 items-center justify-center rounded-[0.3125rem] border transition-colors duration-150",
                checked ? "border-accent bg-accent text-accent-fg" : "border-line-strong bg-surface",
                unavailable && "opacity-50",
              )}
            >
              {checked ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * "Trouver ce qui cartonne": niche, keywords (1–5), platforms (unavailable
 * ones disabled with the reason), period and market.
 */
export function ViralForm({ values, onChange, onSubmit, capabilities, aiConfigured, profileFilled, busy }: ViralFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const selected = effectiveViralPlatforms(values.platforms, capabilities);
  const unavailable = capabilities?.filter((item) => !item.available) ?? [];
  const noneAvailable = capabilities !== null && capabilities.length > 0 && unavailable.length === capabilities.length;

  function toggle(platform: ViralPlatform, on: boolean) {
    setPlatformError(null);
    const next = on ? [...selected, platform] : selected.filter((item) => item !== platform);
    onChange({ platforms: VIRAL_PLATFORM_ORDER.filter((item) => next.includes(item)) });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let invalid = false;
    if (values.keywords.length === 0) {
      setError("Ajoutez au moins un mot-clé ou hashtag de votre niche (Entrée pour valider).");
      invalid = true;
    }
    if (selected.length === 0) {
      setPlatformError("Choisissez au moins une plateforme disponible.");
      invalid = true;
    }
    if (!invalid) onSubmit(selected);
  }

  return (
    <Card as="section" aria-labelledby="cartonne-titre">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6">
        <div>
          <h2 id="cartonne-titre" className="flex items-center gap-2 text-base font-semibold text-ink">
            <Flame aria-hidden className="size-[18px] text-hot" />
            Trouver ce qui cartonne
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Les vidéos récentes de votre niche qui dépassent l&apos;audience de leur créateur, et pourquoi.
          </p>
        </div>

        <Field
          label="Mots-clés et hashtags"
          required
          error={error}
          hint={`Ce que votre public tape ou suit. Entrée ou virgule pour ajouter, ${MAX_VIRAL_KEYWORDS} maximum.`}
          labelAside={
            <span className="tabular-nums">
              {values.keywords.length}/{MAX_VIRAL_KEYWORDS}
            </span>
          }
        >
          <ChipInput
            value={values.keywords}
            onValueChange={(keywords) => {
              if (error) setError(null);
              onChange({ keywords });
            }}
            max={MAX_VIRAL_KEYWORDS}
            placeholder={values.keywords.length === 0 ? "Ex. : budget, épargne, #financeperso" : "Ajouter…"}
          />
        </Field>

        <Field label="Votre niche" optional hint="Sert à Claude pour vous proposer des idées qui vous ressemblent.">
          <Input
            value={values.niche}
            maxLength={300}
            onChange={(event) => onChange({ niche: event.target.value })}
            placeholder="Ex. : finances perso pour jeunes actifs"
            autoComplete="off"
          />
        </Field>

        <Field label="Plateformes" group error={platformError}>
          <PlatformToggles selected={selected} capabilities={capabilities} onToggle={toggle} />
        </Field>

        {unavailable.length > 0 ? (
          <Link
            href="/reglages#cartonne"
            className="-mt-3 inline-flex items-center gap-1 self-start text-xs font-medium text-accent-ink underline-offset-2 hover:underline"
          >
            <Settings2 aria-hidden className="size-3.5" />
            Activer {unavailable.length > 1 ? "les autres plateformes" : platformLabel(unavailable[0].platform)} dans Réglages
          </Link>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_9rem]">
          <Field
            label="Période"
            group
            hint={values.periodDays === 7 ? "Ce qui monte en ce moment." : "Plus de vidéos, des tendances plus sûres."}
          >
            <Segmented
              fullWidth
              size="sm"
              value={String(values.periodDays) as "7" | "30"}
              onValueChange={(value) => onChange({ periodDays: value === "7" ? 7 : 30 })}
              options={[
                { value: "7", label: "7 derniers jours" },
                { value: "30", label: "30 derniers jours" },
              ]}
            />
          </Field>
          <Field label="Marché" hint="Langue et région des vidéos.">
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
            title="Des idées calibrées sur votre profil"
            action={
              <ButtonLink href="/reglages#profil" size="sm" variant="secondary">
                Compléter mon profil
              </ButtonLink>
            }
          >
            Les idées de vidéos s&apos;appuient sur votre profil créateur (niche, audience, positionnement, ton).
          </Alert>
        ) : null}

        {aiConfigured === false ? (
          <Alert tone="warning" size="sm" role="none" title="Mode statistiques">
            Sans <code className="rounded bg-surface px-1 font-mono text-xs">ANTHROPIC_API_KEY</code>, vous obtenez les vidéos
            et leurs chiffres réels, sans les recettes ni les idées de Claude.
          </Alert>
        ) : null}

        {noneAvailable ? (
          <Alert tone="warning" size="sm" role="none" icon={<KeyRound />} title="Aucune plateforme disponible">
            Configurez au moins une source (voir Réglages) pour lancer l&apos;analyse.
          </Alert>
        ) : null}

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={busy}
          loadingText="Analyse en cours…"
          disabled={noneAvailable}
          leftIcon={<Flame aria-hidden className="size-5" />}
        >
          Trouver ce qui cartonne
        </Button>
        <p className="-mt-2 text-center text-xs text-faint">
          {aiConfigured === false ? "Collecte et classement : 1 à 3 min." : "Collecte, abonnés des auteurs et analyse : 2 à 5 min."}
          {selected.some((platform) => platform !== "youtube") ? " Instagram et TikTok consomment des crédits Apify." : ""}
        </p>
      </form>
    </Card>
  );
}
