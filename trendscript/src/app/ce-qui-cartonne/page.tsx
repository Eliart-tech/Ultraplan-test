import type { Metadata } from "next";
import { Suspense } from "react";
import { ViralSkeleton } from "@/components/viral/viral-skeleton";
import { ViralView } from "@/components/viral/viral-view";

export const metadata: Metadata = {
  title: "Ce qui cartonne",
  description:
    "Les vidéos de votre niche qui explosent au-delà de l'audience de leur créateur sur Instagram, TikTok et YouTube, les recettes qui font des vues et des abonnés, et des idées de vidéos pour vous.",
};

/**
 * Ce qui cartonne (/ce-qui-cartonne) — the niche lab: real recent videos
 * ranked by how far they went beyond their creator's audience, Claude's
 * recipes and ideas, and the saved reports. Client state only (localStorage
 * reports, streamed API call); the Suspense boundary is required because the
 * view reads `?rapport=` with useSearchParams.
 */
export default function ViralPage() {
  return (
    <Suspense fallback={<ViralSkeleton />}>
      <ViralView />
    </Suspense>
  );
}
