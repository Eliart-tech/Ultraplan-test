"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { mainNav } from "@/lib/site";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { Logo } from "./logo";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock the page behind the mobile panel and allow Escape to dismiss it.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition duration-300",
        scrolled || open
          ? "border-b border-white/8 bg-ink-950/80 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <Container>
        <div className="flex h-18 items-center justify-between gap-6">
          <Logo className="shrink-0 rounded-lg" />

          <nav aria-label="Navigation principale" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {mainNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded-full px-4 py-2 text-sm text-mist-200 transition hover:bg-white/6 hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <ButtonLink href="/contact" variant="ghost" size="md">
              Nous contacter
            </ButtonLink>
            <ButtonLink href="/contact#formulaire" variant="primary" size="md">
              Réserver un audit
              <Icon name="ArrowRight" className="h-4 w-4" />
            </ButtonLink>
          </div>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 text-mist-100 transition hover:bg-white/8 lg:hidden"
          >
            <Icon name={open ? "X" : "Menu"} className="h-5 w-5" />
          </button>
        </div>
      </Container>

      <div
        id="menu-mobile"
        hidden={!open}
        className="border-t border-white/8 bg-ink-950/95 backdrop-blur-xl lg:hidden"
      >
        <Container>
          <nav aria-label="Navigation mobile" className="py-6">
            <ul className="flex flex-col gap-1">
              {mainNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-4 py-3 text-base text-mist-100 transition hover:bg-white/6 hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-3">
              <ButtonLink
                href="/contact"
                variant="secondary"
                size="lg"
                onClick={() => setOpen(false)}
              >
                Nous contacter
              </ButtonLink>
              <ButtonLink
                href="/contact#formulaire"
                variant="primary"
                size="lg"
                onClick={() => setOpen(false)}
              >
                Réserver un audit
                <Icon name="ArrowRight" className="h-4 w-4" />
              </ButtonLink>
            </div>
          </nav>
        </Container>
      </div>
    </header>
  );
}
