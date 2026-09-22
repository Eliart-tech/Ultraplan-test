import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { footerNav, site } from "@/lib/site";
import { Logo } from "./logo";

const socials = [
  { label: "LinkedIn", href: site.socials.linkedin },
  { label: "Instagram", href: site.socials.instagram },
  { label: "YouTube", href: site.socials.youtube },
  { label: "X", href: site.socials.x },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/8 bg-ink-900">
      <Container className="py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-5">
            <Logo className="w-fit rounded-lg" />
            <p className="max-w-xs text-sm leading-relaxed text-mist-400">
              {site.description}
            </p>
            <ul className="flex flex-col gap-2 text-sm">
              <li>
                <a
                  href={`mailto:${site.email}`}
                  className="inline-flex items-center gap-2 text-mist-200 transition hover:text-white"
                >
                  <Icon name="Mail" className="h-4 w-4 text-brand-300" />
                  {site.email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${site.phoneHref}`}
                  className="inline-flex items-center gap-2 text-mist-200 transition hover:text-white"
                >
                  <Icon name="Phone" className="h-4 w-4 text-brand-300" />
                  {site.phone}
                </a>
              </li>
              <li className="inline-flex items-center gap-2 text-mist-400">
                <Icon name="MapPin" className="h-4 w-4 text-brand-300" />
                {site.address.postalCode} {site.address.city}, France
              </li>
            </ul>
          </div>

          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-sm font-semibold text-white">{group.title}</h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-mist-400 transition hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-5 border-t border-white/8 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-mist-500">
            © {new Date().getFullYear()} {site.legalName}. Tous droits réservés.
          </p>
          <ul className="flex flex-wrap items-center gap-5">
            {socials.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-mist-400 transition hover:text-white"
                >
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  );
}
