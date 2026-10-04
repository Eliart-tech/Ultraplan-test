"use client";

import {
  ChevronDown,
  Flame,
  KeyRound,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Swords,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, useField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PlatformIcon, platformLabel, scriptPlatformToPlatform } from "@/components/ui/platform-icon";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { VIRAL_NONE, tierCounts, viralReportTitle } from "@/components/viral/viral-utils";
import { formatDate } from "@/lib/client/format";
import { reportKey, viralReportKey } from "@/lib/client/storage";
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
  type CompetitorReport,
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
  type ViralReport,
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
  /** Saved competitor reports (newest first). */
  competitors?: CompetitorReport[];
  /** Keys (`competitorKey`) of the competitors sent with the request. */
  selectedCompetitors?: string[];
  /** The selection is the automatic one (same platform as the script). */
  competitorsAuto?: boolean;
  /** New explicit selection, or null to go back to the automatic one. */
  onCompetitorsChange?: (keys: string[] | null) => void;
  /** Saved "Ce qui cartonne" lab reports (newest first). */
  viralReports?: ViralReport[];
  /** Key (`viralReportKey`) of the lab report sent as `nicheRecipes`; undefined = none. */
  selectedViral?: string;
  /** The lab report choice is the automatic one (topic / niche match). */
  viralAuto?: boolean;
  /** New explicit choice (a key or VIRAL_NONE), or null to go back to the automatic one. */
  onViralChange?: (key: string | null) => void;
}

/** "Instagram Reels" → "Reels": the brand prefix is visually dropped so 4 platforms fit the segmented control. */
function PlatformName({ platform }: { platform: ScriptPlatform }) {
  const [brand, ...rest] = PLATFORM_LABELS[platform].label.split(" ");
  if (rest.length === 0) return <>{brand}</>;
  return (
    <>
      <span className="sr-only">{brand} </span>
      {rest.join(" ")}
    </>
  );
}

const MAX_COMPETITORS = 3;

