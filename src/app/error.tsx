"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with your error reporter (Sentry, Axiom…) when one is wired up.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center py-32">
      <Container className="text-center">
        <p className="text-sm text-ink-400">Erreur inattendue</p>
        <h1 className="mt-5 text-[2.4rem] leading-tight sm:text-[3.2rem]">
          Quelque chose s&apos;est mal passé.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-ink-400">
          L&apos;incident a été enregistré. Réessayez dans un instant — si le
          problème persiste, écrivez-nous et nous regardons tout de suite.
        </p>
        {error.digest ? (
          <p className="mt-4 text-xs text-ink-400">Référence : {error.digest}</p>
        ) : null}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button type="button" size="lg" onClick={reset}>
            Réessayer
          </Button>
          <ButtonLink href="/contact" variant="white" size="lg">
            Nous contacter
          </ButtonLink>
        </div>
      </Container>
    </div>
  );
}
