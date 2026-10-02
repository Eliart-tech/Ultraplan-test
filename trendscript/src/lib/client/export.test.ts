import { describe, expect, it } from "vitest";
import { fixtureDraft, fixtureSettings, fixtureTopic } from "@/lib/script/__fixtures__/script";
import type { GeneratedScript } from "@/lib/types";
import { scriptFileName, scriptToMarkdown, scriptToText } from "./export";

const plain = (value: string) => value.replace(/[  ]/g, " ");

function generated(overrides: Partial<GeneratedScript> = {}): GeneratedScript {
  return {
    ...fixtureDraft(),
    id: "script-1",
    createdAt: "2026-10-02T12:00:00Z",
    model: "claude-opus-5-5",
    wordCount: 101,
    wordBudget: 101,
    estimatedDurationSec: 40,
    warnings: ["Vérifiez la date du changement d'heure."],
    research: {
      facts: "- Le passage à l'heure d'hiver a lieu le 25 octobre 2026.",
      sources: [
        { title: "Service public", url: "https://www.service-public.fr/heure" },
        // Duplicate of a draft source: listed once.
        { title: "Heure d'hiver", url: "https://www.example-daily.fr/heure-hiver-25-octobre" },
      ],
    },
    ...overrides,
  };
}

const context = {
  topic: { title: fixtureTopic.title },
  angle: { title: fixtureTopic.angles[0].title, type: fixtureTopic.angles[0].type },
  settings: fixtureSettings,
  timeZone: "UTC",
};

describe("scriptToMarkdown", () => {
  const md = plain(scriptToMarkdown(generated(), context));

  it("starts with the title and a header of context", () => {
    expect(md.startsWith("# Changement d'heure : 3 réglages avant dimanche\n")).toBe(true);
    expect(md).toContain("> Sujet : Changement d'heure du 25 octobre");
    expect(md).toContain("> Angle : 3 réglages à faire samedi soir avant le changement d'heure (Conseil pratique)");
    expect(md).toContain("Plateforme : Instagram Reels · Durée cible : 45 s · Ton : Décontracté · Débit : Normal · Viralité : 72/100");
    expect(md).toContain("101 mots (budget 101) · durée estimée 40 s");
    expect(md).toContain("Généré le 2 oct. 2026 avec claude-opus-5-5");
  });

  it("lists hooks, beats with time ranges and the teleprompter text", () => {
    expect(md).toContain("1. **Contre-intuitif** _(utilisée)_ — « Ton réveil va te mentir dimanche. »");
    expect(md).toContain("   - Texte écran : Ton réveil va te mentir");
    expect(md).toContain("### 0–3 s · Hook");
    expect(md).toContain("- **Montage :** [ZOOM]");
    expect(md).toContain("## Texte complet (prompteur)");
  });

  it("includes caption with normalised hashtags, checklist, facts and deduplicated sources", () => {
    expect(md).toContain("#changementdheure #sommeil #astuce");
    expect(md).toContain("- [x] Hook — 7 mots");
    expect(md).toContain(
      "- [ ] Passage à l'heure d'hiver dans la nuit du 24 au 25 octobre _(confiance : haute)_ — [source](https://www.example-daily.fr/heure-hiver-25-octobre)",
    );
    expect(md.match(/example-daily\.fr\/heure-hiver-25-octobre\)/g)?.length).toBe(2); // fact + one source line
    expect(md).toContain("- [Service public](https://www.service-public.fr/heure)");
    expect(md).toContain("## Recherche web");
    expect(md).toContain("## À surveiller\n\n- Vérifiez la date du changement d'heure.");
  });

  it("omits empty sections and never leaves runs of blank lines", () => {
    const bare = scriptToMarkdown(
      fixtureDraft({ strengths: [], risks: [], checklist: [], factsToVerify: [], sources: [], cta: "" }),
    );
    expect(bare).not.toContain("## Points forts");
    expect(bare).not.toContain("## Faits à vérifier");
    expect(bare).not.toContain("## Sources");
    expect(bare).not.toContain("## Appel à l'action");
    expect(bare).not.toMatch(/\n{3,}/);
    expect(bare.endsWith("_Exporté depuis TrendScript._\n")).toBe(true);
  });
});

describe("scriptToText", () => {
  const text = plain(scriptToText(generated(), context));

  it("has no Markdown markup", () => {
    expect(text).not.toMatch(/^#{1,3} /m);
    expect(text).not.toContain("**");
    expect(text).not.toContain("](");
  });

  it("keeps the same content in plain sections", () => {
    expect(text.startsWith("Changement d'heure : 3 réglages avant dimanche\n=")).toBe(true);
    expect(text).toContain("ACCROCHES\n1. [Contre-intuitif] « Ton réveil va te mentir dimanche. » (utilisée)");
    expect(text).toContain("[0–3 s] Hook");
    expect(text).toContain("TEXTE COMPLET (PROMPTEUR)");
    expect(text).toContain("[x] Hook — 7 mots");
    expect(text).toContain("- Service public : https://www.service-public.fr/heure");
    expect(text).not.toMatch(/\n{3,}/);
  });
});

describe("scriptFileName", () => {
  it("builds an ASCII slug", () => {
    expect(scriptFileName("Changement d'heure : 3 réglages avant dimanche !", "md")).toBe(
      "trendscript-changement-d-heure-3-reglages-avant-dimanche.md",
    );
    expect(scriptFileName("   ", "txt")).toBe("trendscript-script.txt");
    expect(scriptFileName("a".repeat(100), "json").length).toBeLessThanOrEqual("trendscript-.json".length + 48);
  });
});
