import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { statement } from "@/lib/content";

/** The large editorial paragraph, with the emphasised parts in navy. */
export function Statement() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <Container>
        <Reveal>
          <p className="mx-auto max-w-4xl text-center text-[1.6rem] leading-[1.35] text-ink-400 sm:text-[2.1rem] md:text-[2.4rem]">
            <span className="text-ink-800">{statement.lead}</span>{" "}
            {statement.rest}{" "}
            <span className="text-ink-800">{statement.lead2}</span>{" "}
            {statement.rest2}{" "}
            <span className="text-ink-800">{statement.tail}</span>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
