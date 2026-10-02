/**
 * Turns `SCORE_EXPLANATION` (French sentences maintained next to the scoring
 * code) into display data: "Label : text" items and the weights of the total
 * score. Parsing the text rather than duplicating the weights keeps the page
 * in sync with the formula; if the wording changes shape, the page falls
 * back to the plain sentences.
 */

export interface ScoreItem {
  label: string;
  text: string;
}

export interface ScoreWeight {
  label: string;
  /** Weight with a niche (or keywords) in the analysis, in %. */
  withNiche: number;
  /** Weight without a niche, in % (undefined when not stated). */
  withoutNiche?: number;
}

/** "Portée : force des 3…" → { label: "Portée", text: "Force des 3…" }. */
export function parseScoreItems(lines: readonly string[]): ScoreItem[] {
  return lines.map((line) => {
    const index = line.indexOf(" : ");
    if (index <= 0) return { label: "", text: line };
    const text = line.slice(index + 3).trim();
    return { label: line.slice(0, index).trim(), text: text.charAt(0).toUpperCase() + text.slice(1) };
  });
}

/**
 * "25 % momentum, 20 % portée, … (sans niche : 35/30/20/15)." → weights.
 * Empty array when the sentence doesn't have that shape.
 */
export function parseScoreWeights(text: string): ScoreWeight[] {
  const [main, rest = ""] = text.split("(");
  const weights: ScoreWeight[] = [];
  for (const match of main.matchAll(/(\d+(?:[.,]\d+)?)\s*%\s*([^,.;]+)/g)) {
    weights.push({ label: match[2].trim(), withNiche: Number(match[1].replace(",", ".")) });
  }
  const alt = rest.match(/sans niche\s*:\s*([\d/\s]+)/i)?.[1];
  if (alt) {
    const values = alt
      .split("/")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));
    weights.forEach((weight, index) => {
      weight.withoutNiche = values[index] ?? 0;
    });
  }
  const sum = weights.reduce((total, weight) => total + weight.withNiche, 0);
  return weights.length >= 2 && Math.abs(sum - 100) <= 1 ? weights : [];
}
