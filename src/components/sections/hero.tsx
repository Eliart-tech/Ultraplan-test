import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Stars } from "@/components/ui/card";
import { LogoMark } from "@/components/layout/logo";
import { Reveal } from "@/components/ui/reveal";
import { hero } from "@/lib/content";

/** Three overlapping avatar discs. Swap for real photographs when you have them. */
function AvatarStack() {
  const tones = ["#dbe7ff", "#f9e2dc", "#d8f0e6"];
  return (
    <span aria-hidden className="flex -space-x-3">
      {tones.map((tone, i) => (
        <span
          key={tone}
          className="grid h-10 w-10 place-items-center rounded-full ring-2 ring-white"
          style={{ backgroundColor: tone }}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink-800/45" fill="currentColor">
            <circle cx="12" cy="9" r="3.6" />
            <path d="M4.6 20a7.4 7.4 0 0 1 14.8 0z" />
          </svg>
          <span className="sr-only">Membre {i + 1}</span>
        </span>
      ))}
    </span>
  );
}

export function Hero() {
  return (
    <section className="wash-sky relative overflow-hidden pt-32 pb-14 sm:pt-40 sm:pb-16">
      <Container>
        <Reveal className="flex flex-col items-center text-center">
          <div className="flex items-center gap-4">
            <AvatarStack />
            <div className="text-left">
              <p className="flex items-center gap-2">
                <Stars />
                <span className="text-[0.95rem] text-ink-800">
                  {hero.rating}
                  <span className="text-ink-400"> {hero.ratingOutOf}</span>
                </span>
              </p>
              <p className="mt-0.5 text-[0.9rem] text-ink-400">
                {hero.ratingCaption}
              </p>
            </div>
          </div>

          {/* The mark sits inline in the headline, exactly as in the reference. */}
          <h1 className="mt-9 max-w-4xl text-[2.4rem] leading-[1.1] sm:text-[3.1rem] md:text-[3.6rem]">
            {hero.titleBefore}{" "}
            <LogoMark className="mx-1 inline-flex h-[0.9em] w-[0.9em] translate-y-[0.1em]" />{" "}
            {hero.titleAfter}
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-ink-400 sm:text-lg">
            {hero.subtitle}
          </p>

          <div className="mt-9">
            <ButtonLink href="/contact#formulaire" size="lg">
              {hero.cta}
            </ButtonLink>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
