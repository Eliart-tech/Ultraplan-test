import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { faq } from "@/lib/content";

export function Faq() {
  return (
    <Section id="faq" className="bg-sky-50">
      <Reveal>
        <SectionHeading id="faq" eyebrow={faq.eyebrow} title={faq.title} />
      </Reveal>

      {/* Native <details> keeps the accordion keyboard- and screen-reader-friendly
          without a line of JavaScript. */}
      <ul className="mx-auto mt-14 flex max-w-3xl flex-col gap-3">
        {faq.items.map((item, index) => (
          <Reveal as="li" key={item.q} delay={index * 50}>
            <details className="group rounded-3xl border border-line bg-white px-6 open:pb-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[1.05rem] text-ink-800 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-800 transition duration-300 group-open:rotate-45"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                    <path
                      d="M8 2.5v11M2.5 8h11"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </summary>
              <p className="pb-5 pr-10 text-[0.95rem] leading-relaxed text-ink-400">
                {item.a}
              </p>
            </details>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
