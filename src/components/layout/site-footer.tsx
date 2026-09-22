import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { footerNav, site } from "@/lib/site";
import { Logo } from "./logo";

const socials = [
  { label: "Instagram", href: site.socials.instagram },
  { label: "LinkedIn", href: site.socials.linkedin },
  { label: "YouTube", href: site.socials.youtube },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <Container className="py-16">
        <div className="grid gap-12 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="flex flex-col items-start gap-5">
            <Logo className="rounded-lg" />
            <p className="max-w-[15rem] text-lg leading-snug text-ink-800">
              {site.tagline}
            </p>
            <ButtonLink href="/contact#formulaire">Commencer</ButtonLink>
          </div>

          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-base text-ink-800">{group.title}</h2>
              <ul className="mt-5 flex flex-col gap-3">
                {group.items.map((item) => (
                  <li key={`${group.title}-${item.label}`}>
                    <Link
                      href={item.href}
                      className="text-[0.95rem] text-ink-400 transition hover:text-ink-800"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-5 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-400">
            © {new Date().getFullYear()} {site.legalName} · Tous droits réservés
          </p>
          <ul className="flex flex-wrap items-center gap-6">
            {socials.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-400 transition hover:text-ink-800"
                >
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>

      <div className="border-t border-line">
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-3 py-5 text-xs tracking-[0.16em] text-ink-400 uppercase">
            <span>@{site.name} Agency</span>
            <span>IA &amp; automatisation</span>
          </div>
        </Container>
      </div>

    </footer>
  );
}
