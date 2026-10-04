"use client";

/**
 * `@edition/ui`: what the reused components render, through build-time
 * patches (artifact/build.mjs → patchSources), where the server version
 * talks about ANTHROPIC_API_KEY, restarts or a server — and the snapshot
 * dating of the Sujets step. Hooks read the live edition state, so the text
 * follows a refusal or a late `use()` without a reload.
 */

import { CalendarClock, Info } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useNow } from "@/lib/client/use-now";
import type { Analysis, SourceId, Topic } from "@/lib/types";
import { getEditionState, useEditionState } from "./capabilities";
import { ageLabel, frenchDate, frenchDateTime, getSnapshot, STALE_AFTER_MS } from "./edition";
import { claudeProblem, claudeProblemSentence, firecrawlMode } from "./edition-text";
import type { EditionAnalysis, EditionTopic } from "./snapshot-types";

// ---------------------------------------------------------------------------
// Claude not usable here
// ---------------------------------------------------------------------------

/** Why Claude is not usable here, as a fragment ("accès à Claude refusé pour cette page : …"). */
export function ClaudeProblem() {
  const state = useEditionState();
  return <>{claudeProblem(state)}</>;
}

/** Header pill: "Vérification…" while `use()` has not answered, else "Mode sans IA". */
export function noAiPillLabel(): string {
  return getEditionState().claude === "pending" ? "Vérification…" : "Mode sans IA";
}

/** Header pill title / aria-label part. */
export function noAiDescription(): string {
  const state = getEditionState();
  return state.claude === "pending" ? "Vérification de l'accès à Claude" : `Mode sans IA : ${claudeProblem(state)}`;
}

/** Radar action bar, in place of "Mode sans IA : sujets regroupés automatiquement, sans angles." */
export function RadarNoAiText() {
  const state = useEditionState();
  return (
    <>
      {state.claude === "pending"
        ? "Vérification de l'accès à Claude…"
        : "Mode sans IA : sujets regroupés automatiquement, sans angles."}
    </>
  );
}

/** Sujets step, basic mode without Claude. */
export function BasicModeText() {
  const state = useEditionState();
  return (
    <>
      Les sujets sont regroupés automatiquement à partir des données réelles, sans angles proposés.{" "}
      {claudeProblemSentence(state)} Avec Claude, les signaux sont regroupés en sujets, leur pertinence pour votre niche
      est évaluée et trois angles sont proposés.
    </>
  );
}

/** Script step, in place of "Ajoutez ANTHROPIC_API_KEY … puis redémarrez". */
export function ScriptUnavailableText() {
  const state = useEditionState();
  return <>{claudeProblemSentence(state)} Le script est écrit par Claude avec votre compte claude.ai.</>;
}

// ---------------------------------------------------------------------------
// Concurrents & Ce qui cartonne
// ---------------------------------------------------------------------------

/** Form notice without Claude, in place of "Sans ANTHROPIC_API_KEY, vous obtenez …". */
export function StatsModeText({ rest }: { rest: string }) {
  const state = useEditionState();
  return (
    <>
      {claudeProblemSentence(state)} Vous obtenez {rest}
    </>
  );
}

/** Report notice without Claude, in place of "Claude n'est pas configuré sur ce serveur (ANTHROPIC_API_KEY) : voici …". */
export function StatsOnlyText({ rest }: { rest: string }) {
  const state = useEditionState();
  return (
    <>
      {claudeProblemSentence(state)} Voici {rest}
    </>
  );
}

/** Lab form when no platform can be read: the lab is the server version's. */
export function ViralServerOnlyText() {
  return (
    <>
      Le laboratoire a besoin de la version serveur de TrendScript : les vidéos d&apos;une niche et le nombre
      d&apos;abonnés de leurs auteurs se lisent via Apify (Instagram, TikTok) et l&apos;API officielle de YouTube, avec
      des clés qui ne se saisissent pas dans cette page. Rien n&apos;est simulé ici.
    </>
  );
}

