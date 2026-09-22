import { Container } from "@/components/ui/container";
import { clients } from "@/lib/content";

export function Clients() {
  return (
    <section className="bg-white pb-2">
      <Container>
        <h2 className="sr-only">Ils nous font confiance</h2>
        {/* The list is duplicated so the -50% translation loops seamlessly; the
            copy is hidden from assistive tech so it is not announced twice. */}
        <div
          className="relative overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, #000 14%, #000 86%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, #000 14%, #000 86%, transparent)",
          }}
        >
          <ul className="animate-marquee flex w-max items-center gap-16 pr-16">
            {clients.map((name) => (
              <li
                key={name}
                className="text-lg whitespace-nowrap text-ink-400 transition hover:text-ink-800"
              >
                {name}
              </li>
            ))}
            {clients.map((name) => (
              <li
                key={`dup-${name}`}
                aria-hidden
                className="text-lg whitespace-nowrap text-ink-400"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
