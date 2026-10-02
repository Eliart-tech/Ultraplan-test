/**
 * Script export: Markdown (for Notion, Obsidian, Google Docs) and plain text
 * (for a teleprompter app or a note). Both are pure and unit-tested;
 * `downloadFile` is the only browser-dependent helper.
 */

import { ANGLE_TYPE_LABELS, PACE_LABELS, PLATFORM_LABELS, TONE_LABELS } from "../script/levels";
import type { Angle, GeneratedScript, ScriptDraft, ScriptSettings, Topic } from "../types";
import { formatDate, formatDuration } from "./format";

/** Optional context printed in the header of the export. */
export interface ScriptExportContext {
  topic?: Pick<Topic, "title"> & Partial<Pick<Topic, "category" | "summary">>;
  angle?: Pick<Angle, "title"> & Partial<Pick<Angle, "type">>;
  settings?: Partial<Pick<ScriptSettings, "platform" | "durationSec" | "tone" | "pace" | "virality" | "pedagogy">>;
  /** Time zone for the generation date (tests pass "UTC"). */
  timeZone?: string;
}

type ExportableScript = ScriptDraft & Partial<Omit<GeneratedScript, keyof ScriptDraft>>;

const CONFIDENCE_LABELS = { haute: "haute", moyenne: "moyenne", faible: "faible" } as const;

/** "0–3 s". */
function timeRange(start: number, end: number): string {
  return `${Math.round(start)}–${Math.round(end)} s`;
}