/** Checkboxes of the saved competitors, labelled by the surrounding Field. */
function CompetitorChecklist({
  competitors,
  selected,
  onChange,
}: {
  competitors: CompetitorReport[];
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const field = useField();
  const full = selected.length >= MAX_COMPETITORS;
  return (
    <div role="group" aria-labelledby={field?.labelId} aria-describedby={field?.describedBy} className="flex flex-col gap-3">
      {competitors.map((report) => {
        const key = reportKey(report);
        const checked = selected.includes(key);
        const { account } = report.data;
        const details = [
          account.displayName?.trim() && account.displayName.trim() !== account.handle ? account.displayName.trim() : null,
          platformLabel(account.platform),
          `${report.stats.postCount} publications`,
          report.mode === "stats" ? "statistiques seules" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <Checkbox
            key={key}
            checked={checked}
            disabled={!checked && full}
            onCheckedChange={(next) =>
              onChange(next ? [...selected, key].slice(0, MAX_COMPETITORS) : selected.filter((item) => item !== key))
            }
            label={
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <PlatformIcon platform={account.platform} size="xs" tile={false} decorative />
                <span className="truncate">@{account.handle}</span>
              </span>
            }
            description={details}
          />
        );
      })}
    </div>
  );
}

/** "Budget malin · 14 cartons · 2 oct. 2026" — one saved lab report as a select option. */
function viralOptionLabel(report: ViralReport): string {
  const counts = tierCounts(report.posts);
  const hits = counts.explose + counts.cartonne;
  return [
    viralReportTitle(report),
    `${hits} ${hits > 1 ? "vidéos qui cartonnent" : "vidéo qui cartonne"}`,
    formatDate(report.createdAt),
    report.mode === "stats" ? "statistiques seules" : null,
  ]
    .filter(Boolean)
    .join(" · ");
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
  competitors = [],
  selectedCompetitors = [],
  competitorsAuto = true,
  onCompetitorsChange,
  viralReports = [],
  selectedViral,
  viralAuto = true,
  onViralChange,
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
  const viralReport = selectedViral ? viralReports.find((report) => viralReportKey(report) === selectedViral) : undefined;
  const viralHint =
    viralReports.length === 0
      ? undefined
      : viralReport
        ? `${viralAuto ? "Par défaut : votre analyse la plus récente proche de ce sujet ou de votre niche. " : ""}${
            viralReport.mode === "stats"
              ? "Statistiques seules : Claude s'appuie sur les titres des vidéos qui marchent, sans recettes."
              : "Claude bâtit le script sur la recette gagnante la plus adaptée (levier vues + levier abonnés), sans copier titres ni accroches."
          }`
        : viralAuto
          ? "Aucune analyse ne correspond à ce sujet ou à votre niche : choisissez-en une si elle s'applique."
          : "Aucune : le script ne s'appuie pas sur ce qui cartonne dans votre niche.";

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

          <Section title="Niche et différenciation" icon={<Swords />}>
            <Switch
              checked={settings.review}
              onCheckedChange={(review) => onChange({ review })}
              label="Relecture critique (2e passe)"
              description="Claude relit le brouillon en rédacteur en chef exigeant (accroche, rétention, différenciation) et l'améliore. Plus lent, meilleur."
            />
            <Field
              label="S'appuyer sur ce qui cartonne"
              hint={viralHint}
              labelAside={<Flame aria-hidden className="size-3.5 text-hot" />}
            >
              {viralReports.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-xs leading-relaxed text-muted">
                  Aucune analyse de votre niche.{" "}
                  <Link href="/ce-qui-cartonne" className="font-medium text-accent-ink underline-offset-2 hover:underline">
                    Lancez « Ce qui cartonne »
                  </Link>{" "}
                  pour bâtir vos scripts sur les recettes qui font des vues et des abonnés.
                </p>
              ) : (
                <Select
                  value={selectedViral ?? VIRAL_NONE}
                  onChange={(event) => onViralChange?.(event.target.value)}
                  options={[
                    { value: VIRAL_NONE, label: "Aucune analyse" },
                    ...viralReports.map((report) => ({ value: viralReportKey(report), label: viralOptionLabel(report) })),
                  ]}
                />
              )}
            </Field>
            {!viralAuto && viralReports.length > 0 ? (
              <button
                type="button"
                onClick={() => onViralChange?.(null)}
                className="-mt-2 text-xs font-medium text-accent-ink underline-offset-2 hover:underline"
              >
                Revenir au choix automatique
              </button>
            ) : null}
            <Field
              label="Se différencier de"
              group
              labelAside={
                competitors.length > 0 ? (
                  <span className="tabular-nums">
                    {selectedCompetitors.length}/{MAX_COMPETITORS}
                  </span>
                ) : null
              }
              hint={
                competitors.length === 0
                  ? undefined
                  : selectedCompetitors.length === 0
                    ? "Aucun concurrent sélectionné : le script ne tient pas compte de votre concurrence."
                    : competitorsAuto
                      ? `Par défaut : vos concurrents ${platformLabel(scriptPlatformToPlatform(settings.platform))}. Claude évite leurs accroches et angles, et exploite leurs angles morts.`
                      : "Claude évite leurs accroches, titres et angles, et exploite leurs angles morts."
              }
            >
              {competitors.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-xs leading-relaxed text-muted">
                  Aucun concurrent analysé.{" "}
                  <Link href="/concurrents" className="font-medium text-accent-ink underline-offset-2 hover:underline">
                    Analysez un créateur de votre niche
                  </Link>{" "}
                  pour que vos scripts s&apos;en démarquent.
                </p>
              ) : (
                <CompetitorChecklist
                  competitors={competitors}
                  selected={selectedCompetitors}
                  onChange={(keys) => onCompetitorsChange?.(keys)}
                />
              )}
            </Field>
            {!competitorsAuto && competitors.length > 0 ? (
              <button
                type="button"
                onClick={() => onCompetitorsChange?.(null)}
                className="-mt-2 text-xs font-medium text-accent-ink underline-offset-2 hover:underline"
              >
                Revenir à la sélection automatique
              </button>
            ) : null}
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
          {settings.research ? "Recherche web + écriture : 1 à 3 min" : "Écriture : 30 s à 1 min 30"}
          {settings.review ? ", relecture critique comprise (+30 s à 1 min)." : "."}
        </p>
      </div>
    </Card>
  );
}
