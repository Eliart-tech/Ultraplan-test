import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { services } from "@/lib/content";

export function Services() {
  return (
    <Section id="services" className="bg-ink-900/40">
      <Reveal>
        <SectionHeading
          id="services"
          eyebrow={services.eyebrow}
          title={services.title}
          subtitle={services.subtitle}
        />
      </Reveal>

      <ul className="mt-14 grid gap-5 md:grid-cols-2">
        {services.items.map((service, index) => (
          <Reveal as="li" key={service.name} delay={(index % 2) * 90}>
            <Card interactive className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/25 to-aqua-500/15 text-brand-200">
                  <Icon name={service.icon} className="h-6 w-6" />
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist-400">
                  {service.pitch}
                </span>
              </div>

              <h3 className="mt-6 text-xl font-semibold text-white">
                {service.name}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-mist-400">
                {service.body}
              </p>

              <ul className="mt-6 flex flex-col gap-2.5 border-t border-white/8 pt-6">
                {service.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex items-start gap-2.5 text-sm text-mist-200"
                  >
                    <Icon
                      name="Check"
                      className="mt-0.5 h-4 w-4 shrink-0 text-aqua-300"
                    />
                    {bullet}
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
