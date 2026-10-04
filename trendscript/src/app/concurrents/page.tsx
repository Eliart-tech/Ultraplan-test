import type { Metadata } from "next";
import { Suspense } from "react";
import { CompetitorsSkeleton } from "@/components/competitors/competitors-skeleton";
import { CompetitorsView } from "@/components/competitors/competitors-view";

export const metadata: Metadata = {
  title: "Concurrents",
  description:
    "Analysez un créateur à partir de son pseudo : publications réelles, ce qui surperforme, ce qui fait venir des abonnés, et des idées de vidéos pour vous en démarquer.",
};

/**
 * Concurrents (/concurrents) — competitor analysis from a handle, and the
 * saved reports. Client state only (localStorage reports, streamed API
 * call); the Suspense boundary is required because the view reads
 * `?rapport=` with useSearchParams.
 */
export default function CompetitorsPage() {
  return (
    <Suspense fallback={<CompetitorsSkeleton />}>
      <CompetitorsView />
    </Suspense>
  );
}
