/**
 * Where to go after logging in. `next` comes from the query string, so it is
 * attacker-controlled: only a same-origin relative path is accepted — never
 * `//evil.com`, `/\evil.com`, `https://…`, the login page itself or an API
 * route. Mirrors `safeNextPath` on the server (which can't be imported here).
 */

const PLACEHOLDER_ORIGIN = "http://trendscript.invalid";

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 2048) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  // Browsers drop tabs/newlines inside URLs ("/\n/evil.com" → "//evil.com").
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return "/";
  if (url.pathname === "/login" || url.pathname === "/api" || url.pathname.startsWith("/api/")) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
