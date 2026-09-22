import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { LogoMark } from "@/components/layout/logo";
import { Reveal } from "@/components/ui/reveal";
import { finalCta } from "@/lib/content";

export function FinalCta() {
  return (
    <section className="bg-white pb-20 sm:pb-28">
      <Container>
        <Reveal>
          <div className="wash-blush rounded-5xl px-6 py-20 text-center sm:px-14 sm:py-24">
            <LogoMark className="mx-auto h-12 w-12 bg-ink-800 text-white [&_path]:!text-white" />
            <h2 className="mx-auto mt-8 max-w-2xl text-[2rem] leading-[1.14] sm:text-[2.6rem] md:text-[3rem]">
              {finalCta.title}
            </h2>
            <div className="mt-10 flex justify-center">
              <ButtonLink href="/contact#formulaire" variant="white" size="lg">
                {finalCta.cta}
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
