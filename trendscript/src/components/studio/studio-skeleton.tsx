import { Container } from "@/components/ui/container";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/**
 * Placeholder of the Studio while the page streams in and before browser
 * storage is read (the draft lives in sessionStorage). Mirrors the real
 * layout so nothing jumps when the Studio mounts.
 */
export function StudioSkeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement du Studio">
      <div className="border-b border-line">
        <Container size="xl" className="flex h-[3.25rem] items-center gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="hidden h-3.5 w-16 md:block" />
              {index < 3 ? <Skeleton className="h-px w-6 sm:w-10" /> : null}
            </div>
          ))}
        </Container>
      </div>
      <Container size="xl" className="py-8 sm:py-10">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-8 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-[32rem] max-w-full" />
        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card lg:col-span-5 xl:col-span-4">
            <Skeleton className="h-4 w-32" />
            <div className="mt-6 space-y-5">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card lg:col-span-7 xl:col-span-8">
            <Skeleton className="h-4 w-24" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="rounded-xl border border-line p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-lg" />
                    <Skeleton className="h-3.5 w-32" />
                  </div>
                  <SkeletonText lines={2} className="mt-4" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
