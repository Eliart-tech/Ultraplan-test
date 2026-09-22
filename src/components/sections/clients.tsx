import { Container } from "@/components/ui/container";
import { clients } from "@/lib/content";

export function Clients() {
  return (
    <section className="border-y border-white/8 bg-ink-900/60 py-10">
      <Container>
        <h2 className="text-center text-xs font-medium uppercase tracking-[0.18em] text-mist-500">
          Ils automatisent déjà leurs opérations avec nous
        </h2>
      </Container>

      {/* The list is duplicated so the -50% translation loops seamlessly; the
          copy is hidden from assistive tech to avoid reading it twice. */}
      <div
        className="relative mt-8 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, #000 12%, #000 88%, transparent)",
        }}
      >
        <ul className="animate-marquee flex w-max items-center gap-14 pr-14">
          {clients.map((name) => (
            <li
              key={name}
              className="text-xl font-medium whitespace-nowrap text-mist-500 transition hover:text-mist-200"
            >
              {name}
            </li>
          ))}
          {clients.map((name) => (
            <li
              key={`dup-${name}`}
              aria-hidden
              className="text-xl font-medium whitespace-nowrap text-mist-500"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