function hashtagLine(hashtags: string[]): string {
  return hashtags
    .map((tag) => tag.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(" ");
}

/** "Plateforme : TikTok · Durée cible : 30 s · …" pieces shared by both formats. */
function metaLines(script: ExportableScript, context: ScriptExportContext): string[] {
  const lines: string[] = [];
  if (context.topic?.title) lines.push(`Sujet : ${context.topic.title}`);
  if (context.angle?.title) {
    const type = context.angle.type ? ` (${ANGLE_TYPE_LABELS[context.angle.type] ?? context.angle.type})` : "";
    lines.push(`Angle : ${context.angle.title}${type}`);
  }
  const settings = context.settings ?? {};
  const setup: string[] = [];
  if (settings.platform) setup.push(`Plateforme : ${PLATFORM_LABELS[settings.platform]?.label ?? settings.platform}`);
  if (settings.durationSec) setup.push(`Durée cible : ${settings.durationSec}\u00a0s`);
  if (settings.tone) setup.push(`Ton : ${TONE_LABELS[settings.tone]?.label ?? settings.tone}`);
  if (settings.pace) setup.push(`Débit : ${PACE_LABELS[settings.pace]?.label ?? settings.pace}`);
  if (typeof settings.virality === "number") setup.push(`Viralité : ${settings.virality}/100`);
  if (typeof settings.pedagogy === "number") setup.push(`Pédagogie : ${settings.pedagogy}/100`);
  if (setup.length) lines.push(setup.join(" · "));
  const stats: string[] = [];
  if (typeof script.wordCount === "number") {
    stats.push(
      typeof script.wordBudget === "number"
        ? `${script.wordCount} mots (budget ${script.wordBudget})`
        : `${script.wordCount} mots`,
    );
  }
  if (typeof script.estimatedDurationSec === "number") {
    stats.push(`durée estimée ${formatDuration(script.estimatedDurationSec)}`);
  }
  if (stats.length) lines.push(stats.join(" · "));
  if (script.createdAt) {
    const date = formatDate(script.createdAt, { timeZone: context.timeZone });
    if (date) lines.push(`Généré le ${date}${script.model ? ` avec ${script.model}` : ""}`);
  }
  return lines;
}

/** Collapses blank-line runs and trims, so empty sections leave no holes. */
function tidy(text: string): string {
  return `${text.replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

/**
 * Markdown export of a script: header (topic, angle, settings, word count),
 * hooks, beat-by-beat plan, teleprompter text, caption + hashtags, CTA,
 * strengths/risks, checklist, facts to verify, sources, warnings.
 */
export function scriptToMarkdown(script: ExportableScript, context: ScriptExportContext = {}): string {
  const out: string[] = [`# ${script.title.trim() || "Script sans titre"}`, ""];

  const meta = metaLines(script, context);
  if (meta.length) out.push(...meta.map((line) => `> ${line}  `), "");

  if (script.warnings?.length) {
    out.push("## À surveiller", "", ...script.warnings.map((warning) => `- ${warning}`), "");
  }

  if (script.hooks.length) {
    out.push("## Accroches", "");
    script.hooks.forEach((hook, index) => {
      out.push(`${index + 1}. **${hook.style || `Accroche ${index + 1}`}**${index === 0 ? " _(utilisée)_" : ""} — « ${hook.spoken} »`);
      if (hook.onScreenText) out.push(`   - Texte écran : ${hook.onScreenText}`);
      if (hook.visual) out.push(`   - Visuel : ${hook.visual}`);
      if (hook.rationale) out.push(`   - Pourquoi : ${hook.rationale}`);
    });
    out.push("");
  }

  if (script.beats.length) {
    out.push("## Déroulé", "");
    for (const beat of script.beats) {
      out.push(`### ${timeRange(beat.startSec, beat.endSec)} · ${beat.label}`, "");
      if (beat.voiceover) out.push(`- **Voix off :** ${beat.voiceover}`);
      if (beat.onScreenText) out.push(`- **Texte écran :** ${beat.onScreenText}`);
      if (beat.visual) out.push(`- **Visuel :** ${beat.visual}`);
      if (beat.editing) out.push(`- **Montage :** ${beat.editing}`);
      out.push("");
    }
  }

  if (script.fullScript.trim()) out.push("## Texte complet (prompteur)", "", script.fullScript.trim(), "");

  if (script.caption.trim() || script.hashtags.length) {
    out.push("## Légende", "");
    if (script.caption.trim()) out.push(script.caption.trim(), "");
    const tags = hashtagLine(script.hashtags);
    if (tags) out.push(tags, "");
  }

  if (script.cta.trim()) out.push("## Appel à l'action", "", script.cta.trim(), "");

  if (script.strengths.length) out.push("## Points forts", "", ...script.strengths.map((item) => `- ${item}`), "");
  if (script.risks.length) out.push("## Risques", "", ...script.risks.map((item) => `- ${item}`), "");

  if (script.checklist.length) {
    out.push(
      "## Checklist",
      "",
      ...script.checklist.map(
        (item) => `- [${item.passed ? "x" : " "}] ${item.criterion}${item.comment ? ` — ${item.comment}` : ""}`,
      ),
      "",
    );
  }

  if (script.factsToVerify.length) {
    out.push(
      "## Faits à vérifier",
      "",
      ...script.factsToVerify.map((fact) => {
        const source = fact.sourceUrl ? ` — [source](${fact.sourceUrl})` : " — sans source";
        return `- [ ] ${fact.claim} _(confiance : ${CONFIDENCE_LABELS[fact.confidence] ?? fact.confidence})_${source}`;
      }),
      "",
    );
  }

  const sources = dedupeSources([...script.sources, ...(script.research?.sources ?? [])]);
  if (sources.length) {
    out.push("## Sources", "", ...sources.map((link) => `- [${link.title || link.url}](${link.url})${link.source ? ` — ${link.source}` : ""}`), "");
  }

  if (script.research?.facts.trim()) out.push("## Recherche web", "", script.research.facts.trim(), "");

  out.push("---", "", "_Exporté depuis TrendScript._");
  return tidy(out.join("\n"));
}

function dedupeSources(links: { title: string; url: string; source?: string }[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (!link.url || seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function section(title: string, body: string[]): string[] {
  return body.length ? [title.toUpperCase(), ...body, ""] : [];
}

/**
 * Plain-text export: same content as the Markdown without any markup —
 * readable in a notes app or pasted into a teleprompter.
 */
export function scriptToText(script: ExportableScript, context: ScriptExportContext = {}): string {
  const title = script.title.trim() || "Script sans titre";
  const out: string[] = [title, "=".repeat(Math.min(60, title.length)), ""];

  const meta = metaLines(script, context);
  if (meta.length) out.push(...meta, "");

  out.push(...section("À surveiller", (script.warnings ?? []).map((warning) => `! ${warning}`)));

  out.push(
    ...section(
      "Accroches",
      script.hooks.flatMap((hook, index) => [
        `${index + 1}. ${hook.style ? `[${hook.style}] ` : ""}« ${hook.spoken} »${index === 0 ? " (utilisée)" : ""}`,
        ...(hook.onScreenText ? [`   Texte écran : ${hook.onScreenText}`] : []),
        ...(hook.visual ? [`   Visuel : ${hook.visual}`] : []),
      ]),
    ),
  );

  out.push(
    ...section(
      "Déroulé",
      script.beats.flatMap((beat) => [
        `[${timeRange(beat.startSec, beat.endSec)}] ${beat.label}`,
        ...(beat.voiceover ? [`  Voix off : ${beat.voiceover}`] : []),
        ...(beat.onScreenText ? [`  Texte écran : ${beat.onScreenText}`] : []),
        ...(beat.visual ? [`  Visuel : ${beat.visual}`] : []),
        ...(beat.editing ? [`  Montage : ${beat.editing}`] : []),
        "",
      ]),
    ),
  );

  out.push(...section("Texte complet (prompteur)", script.fullScript.trim() ? [script.fullScript.trim()] : []));

  const tags = hashtagLine(script.hashtags);
  out.push(...section("Légende", [script.caption.trim(), tags].filter(Boolean)));
  out.push(...section("Appel à l'action", script.cta.trim() ? [script.cta.trim()] : []));
  out.push(...section("Points forts", script.strengths.map((item) => `- ${item}`)));
  out.push(...section("Risques", script.risks.map((item) => `- ${item}`)));
  out.push(
    ...section(
      "Checklist",
      script.checklist.map((item) => `${item.passed ? "[x]" : "[ ]"} ${item.criterion}${item.comment ? ` — ${item.comment}` : ""}`),
    ),
  );
  out.push(
    ...section(
      "Faits à vérifier",
      script.factsToVerify.map(
        (fact) =>
          `- ${fact.claim} (confiance : ${CONFIDENCE_LABELS[fact.confidence] ?? fact.confidence})${fact.sourceUrl ? ` — ${fact.sourceUrl}` : " — sans source"}`,
      ),
    ),
  );
  const sources = dedupeSources([...script.sources, ...(script.research?.sources ?? [])]);
  out.push(...section("Sources", sources.map((link) => `- ${link.title ? `${link.title} : ` : ""}${link.url}`)));
  if (script.research?.facts.trim()) out.push(...section("Recherche web", [script.research.facts.trim()]));

  return tidy(out.join("\n"));
}

/** "trendscript-pourquoi-tout-le-monde-parle-de.md" — ASCII, ≤ 60 chars. */
export function scriptFileName(title: string, extension: "md" | "txt" | "json"): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return `trendscript-${slug || "script"}.${extension}`;
}

/**
 * Downloads `content` as a file (Blob + temporary link). Browser only; call
 * from an event handler.
 *
 * @example downloadFile(scriptFileName(script.title, "md"), scriptToMarkdown(script, ctx), "text/markdown")
 */
export function downloadFile(name: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
