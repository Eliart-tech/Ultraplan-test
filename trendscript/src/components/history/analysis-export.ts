/**
 * Labels and Markdown export of a saved analysis (Historique → "Exporter
 * .md" / "Copier"). Pure and unit-tested; `timeZone` is injectable so tests
 * don't depend on the machine's zone.
 */

import { platformLabel } from "@/components/ui/platform-icon";
import { formatDateTime, formatSignalMetrics } from "@/lib/client/format";
import { ANGLE_TYPE_LABELS } from "@/lib/script/levels";
import type { Analysis, Level3, Lifespan, Signal, Topic } from "@/lib/types";

export const LIFESPAN_LABELS: Record<Lifespan, string> = {
  flash: "Flash (quelques jours)",
  court: "Court terme",
  durable: "Durable",
};

export const LEVEL3_LABELS: Record<Level3, string> = {
  faible: "faible",
  moyenne: "moyenne",
  elevee: "élevée",
};

function displayName(code: string, type: "region" | "language"): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["fr"], { type }).of(type === "region" ? code.toUpperCase() : code) ?? code;
  } catch {
    return code;
  }
}

/** "FR" → "France" (the code itself when unknown). */
export function countryName(geo: string): string {
  return displayName(geo, "region");
}

/** "fr" → "français". */
export function languageName(language: string): string {
  return displayName(language, "language");
}

/** Niche of the analysis, or a generic title when it had none. */
export function analysisTitle(analysis: Analysis): string {
  const niche = typeof analysis.request?.niche === "string" ? analysis.request.niche.trim() : "";
  return niche || "Tendances du moment";
}

/** Topics sorted by total score, best first (missing scores count as 0). */
export function rankedTopics(analysis: Analysis): Topic[] {
  const topics = Array.isArray(analysis.topics) ? analysis.topics : [];
  return [...topics].sort((a, b) => (b?.scores?.total ?? 0) - (a?.scores?.total ?? 0));
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function evidenceLine(signal: Signal): string {
  const title = oneLine(signal.title || signal.url || "Signal");
  const link = signal.url ? `[${title}](${signal.url})` : title;
  const details = [
    platformLabel(signal.platform),
    signal.author ? oneLine(signal.author) : "",
    ...formatSignalMetrics(signal.metrics ?? {}).slice(0, 2),
  ].filter(Boolean);
  return `- ${link}${details.length ? ` — ${details.join(" · ")}` : ""}`;
}

function topicSection(topic: Topic, index: number, signals: Map<string, Signal>): string[] {
  const out: string[] = [];
  const score = typeof topic.scores?.total === "number" ? ` — score ${Math.round(topic.scores.total)}/100` : "";
  out.push(`## ${index + 1}. ${oneLine(topic.title || "Sujet sans titre")}${score}`, "");

  const facts = [
    topic.category ? oneLine(topic.category) : "",
    Array.isArray(topic.platforms) && topic.platforms.length ? topic.platforms.map(platformLabel).join(", ") : "",
    topic.lifespan ? `durée de vie : ${LIFESPAN_LABELS[topic.lifespan] ?? topic.lifespan}` : "",
    topic.saturation ? `saturation : ${LEVEL3_LABELS[topic.saturation] ?? topic.saturation}` : "",
  ].filter(Boolean);
  if (facts.length) out.push(`_${facts.join(" · ")}_`, "");

  if (topic.summary?.trim()) out.push(topic.summary.trim(), "");
  if (topic.whyNow?.trim()) out.push(`**Pourquoi maintenant :** ${topic.whyNow.trim()}`, "");
  if (topic.sensitivity && topic.sensitivity.level !== "faible") {
    const reason = topic.sensitivity.reason?.trim();
    out.push(
      `**Sensibilité ${LEVEL3_LABELS[topic.sensitivity.level] ?? topic.sensitivity.level} :** ${reason || "à traiter avec prudence"}`,
      "",
    );
  }

  const angles = Array.isArray(topic.angles) ? topic.angles : [];
  if (angles.length) {
    out.push("**Angles proposés :**", "");
    for (const angle of angles) {
      const type = ANGLE_TYPE_LABELS[angle.type] ?? angle.type;
      out.push(`- **${oneLine(angle.title)}** (${type})${angle.pitch ? ` — ${oneLine(angle.pitch)}` : ""}`);
      if (angle.hook) out.push(`  - Accroche : « ${oneLine(angle.hook)} »`);
    }
    out.push("");
  }

  const evidence = (Array.isArray(topic.signalIds) ? topic.signalIds : [])
    .map((id) => signals.get(id))
    .filter((signal): signal is Signal => Boolean(signal))
    .slice(0, 6);
  if (evidence.length) out.push("**Preuves :**", "", ...evidence.map(evidenceLine), "");
  return out;
}

/**
 * Markdown report of an analysis: request, mode, topics by score (summary,
 * why now, sensitivity, angles, up to 6 evidence links each) and notes.
 */
export function analysisToMarkdown(analysis: Analysis, { timeZone }: { timeZone?: string } = {}): string {
  const request = analysis.request ?? { geo: "", language: "", niche: "", keywords: [], sources: [], maxTopics: 0 };
  const topics = rankedTopics(analysis);
  const signals = new Map(
    (Array.isArray(analysis.signals) ? analysis.signals : []).map((signal) => [signal.id, signal]),
  );

  const meta: string[] = [];
  const where = [
    request.geo ? `Pays : ${countryName(request.geo)}` : "",
    request.language ? `Langue : ${languageName(request.language)}` : "",
    `Mode : ${analysis.mode === "ai" ? `IA${analysis.model ? ` (${analysis.model})` : ""}` : "sans IA"}`,
  ].filter(Boolean);
  meta.push(where.join(" · "));
  if (Array.isArray(request.keywords) && request.keywords.length)
    meta.push(`Mots-clés : ${request.keywords.join(", ")}`);
  const date = formatDateTime(analysis.createdAt, { timeZone });
  meta.push(
    [date ? `Réalisée le ${date}` : "", `${topics.length} sujet${topics.length > 1 ? "s" : ""}`]
      .filter(Boolean)
      .join(" · "),
  );

  const out: string[] = [
    `# Analyse de tendances — ${analysisTitle(analysis)}`,
    "",
    ...meta.map((line) => `> ${line}  `),
    "",
  ];
  topics.forEach((topic, index) => out.push(...topicSection(topic, index, signals)));
  if (topics.length === 0) out.push("_Aucun sujet dans cette analyse._", "");

  const notes = Array.isArray(analysis.notes) ? analysis.notes.filter((note) => note?.trim()) : [];
  if (notes.length) out.push("## Notes", "", ...notes.map((note) => `- ${oneLine(note)}`), "");

  out.push("---", "", "_Exporté depuis TrendScript._");
  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}
