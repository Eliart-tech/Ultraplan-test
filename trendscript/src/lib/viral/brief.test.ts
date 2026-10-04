import { describe, expect, it } from "vitest";
import { scriptRequestSchema } from "../schemas";
import { fixtureDraft } from "../script/__fixtures__/script";
import type { ViralBrief } from "../types";
import { fixtureViralPatterns, fixtureViralPosts, fixtureViralReport, NOW } from "./__fixtures__/viral";
import { checkNicheOverlap, toViralBrief, viralIdeaToStudio, viralPostToSignal } from "./brief";

const nicheRecipesSchema = scriptRequestSchema.shape.nicheRecipes;
const plain = (value: string) => value.replace(/[  ]/g, " ");

describe("toViralBrief", () => {
  it("sends Claude's recipes, hooks, follow drivers and what to avoid, with the best titles not to copy", () => {
    const brief = toViralBrief(fixtureViralReport());
    expect(brief).toEqual({
      niche: "sommeil et productivité",
      keywords: ["sommeil", "productivité"],
      recipes: [
        {
          name: "Liste d'erreurs + promesse pour ce soir",
          description: "3 erreurs concrètes, la pire en dernier, puis le geste à faire ce soir.",
          viewsLever: "Chaque spectateur se reconnaît dans une erreur et l'envoie à quelqu'un.",
          followLever: "Promesse d'une suite (la partie 2) : raison de revenir, probablement.",
        },
      ],
      hookPatterns: ["Contre-pied d'un conseil populaire — ex. « Le réveil à 5 h ne te rendra pas productif »"],
      followDrivers: ["Séries annoncées (hypothèse)"],
      avoid: ["Routines du soir esthétiques sans conseil : elles restent dans la moyenne."],
      // Videos above their audience only, best first.
      topTitles: [
        "3 erreurs qui ruinent ton sommeil",
        "Le réveil à 5 h ne te rendra pas productif",
        "POV : tu dors 8 h et tu es quand même épuisé",
        "Ma méthode pour finir ma journée à 17 h",
        "J'ai testé le sommeil polyphasique pendant 30 jours",
        "Pourquoi tu procrastines le soir",
      ],
    });
    expect(nicheRecipesSchema.safeParse(brief).success).toBe(true);
  });

  it("respects the request schema's caps whatever Claude wrote", () => {
    const long = "x".repeat(900);
    const recipes = Array.from({ length: 12 }, (_, i) => ({ ...fixtureViralPatterns.recipes[0], name: `Recette ${i} ${long}`, description: long, viewsLever: long, followLever: long }));
    const brief = toViralBrief(
      fixtureViralReport({
        request: { ...fixtureViralReport().request, niche: long },
        patterns: { ...fixtureViralPatterns, recipes, avoid: Array.from({ length: 20 }, (_, i) => `À éviter ${i}`), hookPatterns: [] },
      }),
    );
    expect(brief.recipes).toHaveLength(8);
    expect(brief.avoid).toHaveLength(10);
    expect(brief.niche.length).toBeLessThanOrEqual(300);
    expect(nicheRecipesSchema.safeParse(brief).success).toBe(true);
  });

  it("works in stats mode with real, measured material only", () => {
    const brief = toViralBrief(fixtureViralReport({ mode: "stats", patterns: undefined, model: undefined }));
    expect(brief.recipes).toEqual([]);
    expect(brief.followDrivers).toEqual([]);
    expect(brief.avoid).toEqual([]);
    expect(brief.hookPatterns.map(plain)).toEqual([
      "Accroche d'une vidéo TikTok vue ×180 son audience : « 3 erreurs qui ruinent ton sommeil »",
      "Accroche d'une vidéo Instagram vue ×25 son audience : « Le réveil à 5 h ne te rendra pas productif »",
      "Accroche d'une vidéo TikTok vue ×4 son audience : « POV : tu dors 8 h et tu es quand même épuisé »",
      "Accroche d'une vidéo Instagram vue ×3,3 son audience : « Ma méthode pour finir ma journée à 17 h »",
      // YouTube without the derived-metrics amendment: raw views, no ratio.
      "Accroche d'une vidéo YouTube 2 M vues : « J'ai testé le sommeil polyphasique pendant 30 jours »",
    ]);
    expect(nicheRecipesSchema.safeParse(brief).success).toBe(true);
  });

  it("falls back to the keywords for the niche and to the best videos when none went above its audience", () => {
    const normal = fixtureViralPosts.map((post) => ({ ...post, tier: "normal" as const }));
    const brief = toViralBrief(fixtureViralReport({ request: { ...fixtureViralReport().request, niche: " " }, posts: normal }));
    expect(brief.niche).toBe("sommeil, productivité");
    expect(brief.topTitles).toHaveLength(10);
  });
});

