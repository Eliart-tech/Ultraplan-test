import { ButtonLink } from "@/components/ui/button";
import { Card, CheckMark } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { services } from "@/lib/content";
import { ServiceVisual } from "./service-visual";

export function Services() {
  return (
    <Section id="services" className="pt-16 sm:pt-20">
      <Reveal>
        <SectionHeading
          id="services"
          eyebrow={services.eyebrow}
          title={services.title}
        />
      </Reveal>

      <ul className="mt-16 grid gap-6 lg:grid-cols-2">
        {services.items.map((service, index) => (
          <Reveal as="li" key={service.number} delay={(index % 2) * 80}>
            <Card
              tone={index % 2 === 0 ? "sky" : "white"}
              className="flex h-full flex-col p-5 sm:p-7"
            >
              <ServiceVisual
                variant={service.visual}
                title={service.visualTitle}
                items={"visualItems" in service ? service.visualItems : undefined}
                caption={"visualCaption" in service ? service.visualCaption : undefined}
              />

              <div className="mt-7 flex items-start justify-between gap-5">
                <h3 className="text-2xl sm:text-[1.7rem]">{service.name}</h3>
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blush-300 text-sm text-ink-800"
                >
                  {service.number}
                </span>
              </div>

              <p className="mt-3.5 text-[0.95rem] leading-relaxed text-ink-400">
                {service.body}
              </p>

              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {service.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <CheckMark />
                    <span className="text-[0.95rem] text-ink-500">{bullet}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <ButtonLink href="/contact#formulaire">{service.cta}</ButtonLink>
              </div>
            </Card>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
