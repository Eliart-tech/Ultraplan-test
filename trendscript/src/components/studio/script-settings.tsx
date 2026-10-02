"use client";

import { ChevronDown, KeyRound, Lightbulb, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { MAX_SENSITIVE_VIRALITY, topicRisk } from "@/lib/script/guardrails";
import {
  CTA_LABELS,
  DURATION_LABELS,
  FORMAT_LABELS,
  HOOK_STYLE_LABELS,
  PACE_LABELS,
  PLATFORM_LABELS,
  TONE_LABELS,
  combinationAdvice,
  pedagogyBand,
  viralityBand,
} from "@/lib/script/levels";
import { wordBudget } from "@/lib/script/metrics";
import {
  CTA_TYPES,
  DURATIONS,
  HOOK_STYLES,
  SCRIPT_PLATFORMS,
  SPEAKING_PACES,
  TONES,
  VIDEO_FORMATS,
  type CreatorProfile,
  type CtaType,
  type DurationSec,
  type HookStyle,
  type ScriptPlatform,
  type ScriptSettings,
  type SpeakingPace,
  type Tone,
  type Topic,
  type VideoFormat,
} from "@/lib/types";
import { CTA_DETAIL } from "./studio-options";

const MARKS = [20, 40, 60, 80];
const SENSITIVE_TONES = new Set<Tone>(["humoristique", "provocateur"]);

export interface ScriptSettingsPanelProps {
  settings: ScriptSettings;
  onChange: (patch: Partial<ScriptSettings>) => void;
  topic: Topic;
  /** French notices from `applyGuardrails` (shown when non-empty). */
  notices: string[];
  /** null while /api/sources is loading. */
  aiConfigured: boolean | null;
  profile: CreatorProfile;
  profileFilled: boolean;
  onGenerate: () => void;
  busy: boolean;
  hasResult: boolean;
}

/** "Instagram Reels" — the brand prefix is visually dropped on phones to fit the segmented control. */
function PlatformName({ platform }: { platform: ScriptPlatform }) {
  const [brand, ...rest] = PLATFORM_LABELS[platform].label.split(" ");
  if (rest.length === 0) return <>{brand}</>;
  return (
    <>
      <span className="max-sm:sr-only">{brand} </span>
      {rest.join(" ")}
    </>
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-5 border-t border-line px-5 py-5 first:border-t-0 sm:px-6">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted [&_svg]:size-3.5">
        <span aria-hidden className="text-faint">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Settings of the Script step: format, style, options, creator profile
 * prompt, guardrail notices and the generate button. On phones it
 * collapses once a script exists so the result stays close to the top.
 */
export function ScriptSettingsPanel({
  settings,
  onChange,
  topic,
  notices,
  aiConfigured,
  profile,
  profileFilled,
  onGenerate,
  busy,
  hasResult,
}: ScriptSettingsPanelProps) {
  const [mobileOpen, setMobileOpen] = useState(!hasResult);
  const bodyId = useId();
  const risk = topicRisk(topic);
  const sensitive = risk !== "vert";
  const virality = viralityBand(settings.virality);
  const pedagogy = pedagogyBand(settings.pedagogy);
  const advice = combinationAdvice(settings.virality, settings.pedagogy);
  const budget = wordBudget(settings.durationSec, settings.pace);
  const ctaDetail = CTA_DETAIL[settings.cta];
  const aiMissing = aiConfigured === false;
  const viralityCapped = sensitive && settings.virality > MAX_SENSITIVE_VIRALITY;

  return (
    <Card
      as="section"
      aria-label="Réglages du script"
      className="lg:sticky lg:top-36 lg:flex lg:max-h-[calc(100dvh-10rem)] lg:flex-col"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <SlidersHorizontal aria-hidden className="size-[18px] text-accent" />
          Réglages du script
        </h2>
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={bodyId}
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-accent-ink transition-colors duration-150 hover:bg-accent-soft lg:hidden"
        >
          {mobileOpen ? "Replier" : "Modifier"}
          <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200", mobileOpen && "rotate-180")} />
        </button>
      </div>
      {!mobileOpen ? (
        <p className="px-5 pb-4 pt-1 text-sm text-muted sm:px-6 lg:hidden">
          {PLATFORM_LABELS[settings.platform].label} · {settings.durationSec} s · {TONE_LABELS[settings.tone].label} · viralité{" "}
          {settings.virality} · pédagogie {settings.pedagogy}
        </p>
      ) : null}

      {/* On desktop the settings scroll inside the card so the button below stays visible. */}
      <div
        id={bodyId}
        className={cn("lg:mt-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain", !mobileOpen && "hidden lg:block")}
      >
        <div className="mt-2 lg:mt-0">
          <Section title="Format" icon={<SlidersHorizontal />}>
            <Field label="Plateforme" group hint={PLATFORM_LABELS[settings.platform].description}>
              <Segmented
                fullWidth
                size="sm"
                value={settings.platform}
                onValueChange={(platform) => onChange({ platform })}
                options={SCRIPT_PLATFORMS.map((platform) => ({
                  value: platform,
                  label: <PlatformName platform={platform} />,
                }))}
              />
            </Field>

            <Field
              label="Durée"
              group
              hint={`${DURATION_LABELS[settings.durationSec]} · environ ${budget} mots de voix off au débit choisi.`}
            >
              <Segmented
                fullWidth
                size="sm"
                value={String(settings.durationSec)}
                onValueChange={(value) => onChange({ durationSec: Number(value) as DurationSec })}
                options={DURATIONS.map((duration) => ({
                  value: String(duration),
                  label: `${duration} s`,
                  description: DURATION_LABELS[duration],
                }))}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <Field label="Format vidéo" hint={FORMAT_LABELS[settings.format].description}>
                <Select
                  value={settings.format}
                  onChange={(event) => onChange({ format: event.target.value as VideoFormat })}
                  options={VIDEO_FORMATS.map((format) => ({ value: format, label: FORMAT_LABELS[format].label }))}
                />
              </Field>
              <Field label="Débit" group hint={PACE_LABELS[settings.pace].description}>
                <Segmented
                  fullWidth
                  size="sm"
                  value={settings.pace}
                  onValueChange={(pace: SpeakingPace) => onChange({ pace })}
                  options={SPEAKING_PACES.map((pace) => ({ value: pace, label: PACE_LABELS[pace].label }))}
                />
              </Field>
            </div>
          </Section>

          <Section title="Style" icon={<Sparkles />}>
            <Field
              label="Viralité"
              hint={virality.description}
              labelAside={
                viralityCapped ? (
                  <Badge size="sm" tone="warning">
                    Plafonnée à {MAX_SENSITIVE_VIRALITY}
                  </Badge>
                ) : null
              }
            >
              <Slider
                value={settings.virality}
                onValueChange={(value) => onChange({ virality: value })}
                tone="hot"
                marks={MARKS}
                formatValue={(value) => `${value} · ${viralityBand(value).label}`}
                minLabel="Sobre"
                maxLabel="Ultra-viral"
              />
            </Field>

            <Field label="Pédagogie" hint={pedagogy.description}>
              <Slider
                value={settings.pedagogy}
                onValueChange={(value) => onChange({ pedagogy: value })}
                marks={MARKS}
                formatValue={(value) => `${value} · ${pedagogyBand(value).label}`}
                minLabel="Divertissement"
                maxLabel="Cours structuré"
              />
            </Field>

            {advice ? (
              <p className="flex gap-2.5 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-xs leading-relaxed text-muted">
                <Lightbulb aria-hidden className="mt-px size-4 shrink-0 text-accent" />
                <span>
                  <span className="font-semibold text-ink">Combinaison : </span>
                  {advice}
                </span>
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <Field label="Ton" hint={TONE_LABELS[settings.tone].description}>
                <Select
                  value={settings.tone}
                  onChange={(event) => onChange({ tone: event.target.value as Tone })}
                  options={TONES.map((tone) => ({
                    value: tone,
                    label: sensitive && SENSITIVE_TONES.has(tone) ? `${TONE_LABELS[tone].label} (exclu sur ce sujet)` : TONE_LABELS[tone].label,
                  }))}
                />
              </Field>
              <Field label="Style d'accroche" hint={HOOK_STYLE_LABELS[settings.hookStyle].description}>
                <Select
                  value={settings.hookStyle}
                  onChange={(event) => onChange({ hookStyle: event.target.value as HookStyle })}
                  options={HOOK_STYLES.map((style) => ({ value: style, label: HOOK_STYLE_LABELS[style].label }))}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <Field label="Appel à l'action" hint={CTA_LABELS[settings.cta].description}>
                <Select
                  value={settings.cta}
                  onChange={(event) => onChange({ cta: event.target.value as CtaType })}
                  options={CTA_TYPES.map((cta) => ({ value: cta, label: CTA_LABELS[cta].label }))}
                />
              </Field>
              {ctaDetail ? (
                <Field label={ctaDetail.label} optional>
                  <Input
                    value={settings.ctaDetail ?? ""}
                    maxLength={200}
                    onChange={(event) => onChange({ ctaDetail: event.target.value })}
                    placeholder={ctaDetail.placeholder}
                    autoComplete="off"
                  />
                </Field>
              ) : null}
            </div>
          </Section>

          <Section title="Options" icon={<ShieldCheck />}>
            <Switch
              checked={settings.research}
              onCheckedChange={(research) => onChange({ research })}
              label="Recherche web"
              description="Claude vérifie les faits en ligne — plus lent, plus fiable."
            />
            <Checkbox
              checked={settings.sponsored}
              onCheckedChange={(sponsored) => onChange({ sponsored })}
              label="Partenariat rémunéré"
              description="Ajoute la mention légale « Publicité / Collaboration commerciale »."
            />
            <Checkbox
              checked={settings.aiVisuals}
              onCheckedChange={(aiVisuals) => onChange({ aiVisuals })}
              label="Visuels IA réalistes"
              description="Rappelle d'étiqueter le contenu généré par IA sur la plateforme."
            />
            <Field
              label="Instructions libres"
              optional
              labelAside={<span className="tabular-nums">{(settings.extraInstructions ?? "").length}/1000</span>}
            >
              <Textarea
                value={settings.extraInstructions ?? ""}
                maxLength={1000}
                rows={3}
                autoResize
                onChange={(event) => onChange({ extraInstructions: event.target.value })}
                placeholder="Ex. : cite le chiffre de l'Insee, termine sur une question, évite le mot « incroyable »…"
              />
            </Field>
          </Section>
        </div>
        <div className="space-y-3 border-t border-line px-5 py-5 sm:px-6">
          {notices.length > 0 ? (
            <Alert tone="warning" size="sm" title="Garde-fous appliqués à ce sujet" role="none">
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {profileFilled ? (
            <p className="flex items-center gap-2 text-xs text-muted">
              <UserRound aria-hidden className="size-3.5 shrink-0 text-faint" />
              <span className="min-w-0 truncate">
                Profil appliqué :{" "}
                <span className="font-medium text-ink">{profile.name.trim() || profile.niche.trim() || "votre profil"}</span>
              </span>
              <Link href="/reglages" className="ml-auto shrink-0 font-medium text-accent-ink hover:underline">
                Modifier
              </Link>
            </p>
          ) : (
            <Alert
              tone="info"
              size="sm"
              role="none"
              icon={<UserRound />}
              title="Complétez votre profil pour des scripts à votre image"
              action={
                <ButtonLink href="/reglages" size="sm" variant="secondary">
                  Compléter mon profil
                </ButtonLink>
              }
            >
              Audience, positionnement, tics de langage, sujets à éviter : Claude s&apos;en sert à chaque génération.
            </Alert>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t border-line px-5 py-4 sm:px-6">
        {aiMissing ? (
          <Alert tone="warning" size="sm" icon={<KeyRound />} title="Génération indisponible">
            Ajoutez <code className="rounded bg-surface px-1 font-mono text-xs">ANTHROPIC_API_KEY</code> dans les
            variables d&apos;environnement, puis redémarrez l&apos;application.{" "}
            <Link href="/reglages" className="font-medium text-accent-ink underline-offset-2 hover:underline">
              Voir Réglages
            </Link>
          </Alert>
        ) : null}

        <Button
          size="lg"
          fullWidth
          onClick={onGenerate}
          disabled={aiMissing}
          loading={busy}
          loadingText="Génération en cours…"
          leftIcon={hasResult ? <RefreshCw aria-hidden className="size-5" /> : <Sparkles aria-hidden className="size-5" />}
        >
          {hasResult ? "Régénérer avec ces réglages" : "Générer le script"}
        </Button>
        <p className="text-center text-xs text-faint">
          {settings.research ? "Recherche web + écriture : 1 à 3 min." : "Écriture : 30 s à 1 min 30."}
        </p>
      </div>
    </Card>
  );
}