/** Hint under "Générer le script": duration, and the Firecrawl credits a script spends. */
export function ScriptTimingHint({ research, review }: { research: boolean; review: boolean }) {
  const state = useEditionState();
  const firecrawl = firecrawlMode(state).mode !== "off";
  const reviewPart = review ? ", relecture critique comprise (+30 s à 1 min)." : ".";
  if (research) {
    return (
      <>
        Recherche web + écriture : 1 à 3 min{reviewPart}
        {firecrawl ? " Jusqu'à 6 crédits Firecrawl (5 recherches + 1 flux d'actualités)." : null}
      </>
    );
  }
  return (
    <>
      Écriture : 30 s à 1 min 30{reviewPart}
      {firecrawl ? " 1 crédit Firecrawl (titres de presse récents)." : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

/** Top of Réglages, after the page heading: what applies in this edition, from the live state. */
export function SettingsNote() {
  const state = useEditionState();
  const now = useNow();
  const { capturedAt } = getSnapshot();
  const firecrawl = firecrawlMode(state);
  const claude =
    state.claude === "available"
      ? "Claude répond avec votre compte claude.ai (la page vous demande l'autorisation à la première analyse)."
      : claudeProblemSentence(state);
  const live =
    firecrawl.mode === "live"
      ? "Google Trends et Google Actualités sont lus en direct par votre connecteur Firecrawl"
      : firecrawl.mode === "maybe"
        ? "Google Trends et Google Actualités sont lus en direct par votre connecteur Firecrawl s'il est connecté à votre compte claude.ai (vérifié à la première analyse)"
        : `Pas de données en direct (${firecrawl.why})`;
  return (
    <Alert tone="info" title="Édition HTML : aucune clé à configurer" role="none" className="mt-6">
      {claude} {live} ; le reste vient de l&apos;instantané réel du {frenchDateTime(capturedAt)} (heure de Paris,{" "}
      {ageLabel(Math.max(0, now - Date.parse(capturedAt)))}). Les sources « à configurer » et les étapes avec des clés
      API ou <code className="font-mono text-xs">.env.local</code> concernent la version serveur de TrendScript (voir
      trendscript/README.md).
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Snapshot dating (Sujets step)
// ---------------------------------------------------------------------------

const SNAPSHOT_LABELS: Partial<Record<SourceId, string>> = {
  google_trends: "Google Trends (liste complète)",
  google_news: "Google Actualités (à la une)",
  wikipedia: "Wikipédia",
  youtube_rss: "YouTube (RSS)",
};

const LIVE_LABELS: Partial<Record<SourceId, string>> = {
  google_trends: "les 10 dernières tendances Google",
  google_news: "Google Actualités",
};

function joinFr(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

function metaOf(analysis: Analysis) {
  const meta = (analysis as EditionAnalysis).edition;
  return meta && meta.snapshotSources.length > 0 ? meta : null;
}

/**
 * Under the analysis summary, never dismissible: which sources come from the
 * snapshot, its date in Paris time and its age now, and what that means for
 * the topics' timing.
 */
export function SnapshotNotice({ analysis, now }: { analysis: Analysis; now: number }) {
  const meta = metaOf(analysis);
  if (!meta) return null;
  const age = Math.max(0, now - Date.parse(meta.capturedAt));
  const old = age > STALE_AFTER_MS;
  const fromSnapshot = meta.snapshotSources.map((id) => SNAPSHOT_LABELS[id] ?? id);
  const live = meta.liveSources.map((id) => LIVE_LABELS[id] ?? id);
  const dated = analysis.topics.filter((topic) => (topic as EditionTopic).editionAsOf).length;
  return (
    <Alert
      tone={old ? "warning" : "info"}
      size="sm"
      role="none"
      icon={<CalendarClock />}
      title={`Données de l'instantané du ${frenchDateTime(meta.capturedAt)} (heure de Paris), ${ageLabel(age)}`}
    >
      {joinFr(fromSnapshot)} {fromSnapshot.length > 1 ? "viennent" : "vient"} de cet instantané inclus dans la page
      {old ? " : ces sujets montaient à ce moment-là et ne sont peut-être plus d'actualité." : "."}{" "}
      {live.length ? `${joinFr(live).replace(/^l/, "L")} : lu${live.length > 1 ? "s" : ""} en direct via votre connecteur Firecrawl. ` : null}
      {dated
        ? `Pour ${dated} sujet${dated > 1 ? "s" : ""} sans donnée en direct, le timing (Flash, Court…) et « Pourquoi maintenant » décrivent la situation au moment de l'instantané : vérifiez qu'un sujet est toujours d'actualité avant de le tourner.`
        : null}
    </Alert>
  );
}

/**
 * Studio step title: when every topic of the analysis is dated by an old
 * snapshot (none has live data), "Les sujets qui montent" would state as
 * current what was rising then — say when instead.
 */
export function stepMeta<T extends { title: string }>(meta: T, step: string, analysis: Analysis | null | undefined): T {
  if (step !== "sujets" || !analysis) return meta;
  const edition = metaOf(analysis);
  const topics = analysis.topics as EditionTopic[];
  if (!edition || topics.length === 0 || !topics.every((topic) => topic.editionAsOf)) return meta;
  return { ...meta, title: `Les sujets qui montaient le ${frenchDate(edition.capturedAt)}` };
}

/** "Instantané du 2 oct. 2026" chip, next to the signal count. */
export function SnapshotBadge({ analysis }: { analysis: Analysis }) {
  const meta = metaOf(analysis);
  if (!meta) return null;
  return (
    <Badge tone={meta.liveSources.length ? "neutral" : "warning"} icon={<Info />}>
      Instantané du {frenchDate(meta.capturedAt)}
      {meta.liveSources.length ? " + direct" : ""}
    </Badge>
  );
}

/** Timing badge of a topic dated by the snapshot: same badge, said to be "à l'instantané". */
export function lifespanMeta<T extends { label: string; tone: BadgeTone; window: string }>(meta: T, topic: Topic): T {
  const asOf = (topic as EditionTopic).editionAsOf;
  if (!asOf) return meta;
  // "Pic de 24 à 48 h : publiez aujourd'hui ou demain." → keep the profile, drop the advice (it was for then).
  const profile = meta.window.split(" : ")[0].replace(/\.$/, "");
  return {
    ...meta,
    tone: "neutral",
    label: `${meta.label} (à l'instantané)`,
    window: `Au moment de l'instantané du ${frenchDate(asOf)} : ${profile.charAt(0).toLowerCase()}${profile.slice(1)}. Le sujet a peut-être fini de monter depuis : vérifiez qu'il est toujours d'actualité avant de publier.`,
  };
}
