import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { hero } from "@/lib/content";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-36 pb-20 sm:pt-44 sm:pb-28">
      {/* Decorative backdrop: grid + two drifting glows. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-backdrop absolute inset-0" />
        <div className="animate-float absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand-600/22 blur-[130px]" />
        <div className="animate-float absolute -right-32 top-24 h-[26rem] w-[26rem] rounded-full bg-aqua-500/12 blur-[120px] [animation-delay:-4s]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink-950" />
      </div>

      <Container>
        <Reveal className="flex flex-col items-center text-center">
          <p className="border-gradient inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-brand-200 sm:text-sm">
            <Icon name="Sparkles" className="h-3.5 w-3.5 text-aqua-300" />
            {hero.badge}
          </p>

          <h1 className="mt-7 max-w-4xl text-4xl font-semibold leading-[1.06] sm:text-6xl md:text-7xl">
            {hero.title}
            <br className="hidden sm:block" />{" "}
            <span className="text-gradient">{hero.titleAccent}</span>
          </h1>

          <p className="mt-7 max-w-2xl text-base leading-relaxed text-mist-400 sm:text-lg">
            {hero.subtitle}
          </p>

          <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <ButtonLink href="/contact#formulaire" size="lg">
              {hero.primaryCta}
              <Icon name="ArrowRight" className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/#cas-usage" variant="secondary" size="lg">
              {hero.secondaryCta}
            </ButtonLink>
          </div>

          <p className="mt-5 flex items-center justify-center gap-2 text-sm text-mist-500">
            <Icon
              name="ShieldCheck"
              className="h-4 w-4 shrink-0 text-brand-300"
            />
            <span className="text-balance">
              Audit offert · Sans engagement · Réponse sous 24 h ouvrées
            </span>
          </p>
        </Reveal>

        <Reveal delay={120}>
          <dl className="mx-auto mt-20 grid max-w-3xl grid-cols-1 gap-px overflow-hidden rounded-3xl border border-white/8 bg-white/8 sm:grid-cols-3">
            {hero.proof.map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center gap-1.5 bg-ink-900 px-6 py-8 text-center"
              >
                {/* Visual order is value-then-label; the DOM keeps dt before dd
                    so the definition list stays valid. */}
                <dt className="order-2 text-sm text-mist-400">{item.label}</dt>
                <dd className="order-1 text-3xl font-semibold text-white sm:text-4xl">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>
    </section>
  );
}
