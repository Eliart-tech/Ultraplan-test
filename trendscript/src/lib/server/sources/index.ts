import type { SourceId, SourceStatus } from "../../types";
import { googleNewsConnector } from "./google-news";
import { googleTrendsConnector } from "./google-trends";
import { instagramApifyConnector } from "./instagram-apify";
import { instagramGraphConnector } from "./instagram-graph";
import { linkedinApifyConnector } from "./linkedin-apify";
import { linkedinWebConnector } from "./linkedin-web";
import { serpapiTrendsConnector } from "./serpapi-trends";
import { tiktokApifyConnector } from "./tiktok-apify";
import type { Env, SourceConnector } from "./types";
import { wikipediaConnector } from "./wikipedia";
import { youtubeConnector } from "./youtube";
import { youtubeRssConnector } from "./youtube-rss";

export const CONNECTORS: Record<SourceId, SourceConnector> = {
  google_trends: googleTrendsConnector,
  google_news: googleNewsConnector,
  wikipedia: wikipediaConnector,
  serpapi_trends: serpapiTrendsConnector,
  youtube_rss: youtubeRssConnector,
  youtube: youtubeConnector,
  instagram_graph: instagramGraphConnector,
  instagram_apify: instagramApifyConnector,
  tiktok_apify: tiktokApifyConnector,
  linkedin_web: linkedinWebConnector,
  linkedin_apify: linkedinApifyConnector,
};

export function getSourceStatuses(env: Env = process.env): SourceStatus[] {
  return Object.values(CONNECTORS).map(({ id, meta, isConfigured }) => ({
    id,
    label: meta.label,
    platform: meta.platform,
    configured: isConfigured(env),
    free: meta.free,
    needsKeywords: meta.needsKeywords,
    description: meta.description,
    envVars: meta.envVars,
    setup: meta.setup,
    costNote: meta.costNote,
    docsUrl: meta.docsUrl,
  }));
}