describe("viralIdeaToStudio", () => {
  const report = fixtureViralReport();
  const { topic, signals, angle } = viralIdeaToStudio(report, 0);

  it("builds a topic whose evidence is the real videos the idea is inspired by", () => {
    expect(signals.map((signal) => [signal.source, signal.platform, signal.url])).toEqual([
      ["tiktok_apify", "tiktok", "https://www.tiktok.com/@dodo.coach/video/tt1"],
      ["instagram_apify", "instagram", "https://www.instagram.com/reel/IG1abc/"],
    ]);
    expect(signals[0]).toMatchObject({
      title: "3 erreurs qui ruinent ton sommeil",
      author: "@dodo.coach",
      metrics: { views: 900_000, likes: 80_000, followers: 5_000, durationSec: 28 },
      outlier: true,
    });
    expect(signals.every((signal) => signal.strength > 0)).toBe(true);
    expect(topic).toMatchObject({
      title: "Les 3 erreurs de sommeil des jeunes actifs",
      category: "Ce qui cartonne",
      platforms: ["tiktok", "instagram"],
      signalIds: signals.map((signal) => signal.id),
      lifespan: "durable",
      saturation: "moyenne",
      angles: [angle],
    });
    expect(plain(topic.whyNow)).toBe(
      "Recette qui cartonne en ce moment dans la niche : « 3 erreurs qui ruinent ton sommeil » de @dodo.coach sur TikTok (900 k vues, ×180 son audience) ; « Le réveil à 5 h ne te rendra pas productif » de @julie.focus sur Instagram (25 k vues, ×25 son audience). Colle à ton audience de jeunes actifs. Vues : partage entre collègues. Abonnements : série en 3 parties.",
    );
    expect(topic.keywords).toEqual(["sommeil", "productivité", "astuce"]);
    expect(topic.scores.total).toBeGreaterThan(0);
  });

  it("carries the idea as a custom angle", () => {
    expect(angle).toEqual({
      id: `${topic.id}-custom`,
      type: "custom",
      title: "Les 3 erreurs de sommeil des jeunes actifs",
      pitch: "Liste d'erreurs adaptée au rythme de bureau. Format : Face caméra, 30 s, 3 erreurs puis le geste du soir.",
      hook: "Tu fais sûrement la 2e erreur ce soir.",
      whyItWorks: "Colle à ton audience de jeunes actifs. Vues : partage entre collègues. Abonnements : série en 3 parties.",
    });
  });

  it("is a short-lived topic on a 7-day window and is stable for the same idea", () => {
    const week = fixtureViralReport({ request: { ...report.request, periodDays: 7 } });
    expect(viralIdeaToStudio(week, 0).topic.lifespan).toBe("court");
    expect(viralIdeaToStudio(report, 0).topic.id).toBe(topic.id);
  });

  it("produces a hand-off the script request schema accepts", () => {
    const parsed = scriptRequestSchema.safeParse({
      topic,
      signals,
      angle,
      settings: {
        platform: "tiktok",
        durationSec: 30,
        virality: 60,
        pedagogy: 50,
        tone: "decontracte",
        format: "face_camera",
        hookStyle: "auto",
        cta: "auto",
        language: "fr",
        research: false,
        pace: "normal",
        sponsored: false,
        aiVisuals: false,
      },
      profile: report.request.profile,
      nicheRecipes: toViralBrief(report),
    });
    expect(parsed.success).toBe(true);
  });

  it("throws a French RangeError for a missing idea", () => {
    expect(() => viralIdeaToStudio(report, 3)).toThrow(RangeError);
    expect(() => viralIdeaToStudio(fixtureViralReport({ patterns: undefined }), 0)).toThrow("Idée introuvable");
  });
});

describe("viralPostToSignal", () => {
  it("keeps the follower count out of YouTube evidence without the derived-metrics amendment", () => {
    const youtube = fixtureViralPosts.find((post) => post.id === "youtube:yt1")!;
    const signal = viralPostToSignal(youtube);
    expect(signal.source).toBe("youtube");
    expect(signal.metrics).toEqual({ views: 2_000_000, likes: 90_000, comments: 4_000, durationSec: 58 });
    expect(viralPostToSignal({ ...youtube, multiplier: 1.33 }).metrics.followers).toBe(1_500_000);
  });
});

describe("checkNicheOverlap", () => {
  const brief: ViralBrief = toViralBrief(fixtureViralReport());

  it("warns when the title or a hook copies a top video almost word for word", () => {
    const draft = fixtureDraft({
      title: "Les 3 erreurs qui ruinent ton sommeil",
      hooks: [
        { ...fixtureDraft().hooks[0], spoken: "Le réveil à 5 h ne te rendra pas productif, crois-moi." },
        fixtureDraft().hooks[1],
        fixtureDraft().hooks[2],
      ],
    });
    expect(checkNicheOverlap(draft, brief)).toEqual([
      "Titre très proche d'une vidéo qui cartonne dans votre niche (« 3 erreurs qui ruinent ton sommeil ») : reformulez pour ne pas la copier.",
      "Accroche 1 très proche d'une vidéo qui cartonne dans votre niche (« Le réveil à 5 h ne te rendra pas productif ») : reformulez pour ne pas la copier.",
    ]);
  });

  it("stays quiet for an original script or without a brief", () => {
    expect(checkNicheOverlap(fixtureDraft(), brief)).toEqual([]);
    expect(checkNicheOverlap(fixtureDraft({ title: "3 erreurs qui ruinent ton sommeil" }), undefined)).toEqual([]);
  });
});

it("fixture sanity: the report is dated at NOW", () => {
  expect(Date.parse(fixtureViralReport().createdAt)).toBe(NOW);
});
