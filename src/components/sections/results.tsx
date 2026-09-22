import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { results } from "@/lib/content";

export function Results() {
  return (
    <Section id="resultats">
      <div className="relative overflow-hidden rounded-4xl border border-white/8 bg-ink-900 px-6 py-14 sm:px-12 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-brand-600/18 blur-[110px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-aqua-500/12 blur-[110px]"
        />

        <Reveal className="relative">
          <SectionHeading
            id="resultats"
            eyebrow={results.eyebrow}
            title={results.title}
            subtitle={results.subtitle}
            align="center"
          />
        </Reveal>

        <Reveal delay={110} className="relative">
          <dl className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {results.stats.map((stat) => (
              <div key={stat.label} className="flex flex-col text-center">
                {/* dt before dd in the DOM, reordered visually with `order-*`. */}
                <dt className="order-2 mt-3 text-sm font-medium text-white">
                  {stat.label}
                </dt>
                <dd className="text-gradient order-1 text-4xl font-semibold sm:text-5xl">
                  {stat.value}
                </dd>
                {/* mist-400, not mist-500: the aqua glow lifts this panel's
                    background and mist-500 fell to 4.2:1 on top of it. */}
                <dd className="order-3 mt-1 text-sm text-mist-400">
                  {stat.detail}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </Section>
  );
}
