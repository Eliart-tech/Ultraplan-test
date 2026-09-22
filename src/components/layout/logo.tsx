import Link from "next/link";
import { site } from "@/lib/site";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={className}
      aria-label={`${site.name} — retour à l'accueil`}
    >
      <span className="flex items-center gap-2.5">
        <svg
          viewBox="0 0 32 32"
          className="h-8 w-8"
          role="img"
          aria-hidden
          focusable="false"
        >
          <defs>
            <linearGradient id="maiven-mark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-400)" />
              <stop offset="100%" stopColor="var(--color-aqua-400)" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" fill="url(#maiven-mark)" />
          <path
            d="M9 22V11.6c0-.5.62-.74.95-.36L16 18l6.05-6.76c.33-.38.95-.14.95.36V22"
            fill="none"
            stroke="#07070a"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-lg font-semibold tracking-tight text-white">
          {site.name}
        </span>
      </span>
    </Link>
  );
}
