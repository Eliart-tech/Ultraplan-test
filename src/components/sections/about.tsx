import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/section";
import { about } from "@/lib/content";
import { CountUp } from "@/components/ui/count-up";

export function About() {
  return (
    <section
      id="a-propos"
      aria-labelledby="a-propos-title"
      className="bg-white py-20 sm:py-28"
    >
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Replace with a photograph of the team. */}
          <Reveal>
            <div
              aria-hidden
              className="grid-faint grid h-72 place-items-center rounded-4xl bg-sky-100 sm:h-[26rem]"
            >
              <span className="rounded-full bg-white px-4 py-2 text-sm text-ink-400">
                Photo de l&apos;équipe à ajouter
              </span>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <Eyebrow>{about.eyebrow}</Eyebrow>
            <h2
              id="a-propos-title"
              className="mt-5 text-[2rem] leading-[1.14] sm:text-[2.6rem]"
            >
              {about.title}
            </h2>
            <p className="mt-6 text-base leading-relaxed text-ink-400">
              {about.body}
            </p>
            <div className="mt-8">
              <ButtonLink href="/contact#formulaire">{about.cta}</ButtonLink>
            </div>
          </Reveal>
        </div>

        <Reveal delay={60}>
          <dl className="mt-20 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {about.stats.map((stat) => (
              <div key={stat.label} className="flex flex-col text-center">
                <dt className="order-2 mt-2 text-[0.95rem] text-ink-400">
                  {stat.label}
                </dt>
                <dd className="order-1 text-[2.6rem] leading-none text-ink-800 sm:text-[3.2rem]">
                  <CountUp to={stat.value} prefix="+" />
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>
    </section>
  );
}
