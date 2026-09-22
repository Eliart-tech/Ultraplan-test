import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "Page introuvable",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="relative flex min-h-[70vh] items-center py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-backdrop absolute inset-0" />
      </div>

      <Container className="text-center">
        <p className="font-mono text-sm text-brand-300">Erreur 404</p>
        <h1 className="mt-5 text-4xl font-semibold sm:text-5xl">
          Cette page n&apos;existe pas.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-mist-400">
          Le lien est peut-être obsolète, ou la page a changé d&apos;adresse.
          Reprenons depuis l&apos;accueil.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <ButtonLink href="/" size="lg">
            Retour à l&apos;accueil
            <Icon name="ArrowRight" className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink href="/contact" variant="secondary" size="lg">
            Nous contacter
          </ButtonLink>
        </div>
      </Container>
    </div>
  );
}
