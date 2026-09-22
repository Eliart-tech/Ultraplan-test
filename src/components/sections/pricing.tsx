import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { pricing } from "@/lib/content";

export function Pricing() {
  return (
    <Section id="tarifs">
      <Reveal>
        <SectionHeading
          id="tarifs"
          eyebrow={pricing.eyebrow}
          title={pricing.title}
          subtitle={pricing.subtitle}
          align="center"
        />
      </Reveal>

      <ul className="mt-14 grid items-start gap-5 lg:grid-cols-3">
        {pricing.plans.map((plan, index) => (
          <Reveal as="li" key={plan.name} delay={index * 90}>
            <div
              className={cn(
                "flex h-full flex-col rounded-3xl p-7",
                plan.highlighted
                  ? "border-gradient bg-ink-850 lg:-mt-4 lg:pb-11"
                  : "border border-white/8 bg-ink-850/70",
              )}
            >
              {plan.highlighted ? (
                <span className="mb-5 w-fit rounded-full bg-brand-500/18 px-3 py-1 text-xs font-medium text-brand-200">
                  Le plus choisi
                </span>
              ) : null}

              <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
              <p className="mt-2 text-sm text-mist-400">{plan.description}</p>

              <p className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-semibold text-white">
                  {plan.price}
                </span>
              </p>
              <p className="mt-1 text-sm text-mist-500">{plan.period}</p>

              <ul className="mt-7 flex flex-1 flex-col gap-3 border-t border-white/8 pt-7">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-mist-200"
                  >
                    <Icon
                      name="Check"
                      className="mt-0.5 h-4 w-4 shrink-0 text-aqua-300"
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              <ButtonLink
                href="/contact#formulaire"
                variant={plan.highlighted ? "primary" : "secondary"}
                size="lg"
                className="mt-8 w-full"
              >
                {plan.cta}
              </ButtonLink>
            </div>
          </Reveal>
        ))}
      </ul>

      <p className="mt-8 text-center text-sm text-mist-500">{pricing.note}</p>
    </Section>
  );
}
