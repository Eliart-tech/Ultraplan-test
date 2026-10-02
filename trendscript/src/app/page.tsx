import type { Metadata } from "next";
import { Suspense } from "react";
import { Studio } from "@/components/studio/studio";
import { StudioSkeleton } from "@/components/studio/studio-skeleton";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Analysez les tendances réelles du moment, choisissez un sujet et un angle, et obtenez un script de vidéo courte prêt à tourner.",
};

/**
 * Studio (/) — the 4-step wizard. Everything is client state (sessionStorage
 * draft, streamed API calls); the Suspense boundary is required because the
 * Studio reads `?analyse=` / `?script=` with useSearchParams.
 */
export default function StudioPage() {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Studio />
    </Suspense>
  );
}
