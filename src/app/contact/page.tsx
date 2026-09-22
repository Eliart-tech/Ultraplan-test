import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Parlons de vos opérations : 30 minutes d'échange, un audit offert et au moins deux automatisations activables dans le mois.",
  alternates: { canonical: "/contact" },
};

const channels = [
  {
    icon: "Mail" as const,
    label: "E-mail",
    value: site.email,
    href: `mailto:${site.email}`,
  },
  {
    icon: "Phone" as const,
    label: "Téléphone",
    value: site.phone,
    href: `tel:${site.phoneHref}`,
  },
  {
    icon: "MapPin" as const,
    label: "Bureaux",
    value: `${site.address.street}, ${site.address.postalCode} ${site.address.city}`,
  },
];

export default function ContactPage() {
  return (
    <div className="relative pt-36 pb-24 sm:pt-44">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-backdrop absolute inset-0" />
        <div className="absolute -top-32 left-1/2 h-96 w-[30rem] -translate-x-1/2 rounded-full bg-brand-600/18 blur-[120px]" />
      </div>

      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.1] sm:text-5xl">
              Parlons de ce qui peut{" "}
              <span className="text-gradient">tourner sans vous</span>.
            </h1>
            <p className="mt-6 text-base leading-relaxed text-mist-400">
              Décrivez-nous votre situation en quelques lignes. Nous revenons
              vers vous sous 24 h ouvrées avec un créneau d&apos;audit et deux
              premières pistes concrètes — sans engagement.
            </p>

            <ul className="mt-10 flex flex-col gap-5 border-t border-white/8 pt-8">
              {channels.map((channel) => (
                <li key={channel.label} className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/6 text-brand-300">
                    <Icon name={channel.icon} className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-mist-500">
                      {channel.label}
                    </p>
                    {channel.href ? (
                      <a
                        href={channel.href}
                        className="text-sm text-mist-100 transition hover:text-brand-200"
                      >
                        {channel.value}
                      </a>
                    ) : (
                      <p className="text-sm text-mist-100">{channel.value}</p>
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
