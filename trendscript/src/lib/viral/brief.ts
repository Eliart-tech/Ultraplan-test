/**
 * "Ce qui cartonne" report → what the Studio needs. Pure and client-safe.
 *
 * - `toViralBrief`: the compact "what works in my niche" context sent with a
 *   script request (`ScriptRequest.nicheRecipes`). Works on "stats" reports
 *   too (Claude unavailable): then only real, deterministic material is used
 *   (the titles of the videos that went furthest beyond their audience, with
 *   their measure). Lengths follow `scriptRequestSchema.nicheRecipes`.
 * - `viralIdeaToStudio`: "Écrire ce script" from one of Claude's ideas — a
 *   real Topic whose evidence signals are the real videos the idea is
 *   inspired by, and a custom Angle carrying the idea (like the competitor
 *   hand-off).
 * - `checkNicheOverlap`: warns when a script's title or hook copies one of
 *   the niche's top videos almost word for word.
 */

import { scoreSignals, scoreTopic } from "../analysis/scoring";
import { detectSensitivity } from "../analysis/sensitivity";
import { containment, jaccard, shortHash, tokenSet } from "../analysis/text";
import { postToSignal, type StudioHandoff } from "../creators/idea";
import { clip, formatCompactFr, formatMultiplier } from "../creators/labels";
import type { Angle, CreatorAccount, ScriptDraft, Signal, Topic, ViralBrief, ViralPost, ViralReport } from "../types";
import { VIRAL_PLATFORM_LABELS, viralAuthorLabel } from "./labels";

const MAX_RECIPES = 8;
const MAX_ITEMS = 10;
const MAX_KEYWORDS = 8;
const STATS_HOOKS = 5;
const IDEA_KEYWORDS = 6;

function list(values: string[], maxLength: number, maxItems = MAX_ITEMS): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = clip(raw, maxLength);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length === maxItems) break;
  }
  return result;
}

/** Videos above their audience first (the report is sorted best first), then the rest. */
function bestPosts(report: ViralReport): ViralPost[] {
  const winners = report.posts.filter((post) => post.tier !== "normal");
  return winners.length ? winners : report.posts;
}

/** "vue ×12 son audience" — or, without a multiplier (YouTube), its raw views. */
function measureOf(post: ViralPost): string {
  if (post.multiplier !== undefined) return `vue ${formatMultiplier(post.multiplier)} son audience`;
  return post.metrics.views !== undefined ? `${formatCompactFr(post.metrics.views)} vues` : "très vue";
}

export function toViralBrief(report: ViralReport): ViralBrief {
  const { request, patterns } = report;
  const best = bestPosts(report);
  const base: Pick<ViralBrief, "niche" | "keywords" | "topTitles"> = {
    niche: clip(request.niche.trim() || request.keywords.join(", "), 300),
    keywords: list(request.keywords, 60, MAX_KEYWORDS),
    topTitles: list(
      best.map((post) => post.title),
      300,
    ),
  };

  if (patterns) {
    return {
      ...base,
      recipes: patterns.recipes
        .filter((recipe) => recipe.name.trim())
        .slice(0, MAX_RECIPES)
        .map((recipe) => ({
          name: clip(recipe.name, 200),
          description: clip(recipe.description, 600),
          viewsLever: clip(recipe.viewsLever, 400),
          followLever: clip(recipe.followLever, 400),
        })),
      hookPatterns: list(
        patterns.hookPatterns.map((hook) =>
          hook.examples[0] ? `${hook.pattern} — ex. « ${clip(hook.examples[0].quote, 140)} »` : hook.pattern,
        ),
        300,
      ),
      followDrivers: list(
        patterns.followDrivers.map((driver) => driver.insight),
        300,
      ),
      avoid: list(patterns.avoid, 300),
    };
  }

  // "stats" mode: only deterministic, real material.
  return {
    ...base,
    recipes: [],
    hookPatterns: list(
      best
        .filter((post) => post.title.trim())
        .slice(0, STATS_HOOKS)
        .map((post) => `Accroche d'une vidéo ${VIRAL_PLATFORM_LABELS[post.platform]} ${measureOf(post)} : « ${clip(post.title, 200)} »`),
      300,
    ),
    followDrivers: [],
    avoid: [],
  };
}

// ---------------------------------------------------------------------------
// Studio hand-off
// ---------------------------------------------------------------------------

function accountOf(post: ViralPost): CreatorAccount {
  return {
    platform: post.platform,
    handle: post.author.handle,
    ...(post.author.displayName ? { displayName: post.author.displayName } : {}),
    url: post.author.url ?? post.url,
    ...(post.author.followers !== undefined ? { followers: post.author.followers } : {}),
  };
}

/**
 * A lab video as script evidence. Without a multiplier (YouTube without the
 * derived-metrics amendment) the author's followers are left out, so no
 * views ÷ followers ratio is derived downstream.
 */
export function viralPostToSignal(post: ViralPost): Signal {
  const ratiosAllowed = !(post.platform === "youtube" && post.multiplier === undefined);
  return postToSignal({ data: { account: accountOf(post), ratiosAllowed } }, post);
}

function reportTime(report: ViralReport): number {
  const created = Date.parse(report.createdAt);
  return Number.isNaN(created) ? 0 : created;
}

