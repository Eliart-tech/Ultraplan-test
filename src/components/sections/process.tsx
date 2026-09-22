import { Reveal } from "@/components/ui/reveal";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { process } from "@/lib/content";

export function Process() {
  return (
    <section
      id="processus"
      aria-labelledby="processus-title"
      className="bg-white py-20 sm:py-28"
    >
      <Container>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <Eyebrow>{process.eyebrow}</Eyebrow>
            <h2
              id="processus-title"
              className="mt-5 text-[2rem] leading-[1.14] sm:text-[2.6rem] md:text-[3rem]"
            >
              {process.title}
            </h2>
          </Reveal>

          <ol className="flex flex-col">
            {process.steps.map((step, index) => (
              <Reveal as="li" key={step.title} delay={index * 80}>
                <div className="border-b border-line py-7 last:border-b-0">
                  <h3 className="flex items-center gap-2.5 text-xl">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-blush-400"
                    />
                    {step.title}
                  </h3>
                  <p className="mt-3 pl-6 text-[0.95rem] leading-relaxed text-ink-400">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
