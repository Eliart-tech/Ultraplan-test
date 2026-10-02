"use client";

import { House, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

/**
 * Route-level error boundary. `retry` re-fetches and re-renders the segment
 * (Next 16.3), `reset` only re-renders it — offered as a lighter fallback.
 */
export default function ErrorPage({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Server errors arrive with a generic production message: only show
  // messages thrown by our own client code (already in French).
  const detail = error.digest ? null : error.message;

  return (
    <Container size="sm" className="flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger-ink">
        <TriangleAlert aria-hidden className="size-7" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Quelque chose s&apos;est mal passé</h1>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted">
        Cette page n&apos;a pas pu s&apos;afficher. Vos scripts et votre profil enregistrés dans ce navigateur ne sont
        pas touchés.
      </p>
      {detail ? (
        <p className="mt-4 max-w-md rounded-xl border border-line bg-surface-2 px-4 py-3 text-left text-sm text-ink">
          {detail}
        </p>
      ) : null}
      {error.digest ? <p className="mt-3 text-xs text-faint">Référence : {error.digest}</p> : null}
      <div className="mt-8 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Button variant="primary" leftIcon={<RotateCcw aria-hidden className="size-4" />} onClick={() => retry()}>
          Réessayer
        </Button>
        <Button variant="secondary" onClick={() => reset()}>
          Réafficher sans recharger
        </Button>
        <ButtonLink href="/" variant="ghost" leftIcon={<House aria-hidden className="size-4" />}>
          Retour au Studio
        </ButtonLink>
      </div>
    </Container>
  );
}
