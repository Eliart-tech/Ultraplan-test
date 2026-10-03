/**
 * Deterministic post-generation checks (playbook §0 "run in code, not by the
 * LLM"). The model self-assesses with the 12-point rubric; these checks
 * catch what it routinely gets wrong (counting words, hashtag caps, legal
 * mentions) and turn platform rules into French warnings. Pure and
 * client-safe: the UI re-runs them after the user swaps the hook.
 */

import { stripAccents } from "../analysis/text";
import type { ScriptDraft, ScriptSettings } from "../types";
import { budgetRange, countWords } from "./metrics";

const MAX_HOOK_SCREEN_WORDS = 7;
const CAPTION_LIMIT: Record<ScriptSettings["platform"], number> = {
  instagram_reels: 2200,
  tiktok: 4000,
  youtube_shorts: 5000,
  linkedin: 3000,
};
const YOUTUBE_TITLE_LIMIT = 100;
/** Characters of a LinkedIn post shown before "…voir plus" (about two lines). */
const LINKEDIN_VISIBLE_CHARS = 210;
/** Tolerance on the end of the last beat vs. the target duration. */
const timingTolerance = (duration: number) => Math.max(2, duration * 0.1);

const MUSIC_OR_CLIP = /musique|son tendance|son viral|audio tendance|extrait|clip|bande[- ]annonce|morceau|chanson|music/;
const ENGAGEMENT_BAIT = /\blike si\b|\btague\b|\bidentifie \d+|\bmentionne \d+|\bcommente (un|le|ce) (emoji|chiffre)/;
const SPONSORED_MENTION = /publicit|collaboration commerciale|partenariat remunere/;

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

function normalize(value: string): string {
  return stripAccents(value.toLowerCase());
}

function checkHooks(draft: ScriptDraft, warnings: string[]): void {
  if (draft.hooks.length !== 3) {
    warnings.push(`${plural(draft.hooks.length, "variante")} d'accroche au lieu de 3 : régénérez pour pouvoir comparer.`);
  }
  draft.hooks.forEach((hook, index) => {
    const words = countWords(hook.onScreenText);
    if (words > MAX_HOOK_SCREEN_WORDS) {
      warnings.push(
        `Accroche ${index + 1} : texte à l'écran de ${words} mots (7 maximum pour être lu en 1 seconde) — raccourcissez « ${hook.onScreenText} ».`,
      );
    }
  });
}

function checkBudget(draft: ScriptDraft, settings: ScriptSettings, budget: number, warnings: string[]): void {
  const words = countWords(draft.fullScript);
  const { min, max } = budgetRange(budget);
  if (words > max) {
    warnings.push(
      `Voix off trop longue : ${words} mots pour un budget de ${budget} (${settings.durationSec} s) — coupez ou passez au débit « dynamique », sinon la vidéo dépassera la durée visée.`,
    );
  } else if (words < min) {
    warnings.push(
      `Voix off courte : ${words} mots pour un budget de ${budget} (${settings.durationSec} s) — ajoutez un exemple ou laissez plus de place aux visuels.`,
    );
  }
}

function checkBeats(draft: ScriptDraft, settings: ScriptSettings, warnings: string[]): void {
  const beats = draft.beats;
  if (beats.length === 0) {
    warnings.push("Aucun découpage temporel : régénérez le script.");
    return;
  }
  const gaps: string[] = [];
  if (Math.abs(beats[0].startSec) > 0.5) gaps.push(`le premier temps commence à ${beats[0].startSec} s`);
  for (let i = 1; i < beats.length; i++) {
    const previous = beats[i - 1];
    const current = beats[i];
    if (current.endSec < current.startSec) gaps.push(`le temps « ${current.label} » finit avant de commencer`);
    if (Math.abs(current.startSec - previous.endSec) > 0.5) {
      gaps.push(`trou ou chevauchement entre ${previous.endSec} s et ${current.startSec} s`);
    }
  }
  const end = beats[beats.length - 1].endSec;
  if (Math.abs(end - settings.durationSec) > timingTolerance(settings.durationSec)) {
    gaps.push(`la timeline se termine à ${end} s pour une durée visée de ${settings.durationSec} s`);
  }
  if (gaps.length) warnings.push(`Découpage à revoir : ${gaps.join(" ; ")}.`);
}

