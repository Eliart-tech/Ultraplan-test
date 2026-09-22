import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Page introuvable",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="wash-sky flex min-h-[70vh] items-center py-32">
      <Container className="text-center">
        <p className="text-sm text-ink-400">Erreur 404</p>
        <h1 className="mt-5 text-[2.4rem] leading-tight sm:text-[3.2rem]">
          Cette page n&apos;existe pas.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-ink-400">
          Le lien est peut-être obsolète, ou la page a changé d&apos;adresse.
          Reprenons depuis l&apos;accueil.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <ButtonLink href="/" size="lg">
            Retour à l&apos;accueil
          </ButtonLink>
          <ButtonLink href="/contact" variant="white" size="lg">
            Nous contacter
          </ButtonLink>
        </div>
      </Container>
    </div>
  );
}
