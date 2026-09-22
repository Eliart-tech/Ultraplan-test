import { ButtonLink } from "@/components/ui/button";
import { Card, CheckMark } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { Section, SectionHeading } from "@/components/ui/section";
import { agents } from "@/lib/content";

/** A simple drawn portrait on a tinted, gridded panel. */
function AgentPortrait({ accent, name }: { accent: string; name: string }) {
  return (
    <div
      aria-hidden
      className="grid-faint grid h-44 place-items-center rounded-2xl"
      style={{ backgroundColor: accent }}
    >
      <svg viewBox="0 0 64 64" className="h-28 w-28" role="img" aria-label={name}>
        <circle cx="32" cy="22" r="11" className="fill-ink-800/85" />
        <path d="M11 60a21 21 0 0 1 42 0z" className="fill-ink-800/85" />
        <circle cx="27.5" cy="21" r="1.9" fill="#fff" />
        <circle cx="36.5" cy="21" r="1.9" fill="#fff" />
      </svg>
    </div>
  );
}

export function Agents() {
  return (
    <Section id="agents" className="bg-sky-50">
      <Reveal>
        <SectionHeading id="agents" eyebrow={agents.eyebrow} title={agents.title} />
      </Reveal>

      <ul className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {agents.items.map((agent, index) => (
          <Reveal as="li" key={agent.name} delay={(index % 3) * 80}>
            <Card interactive className="flex h-full flex-col p-5">
              <AgentPortrait accent={agent.accent} name={agent.name} />

              <p className="mt-5 text-[0.95rem] italic text-ink-400">
                {agent.name}
              </p>
              <h3 className="mt-1 text-xl font-medium">{agent.role}</h3>

              <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-400">
                {agent.body}
              </p>

              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {agent.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5">
                    <CheckMark />
                    <span className="text-sm leading-snug text-ink-500">
                      {bullet}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                <ButtonLink href="/contact#formulaire">{agents.cta}</ButtonLink>
              </div>
            </Card>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
