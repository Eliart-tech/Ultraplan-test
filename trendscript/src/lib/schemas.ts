/**
 * zod schemas for request bodies. Shared by the browser (form validation)
 * and the route handlers (never trust the client).
 */

import { z } from "zod";
import {
  ANGLE_TYPES,
  CTA_TYPES,
  DURATIONS,
  HOOK_STYLES,
  PLATFORMS,
  SCRIPT_PLATFORMS,
  SOURCE_IDS,
  SPEAKING_PACES,
  TONES,
  VIDEO_FORMATS,
} from "./types";

const shortText = (max: number) => z.string().trim().max(max);
const score = z.number().min(0).max(100);
const level3 = z.enum(["faible", "moyenne", "elevee"]);

export const analyzeRequestSchema = z.object({
  geo: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "Code pays sur 2 lettres attendu")
    .transform((value) => value.toUpperCase()),
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2}$/, "Code langue sur 2 lettres attendu"),
  niche: shortText(300).default(""),
  keywords: z
    .array(
      z
        .string()
        .trim()
        .min(2)
        .max(60)
        .transform((value) => value.replace(/^#/, "")),
    )
    .max(8, "8 mots-clés maximum")
    .default([]),
  sources: z.array(z.enum(SOURCE_IDS)).min(1, "Choisissez au moins une source"),
  maxTopics: z.number().int().min(3).max(15).default(8),
});

const relatedLinkSchema = z.object({
  title: shortText(400),
  url: z.string().url().max(2000),
  source: shortText(200).optional(),
});

const signalSchema = z.object({
  id: shortText(200),
  source: z.enum(SOURCE_IDS),
  platform: z.enum(PLATFORMS),
  kind: z.enum(["search_trend", "news", "article_views", "short_video", "video"]),
  title: shortText(500),
  text: shortText(2000).optional(),
  url: z.string().max(2000).optional(),
  thumbnailUrl: z.string().max(2000).optional(),
  author: shortText(200).optional(),
  publishedAt: shortText(40).optional(),
  metrics: z.object({
    searchVolume: z.number().optional(),
    increasePct: z.number().optional(),
    views: z.number().optional(),
    likes: z.number().optional(),
    comments: z.number().optional(),
    shares: z.number().optional(),
    saves: z.number().optional(),
    followers: z.number().optional(),
    rank: z.number().optional(),
    durationSec: z.number().optional(),
  }),
  tags: z.array(shortText(100)).max(50),
  related: z.array(relatedLinkSchema).max(20),
  query: shortText(100).optional(),
  strength: score,
  outlier: z.boolean().optional(),
});

const angleSchema = z.object({
  id: shortText(100),
  type: z.enum([...ANGLE_TYPES, "custom"]),
  title: shortText(200).min(3),
  pitch: shortText(1000),
  hook: shortText(500),
  whyItWorks: shortText(1000),
});

const topicSchema = z.object({
  id: shortText(100),
  title: shortText(300),
  summary: shortText(2000),
  whyNow: shortText(2000),
  category: shortText(100),
  platforms: z.array(z.enum(PLATFORMS)),
  signalIds: z.array(shortText(200)).max(100),
  keywords: z.array(shortText(100)).max(30),
  lifespan: z.enum(["flash", "court", "durable"]),
  saturation: level3,
  sensitivity: z.object({ level: level3, reason: shortText(500) }),
  scores: z.object({
    momentum: score,
    reach: score,
    crossPlatform: score,
    freshness: score,
    nicheFit: score,
    total: score,
  }),
  angles: z.array(angleSchema).max(10),
});

export const scriptSettingsSchema = z.object({
  platform: z.enum(SCRIPT_PLATFORMS),
  durationSec: z.union(DURATIONS.map((d) => z.literal(d)) as [z.ZodLiteral<15>, ...z.ZodLiteral<number>[]]),
  virality: score,
  pedagogy: score,
  tone: z.enum(TONES),
  format: z.enum(VIDEO_FORMATS),
  hookStyle: z.enum(HOOK_STYLES),
  cta: z.enum(CTA_TYPES),
  ctaDetail: shortText(200).optional(),
  language: z.string().trim().regex(/^[a-z]{2}$/),
  research: z.boolean(),
  extraInstructions: shortText(1000).optional(),
  pace: z.enum(SPEAKING_PACES),
  sponsored: z.boolean(),
  aiVisuals: z.boolean(),
});

export const creatorProfileSchema = z.object({
  name: shortText(100),
  niche: shortText(300),
  audience: shortText(500),
  positioning: shortText(500),
  voice: shortText(1000),
  avoid: shortText(500),
  defaultCta: shortText(300),
});

const scriptDraftSchema = z.object({
  title: shortText(300),
  hooks: z.array(
    z.object({
      style: shortText(100),
      spoken: shortText(1000),
      onScreenText: shortText(300),
      visual: shortText(1000),
      rationale: shortText(1000),
    }),
  ),
  beats: z.array(
    z.object({
      startSec: z.number(),
      endSec: z.number(),
      label: shortText(100),
      voiceover: shortText(3000),
      onScreenText: shortText(500),
      visual: shortText(1000),
      editing: shortText(1000),
    }),
  ),
  fullScript: shortText(20000),
  caption: shortText(5000),
  hashtags: z.array(shortText(100)),
  cta: shortText(1000),
  strengths: z.array(shortText(1000)),
  risks: z.array(shortText(1000)),
  checklist: z.array(
    z.object({ criterion: shortText(300), passed: z.boolean(), comment: shortText(1000) }),
  ),
  factsToVerify: z.array(
    z.object({
      claim: shortText(1000),
      sourceUrl: z.string().max(2000).nullable(),
      confidence: z.enum(["haute", "moyenne", "faible"]),
    }),
  ),
  sources: z.array(relatedLinkSchema),
});

export const scriptRequestSchema = z.object({
  topic: topicSchema,
  signals: z.array(signalSchema).max(100),
  angle: angleSchema,
  settings: scriptSettingsSchema,
  profile: creatorProfileSchema,
  refine: z
    .object({ previous: scriptDraftSchema, instruction: shortText(1000).min(3) })
    .optional(),
});

/** First zod issue as a French sentence for API error responses. */
export function describeZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Requête invalide.";
  const path = issue.path.join(".");
  return path ? `Champ « ${path} » invalide : ${issue.message}` : issue.message;
}
