/**
 * Splits the plain-text setup steps that come from the server (SourceStatus
 * `setup`, `costNote`) into text, links and code tokens, so the UI can turn
 * "https://serpapi.com/manage-api-key" into a link and "SERPAPI_API_KEY" or
 * ".env.local" into code chips. Pure and unit-tested.
 */

export type TextToken =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "code"; value: string };

/**
 * URLs; environment variable names (UPPER_CASE with at least one
 * underscore); env file names; `npm run dev`.
 */
const PATTERN =
  /(https?:\/\/[^\s<>"«»]+)|(\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b)|((?<![\w.])\.env(?:\.[a-z]+)?\b)|(npm run (?:dev|build|start)\b)/g;

/** Trailing punctuation is part of the sentence, not of the URL. */
function splitUrl(raw: string): [url: string, rest: string] {
  let url = raw;
  for (;;) {
    const last = url.at(-1);
    if (!last) break;
    if (".,;:!?»'’".includes(last)) url = url.slice(0, -1);
    else if (last === ")" && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1);
    else break;
  }
  return [url, raw.slice(url.length)];
}

export function tokenizeText(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const previous = tokens.at(-1);
    if (previous?.type === "text") previous.value += value;
    else tokens.push({ type: "text", value });
  };

  let index = 0;
  for (const match of text.matchAll(PATTERN)) {
    const start = match.index ?? 0;
    pushText(text.slice(index, start));
    if (match[1]) {
      const [url, rest] = splitUrl(match[1]);
      if (url.length > "https://".length) tokens.push({ type: "url", value: url });
      else pushText(url);
      pushText(rest);
    } else {
      tokens.push({ type: "code", value: match[0] });
    }
    index = start + match[0].length;
  }
  pushText(text.slice(index));
  return tokens;
}

/** "https://console.apify.com/settings" → "console.apify.com/settings" (display only). */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}