function evidenceLine(post: ViralPost): string {
  const facts = [
    post.metrics.views !== undefined ? `${formatCompactFr(post.metrics.views)} vues` : undefined,
    post.multiplier !== undefined ? `${formatMultiplier(post.multiplier)} son audience` : undefined,
  ].filter(Boolean);
  return `« ${clip(post.title || "vidéo sans titre", 80)} » de ${viralAuthorLabel(post)} sur ${VIRAL_PLATFORM_LABELS[post.platform]}${
    facts.length ? ` (${facts.join(", ")})` : ""
  }`;
}

const sentence = (value: string) => value.trim().replace(/[.\s]+$/, "");

/**
 * "Écrire ce script" from the lab's idea n°`ideaIndex`.
 * @throws RangeError (French message) when the report has no idea at this index.
 */
export function viralIdeaToStudio(report: ViralReport, ideaIndex: number): StudioHandoff {
  const idea = report.patterns?.ideas[ideaIndex];
  if (!idea) throw new RangeError("Idée introuvable dans ce rapport : relancez l'analyse « Ce qui cartonne ».");

  const now = reportTime(report);
  const byId = new Map(report.posts.map((post) => [post.id, post]));
  const inspired = [...new Set(idea.inspiredBy)].map((id) => byId.get(id)).filter((post): post is ViralPost => post !== undefined);

  const signals = scoreSignals(inspired.map(viralPostToSignal), now);
  // Videos that went far beyond their audience are the proof.
  inspired.forEach((post, index) => {
    if (post.tier === "explose" || post.tier === "cartonne") signals[index].outlier = true;
  });

  const niche = report.request.niche.trim() || report.request.keywords.join(", ");
  const fallbackTitle = `Idée « Ce qui cartonne » — ${clip(niche, 60)}`;
  const title = clip(idea.title, 200).length >= 3 ? clip(idea.title, 200) : fallbackTitle;
  const id = `viral-${shortHash(`${report.id}|${ideaIndex}|${idea.title}`)}`;

  const angle: Angle = {
    id: `${id}-custom`,
    type: "custom",
    title,
    pitch: clip(`${sentence(idea.angle)}.${idea.format.trim() ? ` Format : ${sentence(idea.format)}.` : ""}`, 1000),
    hook: clip(idea.hook, 500),
    whyItWorks: clip(idea.whyForYou, 1000),
  };

  const evidence = inspired.map(evidenceLine);
  const whyNow = evidence.length
    ? `Recette qui cartonne en ce moment dans la niche : ${evidence.join(" ; ")}. ${sentence(idea.whyForYou)}.`
    : `${sentence(idea.whyForYou)}.`;

  const keywords = list(
    [...report.request.keywords, ...inspired.flatMap((post) => post.hashtags)].map((value) => value.replace(/^#+/, "").toLowerCase()),
    100,
    IDEA_KEYWORDS,
  );
  const platforms = [...new Set(inspired.length ? inspired.map((post) => post.platform) : report.request.platforms)];

  const topic: Topic = {
    id,
    title: clip(idea.title, 300) || fallbackTitle,
    summary: clip(`Idée de vidéo issue de « Ce qui cartonne » sur ${niche} : ${sentence(idea.angle)}.`, 2000),
    whyNow: clip(whyNow, 2000),
    category: "Ce qui cartonne",
    platforms,
    signalIds: signals.map((signal) => signal.id),
    keywords,
    // Recent breakouts on a 7-day window; a proven mechanic on 30 days.
    lifespan: report.request.periodDays === 7 ? "court" : "durable",
    // The mechanic works because others use it: room left, but not empty.
    saturation: "moyenne",
    sensitivity: detectSensitivity(idea.title, [idea.angle, idea.hook, ...inspired.map((post) => post.title)]),
    scores: scoreTopic({ signals, now }),
    angles: [angle],
  };
  return { topic, signals, angle };
}

// ---------------------------------------------------------------------------
// Copy check (script side)
// ---------------------------------------------------------------------------

const MIN_OVERLAP_TOKENS = 3;
const MAX_JACCARD = 0.7;
const MAX_CONTAINMENT = 0.85;

function tooClose(ours: Set<string>, theirs: Set<string>): boolean {
  if (ours.size < MIN_OVERLAP_TOKENS || theirs.size < MIN_OVERLAP_TOKENS) return false;
  return jaccard(ours, theirs) >= MAX_JACCARD || (theirs.size >= 4 && containment(theirs, ours) >= MAX_CONTAINMENT);
}

/**
 * Warns when the title or a spoken hook reuses one of the niche's top
 * titles or hook examples almost word for word (the script prompt forbids
 * it; code checks it).
 */
export function checkNicheOverlap(draft: Pick<ScriptDraft, "title" | "hooks">, brief: ViralBrief | undefined): string[] {
  if (!brief) return [];
  const theirs = [
    ...brief.topTitles,
    ...brief.hookPatterns.flatMap((pattern) => [...pattern.matchAll(/«\s*([^»]+?)\s*»/g)].map((match) => match[1])),
  ]
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text, tokens: tokenSet(text) }));
  const candidates = [{ label: "Titre", text: draft.title }, ...draft.hooks.map((hook, index) => ({ label: `Accroche ${index + 1}`, text: hook.spoken }))];
  const warnings: string[] = [];
  for (const candidate of candidates) {
    const tokens = tokenSet(candidate.text);
    const match = theirs.find((item) => tooClose(tokens, item.tokens));
    if (match) {
      warnings.push(
        `${candidate.label} très proche d'une vidéo qui cartonne dans votre niche (« ${clip(match.text, 90)} ») : reformulez pour ne pas la copier.`,
      );
    }
  }
  return warnings;
}
