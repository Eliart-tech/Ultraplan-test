import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { Container } from "@/components/ui/container";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Parlons de votre activité : réservez un appel et un audit IA offert pour identifier les agents et automatisations à fort impact.",
  alternates: { canonical: "/contact" },
};

const channels = [
  {
    label: "E-mail",
    value: site.email,
    href: `mailto:${site.email}`,
  },
  {
    label: "Téléphone",
    value: site.phone,
    href: `tel:${site.phoneHref}`,
  },
  {
    label: "Bureaux",
    value: `${site.address.street}, ${site.address.postalCode} ${site.address.city}`,
  },
];

export default function ContactPage() {
  return (
    <div className="wash-sky relative pt-36 pb-24 sm:pt-44">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h1 className="text-[2.4rem] leading-[1.1] sm:text-[3.2rem]">
              Devenons ensemble une entreprise AI-first.
            </h1>
            <p className="mt-6 text-base leading-relaxed text-ink-400">
              Décrivez-nous votre situation en quelques lignes. Nous revenons
              vers vous sous 24 h ouvrées avec un créneau d&apos;audit pour
              identifier les agents IA et automatisations les plus utiles à
              votre activité — sans engagement.
            </p>

            <ul className="mt-10 flex flex-col gap-5 border-t border-line pt-8">
              {channels.map((channel) => (
                <li key={channel.label} className="flex items-start gap-3.5">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blush-400"
                  />
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-ink-400">
                      {channel.label}
                    </p>
                    {channel.href ? (
                      <a
                        href={channel.href}
                        className="text-sm text-ink-800 transition hover:text-sky-600"
                      >
                        {channel.value}
                      </a>
                    ) : (
                      <p className="text-sm text-ink-800">{channel.value}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div id="formulaire" className="scroll-mt-32">
            <ContactForm />
          </div>
        </div>
      </Container>
    </div>
  );
}
