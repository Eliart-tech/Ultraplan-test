import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { finalCta } from "@/lib/content";
import { site } from "@/lib/site";

export function FinalCta() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-4xl border border-white/10 bg-gradient-to-br from-brand-700/35 via-ink-900 to-ink-900 px-6 py-16 text-center sm:px-14">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[38rem] -translate-x-1/2 rounded-full bg-brand-500/25 blur-[120px]"
            />

            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-semibold leading-[1.14] sm:text-4xl md:text-[2.75rem]">
                {finalCta.title}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-mist-300 sm:text-lg">
                {finalCta.subtitle}
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <ButtonLink href="/contact#formulaire" size="lg">
                  {finalCta.primary}
                  <Icon name="ArrowRight" className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink
                  href={`mailto:${site.email}`}
                  variant="secondary"
                  size="lg"
                >
                  {finalCta.secondary}
                </ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
