import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { method } from "@/lib/content";

export function Method() {
  return (
    <Section id="methode">
      <Reveal>
        <SectionHeading
          id="methode"
          eyebrow={method.eyebrow}
          title={method.title}
          subtitle={method.subtitle}
        />
      </Reveal>

      <ol className="mt-14 flex flex-col">
        {method.steps.map((step, index) => (
          <Reveal as="li" key={step.number} delay={index * 70}>
            <div className="group relative grid gap-4 border-t border-white/8 py-8 sm:grid-cols-[auto_1fr] sm:gap-10 md:grid-cols-[auto_minmax(0,18rem)_1fr]">
              <span className="font-mono text-sm text-brand-300 sm:pt-1">
                {step.number}
              </span>
              <h3 className="text-xl font-semibold text-white">
                {step.title}
                <span className="mt-1 block text-sm font-normal text-mist-500">
                  {step.duration}
                </span>
              </h3>
              <p className="max-w-2xl text-sm leading-relaxed text-mist-400">
                {step.body}
              </p>
            </div>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}
