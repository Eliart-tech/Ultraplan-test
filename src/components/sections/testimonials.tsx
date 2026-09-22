import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { testimonials } from "@/lib/content";

export function Testimonials() {
  return (
    <Section id="temoignages" className="bg-ink-900/40">
      <Reveal>
        <SectionHeading
          id="temoignages"
          eyebrow={testimonials.eyebrow}
          title={testimonials.title}
        />
      </Reveal>

      <ul className="mt-14 grid gap-5 lg:grid-cols-3">
        {testimonials.items.map((item, index) => (
          <Reveal as="li" key={item.author} delay={index * 90}>
            <Card className="flex h-full flex-col">
              <span aria-hidden className="text-4xl leading-none text-brand-400/50">
                &ldquo;
              </span>
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-mist-200">
                {item.quote}
              </blockquote>
              <footer className="mt-7 border-t border-white/8 pt-5">
                <p className="text-sm font-semibold text-white">{item.author}</p>
                <p className="mt-0.5 text-sm text-mist-500">{item.role}</p>
              </footer>
            </Card>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
