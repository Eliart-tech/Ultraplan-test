import type { Metadata } from "next";
import { Compass, History, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Page introuvable",
};

export default function NotFound() {
  return (
    <Container size="sm" className="flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <Compass aria-hidden className="size-7" />
      </span>
      <p className="text-sm font-semibold tabular-nums text-accent-ink">Erreur 404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Cette page n&apos;existe pas</h1>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted">
        Le lien est peut-être incomplet ou la page a été déplacée. Reprenez depuis le Studio ou retrouvez vos scripts
        dans l&apos;historique.
      </p>
      <div className="mt-8 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <ButtonLink href="/" variant="primary" leftIcon={<Sparkles aria-hidden className="size-4" />}>
          Ouvrir le Studio
        </ButtonLink>
        <ButtonLink href="/historique" variant="secondary" leftIcon={<History aria-hidden className="size-4" />}>
          Voir l&apos;historique
        </ButtonLink>
      </div>
    </Container>
  );
}
