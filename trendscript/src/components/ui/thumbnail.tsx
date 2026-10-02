"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Platform } from "@/lib/types";
import { PlatformIcon } from "./platform-icon";

export type ThumbnailAspect = "video" | "square" | "portrait";

const aspects: Record<ThumbnailAspect, string> = {
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[9/16]",
};

export interface ThumbnailProps {
  /** Remote image URL (CDN links from Instagram/TikTok expire: errors are expected). */
  src?: string;
  /** Alt text; use "" when the title is shown next to it. */
  alt: string;
  /** Platform shown in the placeholder when the image is missing or broken. */
  platform?: Platform;
  aspect?: ThumbnailAspect;
  className?: string;
}

/**
 * Trend thumbnail: a plain lazy `<img>` without referrer (remote CDNs vary,
 * next/image would need every host whitelisted) that falls back to a tinted
 * placeholder with the platform glyph when the URL is missing or broken.
 */
export function Thumbnail({ src, alt, platform, aspect = "video", className }: ThumbnailProps) {
  // Remember which URL failed, so a new `src` gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2",
        aspects[aspect],
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary, expiring third-party CDN URLs
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src ?? null)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" role={alt ? "img" : undefined} aria-label={alt || undefined}>
          {platform ? <PlatformIcon platform={platform} size="md" decorative /> : null}
        </div>
      )}
    </div>
  );
}
