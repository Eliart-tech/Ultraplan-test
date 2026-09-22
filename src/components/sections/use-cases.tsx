import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { useCases } from "@/lib/content";

export function UseCases() {
  return (
    <Section id="cas-usage" className="bg-ink-900/40">
      <Reveal>
        <SectionHeading
          id="cas-usage"
          eyebrow={useCases.eyebrow}
          title={useCases.title}
          subtitle={useCases.subtitle}
        />
      </Reveal>

      <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {useCases.items.map((item, index) => (
          <Reveal as="li" key={item.title} delay={(index % 3) * 80}>
            <Card interactive className="flex h-full flex-col p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/6 text-aqua-300">
                  <Icon name={item.icon} className="h-4.5 w-4.5" />
                </span>
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-mist-500">
                  {item.sector}
                </span>
              </div>

              <h3 className="mt-5 text-lg font-semibold text-white">
                {item.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-mist-400">
                {item.body}
              </p>

              <p className="mt-auto pt-6 text-sm font-medium text-brand-300">
                {item.metric}
              </p>
            </Card>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