function checkPlatform(draft: ScriptDraft, settings: ScriptSettings, warnings: string[]): void {
  const count = draft.hashtags.length;
  const captionLength = draft.caption.length + draft.hashtags.reduce((n, tag) => n + tag.length + 1, 0);

  switch (settings.platform) {
    case "instagram_reels":
      if (count > 5) {
        warnings.push(`Instagram limite à 5 hashtags (${count} proposés) : gardez les 5 plus précis.`);
      }
      if (settings.cta === "comment_keyword") {
        warnings.push(
          "CTA « commente un mot-clé » sur Instagram : il peut être classé en appât à engagement et réduire la portée auprès des non-abonnés. Préférez-le pour un contenu destiné à vos abonnés.",
        );
      }
      break;
    case "tiktok":
      if (count > 0 && (count < 3 || count > 5)) {
        warnings.push(`TikTok : 3 à 5 hashtags précis recommandés (${count} proposés).`);
      }
      break;
    case "youtube_shorts":
      if (count > 60) {
        warnings.push(`YouTube ignore tous les hashtags au-delà de 60 (${count} proposés).`);
      } else if (count > 3) {
        warnings.push(`YouTube Shorts : 1 à 3 hashtags recommandés (${count} proposés).`);
      }
      if (draft.title.length > YOUTUBE_TITLE_LIMIT) {
        warnings.push(`Titre YouTube de ${draft.title.length} caractères : 100 maximum, mot-clé au début.`);
      }
      if (settings.durationSec > 60) {
        const production = normalize(draft.beats.map((b) => `${b.visual} ${b.editing}`).join(" "));
        warnings.push(
          MUSIC_OR_CLIP.test(production)
            ? "Short de plus d'1 min avec musique ou extrait tiers : la moindre réclamation Content ID bloque la vidéo partout. Utilisez un son libre de droits ou passez à 60 s."
            : "Short de plus d'1 min : n'ajoutez aucune musique ni extrait protégé (une réclamation Content ID bloquerait la vidéo partout).",
        );
      }
      break;
    case "linkedin": {
      if (count > 3) {
        warnings.push(`LinkedIn : 3 hashtags maximum recommandés (${count} proposés).`);
      }
      const firstLine = draft.caption.trim().split("\n")[0] ?? "";
      if (firstLine.length > LINKEDIN_VISIBLE_CHARS) {
        warnings.push(
          `Première ligne du post LinkedIn de ${firstLine.length} caractères : seuls ~200 s'affichent avant « …voir plus ». Raccourcissez-la et placez le hook dedans.`,
        );
      }
      if (/https?:\/\//.test(draft.caption)) {
        warnings.push("Lien dans le texte du post LinkedIn : beaucoup de créateurs le placent en premier commentaire pour préserver la portée.");
      }
      if (settings.cta === "comment_keyword") {
        warnings.push(
          "CTA « commente un mot-clé » sur LinkedIn : il peut être traité comme un appât à engagement. Préférez une question ouverte qui appelle des réponses argumentées.",
        );
      }
      break;
    }
  }

  const limit = CAPTION_LIMIT[settings.platform];
  if (captionLength > limit) {
    warnings.push(`Légende + hashtags : ${captionLength} caractères pour une limite de ${limit}.`);
  }
}

function checkCompliance(draft: ScriptDraft, settings: ScriptSettings, warnings: string[]): void {
  if (settings.sponsored && !SPONSORED_MENTION.test(normalize(draft.caption))) {
    warnings.push(
      "Partenariat rémunéré : ajoutez « Publicité » ou « Collaboration commerciale » en début de légende et activez la mention de partenariat de la plateforme (obligation légale).",
    );
  }
  if (settings.aiVisuals) {
    warnings.push(
      "Visuels IA réalistes : activez l'étiquette IA de la plateforme (TikTok « contenu généré par IA », Meta « Infos IA ») et ajoutez « Images virtuelles » en cas d'usage commercial.",
    );
  }
  if (ENGAGEMENT_BAIT.test(normalize(`${draft.cta} ${draft.fullScript}`))) {
    warnings.push("Appel à l'engagement mécanique détecté (« like si », « tague… ») : les plateformes le pénalisent, reformulez le CTA.");
  }
}

function checkFacts(draft: ScriptDraft, warnings: string[]): void {
  const unsourced = draft.factsToVerify.filter((fact) => !fact.sourceUrl).length;
  // Unsourced claims are already reported above: only count the weak ones that have a source.
  const weak = draft.factsToVerify.filter((fact) => fact.sourceUrl && fact.confidence === "faible").length;
  if (unsourced > 0) {
    warnings.push(`${plural(unsourced, "affirmation")} sans source : vérifiez-les avant de publier.`);
  }
  if (weak > 0) {
    warnings.push(`${plural(weak, "affirmation")} à confiance faible dans la liste des faits à vérifier.`);
  }
  const placeholders = (draft.fullScript.match(/\{\s*[AÀ] V[ÉE]RIFIER/gi) ?? []).length;
  if (placeholders > 0) {
    warnings.push(`${plural(placeholders, "élément")} « {À VÉRIFIER : …} » à compléter avant le tournage.`);
  }
}

function checkPedagogyFit(settings: ScriptSettings, warnings: string[]): void {
  if ((settings.pedagogy >= 60 && settings.durationSec < 30) || (settings.pedagogy >= 80 && settings.durationSec < 45)) {
    warnings.push(
      `Pédagogie élevée pour ${settings.durationSec} s : envisagez une série (partie 1, partie 2) ou une durée plus longue.`,
    );
  }
}

export function checkScript(draft: ScriptDraft, settings: ScriptSettings, budget: number): string[] {
  const warnings: string[] = [];
  checkHooks(draft, warnings);
  checkBudget(draft, settings, budget, warnings);
  checkBeats(draft, settings, warnings);
  checkPlatform(draft, settings, warnings);
  checkCompliance(draft, settings, warnings);
  checkFacts(draft, warnings);
  checkPedagogyFit(settings, warnings);
  return warnings;
}
