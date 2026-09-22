import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { faq } from "@/lib/content";

export function Faq() {
  return (
    <Section id="faq" className="bg-ink-900/40">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
        <Reveal>
          <SectionHeading id="faq" eyebrow={faq.eyebrow} title={faq.title} />
          <p className="mt-5 text-sm leading-relaxed text-mist-400">
            Une question qui n&apos;est pas dans la liste ?{" "}
            <a
              href="/contact"
              className="text-brand-300 underline underline-offset-4 transition hover:text-brand-200"
            >
              Écrivez-nous
            </a>
            , nous répondons sous 24 h ouvrées.
          </p>
        </Reveal>

        {/* Native <details> keeps the accordion keyboard- and screen-reader-friendly
            without a line of JavaScript. */}
        <ul className="flex flex-col">
          {faq.items.map((item, index) => (
            <Reveal as="li" key={item.q} delay={index * 60}>
              <details className="group border-b border-white/8">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-medium text-white transition hover:text-brand-200 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Icon
                    name="ChevronDown"
                    className="h-5 w-5 shrink-0 text-mist-400 transition duration-300 group-open:rotate-180"
                  />
                </summary>
                <p className="pb-6 pr-10 text-sm leading-relaxed text-mist-400">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </ul>
      </div>
    </Section>
  );
}
