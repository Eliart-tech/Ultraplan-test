/**
 * Text normalisation used to match signals across sources (no AI needed):
 * lower-case, strip accents, drop stop-words, keep meaningful tokens.
 */

const STOP_WORDS = new Set(
  (
    // French
    "a au aux avec ce ces cet cette dans de des du elle en et eux il ils je la le les leur leurs lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y ete etre avoir fait faire plus moins tres tout tous toute toutes sans sous apres avant entre comme quand alors ainsi aussi bien encore deja depuis contre selon chez vers voici voila cela ca ceci celui celle ceux celles dont lors pendant hier aujourd hui demain ans an jour jours semaine mois fois est sont va vont peut doit 2024 2025 2026 2027 " +
    // English
    "the of and to in for on with at by from is are was were be been it its this that these those as an or not but if then than so such can will would should could has have had do does did you your we our they their he she his her them who what when where why how all any each more most other some no nor only own same too very just new news live video videos"
  ).split(/\s+/),
);

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function tokenize(value: string): string[] {
  return stripAccents(value.toLowerCase())
    .replace(/[#@]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

export function tokenSet(...values: (string | undefined)[]): Set<string> {
  const set = new Set<string>();
  for (const value of values) if (value) for (const token of tokenize(value)) set.add(token);
  return set;
}

/** Share of `needle` tokens found in `haystack` (0–1). */
export function containment(needle: Set<string>, haystack: Set<string>): number {
  if (needle.size === 0) return 0;
  let hits = 0;
  for (const token of needle) if (haystack.has(token)) hits++;
  return hits / needle.size;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Deterministic short hash (FNV-1a, base36) for stable ids. */
export function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function truncate(value: string | undefined, max = 500): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
