import { BookOpen, Camera, Music2, Newspaper, Play, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Platform, ScriptPlatform } from "@/lib/types";

export interface PlatformMeta {
  /** French display name. */
  label: string;
  icon: LucideIcon;
  /** Literal Tailwind classes (kept static so Tailwind can see them). */
  textClass: string;
  /** Tinted background + coloured icon, for the small square tile. */
  tileClass: string;
}

/**
 * Platform → icon, colour and French label. lucide has no brand logos, so
 * each platform gets a neutral glyph in its brand colour.
 */
export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  google: {
    label: "Google",
    icon: TrendingUp,
    textClass: "text-platform-google",
    tileClass: "bg-platform-google/10 text-platform-google",
  },
  news: {
    label: "Actualités",
    icon: Newspaper,
    textClass: "text-platform-news",
    tileClass: "bg-platform-news/10 text-platform-news",
  },
  wikipedia: {
    label: "Wikipédia",
    icon: BookOpen,
    textClass: "text-platform-wikipedia",
    tileClass: "bg-platform-wikipedia/10 text-platform-wikipedia",
  },
  youtube: {
    label: "YouTube",
    icon: Play,
    textClass: "text-platform-youtube",
    tileClass: "bg-platform-youtube/10 text-platform-youtube",
  },
  instagram: {
    label: "Instagram",
    icon: Camera,
    textClass: "text-platform-instagram",
    tileClass: "bg-platform-instagram/10 text-platform-instagram",
  },
  tiktok: {
    label: "TikTok",
    icon: Music2,
    textClass: "text-platform-tiktok",
    tileClass: "bg-platform-tiktok/10 text-platform-tiktok",
  },
};

/** French label of a platform ("Wikipédia"). */
export function platformLabel(platform: Platform): string {
  return PLATFORM_META[platform]?.label ?? platform;
}

/** Social platform behind a script target (instagram_reels → instagram). */
export function scriptPlatformToPlatform(platform: ScriptPlatform): Platform {
  if (platform === "instagram_reels") return "instagram";
  if (platform === "youtube_shorts") return "youtube";
  return "tiktok";
}

export type PlatformIconSize = "xs" | "sm" | "md" | "lg";

const glyphSizes: Record<PlatformIconSize, string> = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
};

const tileSizes: Record<PlatformIconSize, string> = {
  xs: "size-5 rounded-md",
  sm: "size-6 rounded-md",
  md: "size-8 rounded-lg",
  lg: "size-10 rounded-xl",
};

export interface PlatformIconProps {
  platform: Platform;
  size?: PlatformIconSize;
  /** Draw the glyph inside a tinted square tile (default true). */
  tile?: boolean;
  /**
   * Decorative icons (next to a visible platform name) are hidden from
   * assistive tech. Default false: the icon announces the platform name.
   */
  decorative?: boolean;
  className?: string;
}

/**
 * Brand-coloured platform glyph, optionally in a tinted tile.
 *
 * @example <PlatformIcon platform="tiktok" size="sm" />
 */
export function PlatformIcon({
  platform,
  size = "sm",
  tile = true,
  decorative = false,
  className,
}: PlatformIconProps) {
  const meta = PLATFORM_META[platform];
  if (!meta) return null;
  const Icon = meta.icon;
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": meta.label, title: meta.label } as const);

  if (!tile) {
    return (
      <span className={cn("inline-flex shrink-0", meta.textClass, className)} {...a11y}>
        <Icon aria-hidden className={glyphSizes[size]} strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", tileSizes[size], meta.tileClass, className)}
      {...a11y}
    >
      <Icon aria-hidden className={glyphSizes[size]} strokeWidth={2.2} />
    </span>
  );
}

export interface PlatformStackProps {
  platforms: Platform[];
  size?: PlatformIconSize;
  /** Show at most this many icons, then "+n". */
  max?: number;
  className?: string;
}

/** Row of small platform tiles (topic cards), announced as one list. */
export function PlatformStack({ platforms, size = "sm", max = 6, className }: PlatformStackProps) {
  const unique = Array.from(new Set(platforms));
  const shown = unique.slice(0, max);
  const hidden = unique.length - shown.length;
  return (
    <span
      role="img"
      aria-label={`Plateformes : ${unique.map(platformLabel).join(", ")}`}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {shown.map((platform) => (
        <PlatformIcon key={platform} platform={platform} size={size} decorative />
      ))}
      {hidden > 0 ? (
        <span aria-hidden className="text-xs font-medium tabular-nums text-muted">
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
