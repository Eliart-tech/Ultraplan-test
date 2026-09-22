import Link from "next/link";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/** The blush disc with the navy mark, followed by the wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-full bg-blush-300",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="none">
        <path
          d="M4 19V6.4c0-.62.75-.93 1.19-.49L12 12.7l6.81-6.79c.44-.44 1.19-.13 1.19.49V19"
          stroke="currentColor"
          className="text-ink-800"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5", className)}
      aria-label={`${site.name} — retour à l'accueil`}
    >
      <LogoMark className="h-8 w-8" />
      <span className="text-xl text-ink-800">{site.name}</span>
    </Link>
  );
}
