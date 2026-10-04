import { Container } from "@/components/ui/container";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Placeholder of /concurrents while the page streams in and before browser storage is read. */
export function CompetitorsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement des concurrents">
      <Container size="xl" className="py-8 sm:py-10">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-3 h-8 w-64 max-w-full" />
        <Skeleton className="mt-3 h-4 w-[34rem] max-w-full" />
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <Skeleton className="h-4 w-40" />
            <SkeletonText lines={2} className="mt-3" />
            <Skeleton className="mt-6 h-9 w-full rounded-xl" />
            <Skeleton className="mt-6 h-10 w-full rounded-xl" />
            <Skeleton className="mt-6 h-20 w-full rounded-xl" />
            <Skeleton className="mt-6 h-12 w-full rounded-xl" />
          </div>
          <div className="grid content-start gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-lg" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <SkeletonText lines={2} className="mt-4" />
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
