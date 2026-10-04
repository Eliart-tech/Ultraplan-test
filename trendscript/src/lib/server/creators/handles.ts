/**
 * Creator handles: what the user typed ("@x", "x", a profile URL) → the
 * canonical identifier each fetcher works with, and back to a public
 * profile URL. Pure and browser-safe.
 *
 * Canonical forms:
 * - Instagram / TikTok: lower-case username, no "@".
 * - YouTube: the handle without "@" (case kept for display, YouTube matches
 *   it case-insensitively) or a channel id "UC…" (24 chars).
 * - LinkedIn: the public identifier of a member ("romainfargeot"), or
 *   "company/<name>" for a company page — the prefix is how the fetcher
 *   knows which URL to ask for.
 */

import type { CreatorPlatform } from "../../types";

export const YOUTUBE_CHANNEL_ID = /^UC[\w-]{22}$/;
const YOUTUBE_HANDLE = /^[\p{L}\p{N}._-]{3,30}$/u;
const INSTAGRAM_USERNAME = /^[a-z0-9._]{1,30}$/;
const TIKTOK_USERNAME = /^[a-z0-9._]{2,24}$/;
const LINKEDIN_ID = /^[\p{L}\p{N}_-]{2,100}$/u;
export const LINKEDIN_COMPANY_PREFIX = "company/";

/** First path segments that are Instagram pages, not accounts. */
const INSTAGRAM_RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "explore",
  "stories",
  "accounts",
  "direct",
  "about",
  "developer",
  "legal",
  "privacy",
  "web",
]);

const HOSTS: Record<CreatorPlatform, RegExp> = {
  instagram: /(^|\.)(instagram\.com|instagr\.am)$/i,
  tiktok: /(^|\.)tiktok\.com$/i,
  youtube: /(^|\.)youtube\.com$/i,
  linkedin: /(^|\.)linkedin\.com$/i,
};

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Parses "instagram.com/x", "https://www.tiktok.com/@x?lang=fr"… Undefined when it is not a URL. */
function parseUrl(input: string): URL | undefined {
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) || /^(www\.|m\.|[a-z]{2}\.)?[a-z0-9-]+\.(com|am)\//i.test(input);
  if (!looksLikeUrl) return undefined;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return undefined;
  }
}

function validInstagram(value: string): string | null {
  const username = value.replace(/^@/, "").toLowerCase();
  return INSTAGRAM_USERNAME.test(username) && !INSTAGRAM_RESERVED.has(username) ? username : null;
}

function validTiktok(value: string): string | null {
  const username = value.replace(/^@/, "").toLowerCase();
  return TIKTOK_USERNAME.test(username) ? username : null;
}

function validYoutube(value: string): string | null {
  const clean = value.replace(/^@/, "");
  if (YOUTUBE_CHANNEL_ID.test(clean)) return clean;
  return YOUTUBE_HANDLE.test(clean) ? clean : null;
}

function validLinkedin(value: string, company: boolean): string | null {
  const id = value.replace(/^@/, "").toLowerCase();
  if (!LINKEDIN_ID.test(id)) return null;
  return company ? `${LINKEDIN_COMPANY_PREFIX}${id}` : id;
}

function fromUrl(platform: CreatorPlatform, url: URL): string | null {
  if (!HOSTS[platform].test(url.hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean).map(decode);
  const [first, second] = segments;
  if (!first) return null;
  switch (platform) {
    case "instagram":
      return validInstagram(first);
    case "tiktok":
      return first.startsWith("@") ? validTiktok(first) : null;
    case "youtube":
      if (first.startsWith("@")) return validYoutube(first);
      if (first === "channel") return second && YOUTUBE_CHANNEL_ID.test(second) ? second : null;
      // Legacy custom URLs: most were turned into the same handle in 2022.
      if (first === "c" || first === "user") return second ? validYoutube(second) : null;
      return null;
    case "linkedin":
      if (first === "in") return second ? validLinkedin(second, false) : null;
      if (first === "company") return second ? validLinkedin(second, true) : null;
      return null;
  }
}

/**
 * "@x", "x" or a profile URL → canonical handle, or null when the input is
 * not a valid account identifier for the platform (wrong site, post URL,
 * forbidden characters…).
 */
export function normalizeHandle(platform: CreatorPlatform, input: string): string | null {
  const raw = (input ?? "").trim().replace(/^<|>$/g, "").trim();
  if (!raw) return null;
  const url = parseUrl(raw);
  if (url) return fromUrl(platform, url);
  if (/[\s/?#]/.test(raw) && !(platform === "linkedin" && raw.toLowerCase().startsWith(LINKEDIN_COMPANY_PREFIX))) return null;
  switch (platform) {
    case "instagram":
      return validInstagram(raw);
    case "tiktok":
      return validTiktok(raw);
    case "youtube":
      return validYoutube(raw);
    case "linkedin": {
      const company = raw.toLowerCase().startsWith(LINKEDIN_COMPANY_PREFIX);
      return validLinkedin(company ? raw.slice(LINKEDIN_COMPANY_PREFIX.length) : raw, company);
    }
  }
}

/** LinkedIn handle → `{ id, company }` ("company/google" → `{ id: "google", company: true }`). */
export function linkedinIdentity(handle: string): { id: string; company: boolean } {
  return handle.startsWith(LINKEDIN_COMPANY_PREFIX)
    ? { id: handle.slice(LINKEDIN_COMPANY_PREFIX.length), company: true }
    : { id: handle, company: false };
}

/** Public profile URL of a canonical handle. */
export function creatorProfileUrl(platform: CreatorPlatform, handle: string): string {
  const encoded = encodeURIComponent(handle);
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${encoded}/`;
    case "tiktok":
      return `https://www.tiktok.com/@${encoded}`;
    case "youtube":
      return YOUTUBE_CHANNEL_ID.test(handle)
        ? `https://www.youtube.com/channel/${handle}`
        : `https://www.youtube.com/@${encoded}`;
    case "linkedin": {
      const { id, company } = linkedinIdentity(handle);
      return `https://www.linkedin.com/${company ? "company" : "in"}/${encodeURIComponent(id)}/`;
    }
  }
}
