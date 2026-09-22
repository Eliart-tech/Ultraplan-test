import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { problem } from "@/lib/content";

export function Problem() {
  return (
    <Section id="constat">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <Reveal>
          <SectionHeading
            id="constat"
            eyebrow={problem.eyebrow}
            title={problem.title}
          />
          <p className="mt-6 max-w-xl text-base leading-relaxed text-mist-400">
            {problem.body}
          </p>
        </Reveal>

        <ul className="flex flex-col gap-4">
          {problem.pains.map((pain, index) => (
            <Reveal as="li" key={pain.title} delay={index * 90}>
              <Card className="flex gap-5 p-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/14 text-brand-300">
                  <Icon name={pain.icon} className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {pain.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-mist-400">
                    {pain.body}
                  </p>
                </div>
              </Card>
            </Reveal>
          ))}
        </ul>
      </div>
    </Section>
  );
}
