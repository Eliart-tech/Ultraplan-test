import { Card, Stars } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { testimonials } from "@/lib/content";

export function Testimonials() {
  return (
    <Section id="temoignages">
      <Reveal>
        <SectionHeading
          id="temoignages"
          eyebrow={testimonials.eyebrow}
          title={testimonials.title}
        />
      </Reveal>

      <ul className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {testimonials.items.map((item, index) => (
          <Reveal as="li" key={`${item.author}-${index}`} delay={(index % 3) * 80}>
            <Card tone="sky" className="flex h-full flex-col p-6">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-10 w-10 place-items-center rounded-full bg-white"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink-800/40" fill="currentColor">
                    <circle cx="12" cy="9" r="3.6" />
                    <path d="M4.6 20a7.4 7.4 0 0 1 14.8 0z" />
                  </svg>
                </span>
                <div>
                  <p className="text-[0.95rem] text-ink-800">{item.author}</p>
                  <p className="text-sm text-ink-400">{item.handle}</p>
                </div>
              </div>

              <blockquote className="mt-5 flex-1 text-[0.95rem] leading-relaxed text-ink-500">
                {item.quote}
              </blockquote>

              <Stars className="mt-6" />
            </Card>
          </Reveal>
        ))}
      </ul>

      <Reveal delay={80}>
        <div className="mt-16 grid items-center gap-10 rounded-5xl bg-sky-100 p-8 sm:p-12 lg:grid-cols-2">
          <div>
            <Stars />
            <blockquote className="mt-5 text-[1.5rem] leading-snug text-ink-800 sm:text-[1.9rem]">
              {testimonials.featured.quote}
            </blockquote>
            <footer className="mt-7">
              <p className="text-base text-ink-800">
                {testimonials.featured.author}
              </p>
              <p className="mt-0.5 text-[0.95rem] text-ink-400">
                {testimonials.featured.role}
              </p>
            </footer>
          </div>

          {/* Replace with a photograph of the team or the client. */}
          <div
            aria-hidden
            className="grid-faint grid h-64 place-items-center rounded-4xl bg-white sm:h-80"
          >
            <span className="rounded-full bg-sky-100 px-4 py-2 text-sm text-ink-400">
              Photo à ajouter
            </span>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
