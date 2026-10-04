/**
 * "Ce qui cartonne" (server): what wins views and followers in a niche,
 * from real recent videos measured against their creators' audience.
 */

export { viralCapabilities } from "./capabilities";
export { runViralAnalysis, NO_AI_VIRAL_NOTE, type ViralDeps } from "./run";
export { collectPlatform, type CollectContext, type PlatformCollection } from "./collect";
export { enrichFollowers, type EnrichContext, type EnrichResult } from "./enrich";
