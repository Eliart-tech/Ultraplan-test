import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { displayUrl, tokenizeText } from "./text-tokens";

/** Inline `<code>` style shared by the settings pages. */
export const inlineCodeClass =
  "rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[0.8em] font-medium text-ink [overflow-wrap:anywhere]";

/** External link (new tab) with a small arrow and a spoken hint. */
export function ExternalAnchor({
  href,
  children,
  className,
}: {
  href: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        // relative: keeps the absolutely positioned sr-only hint inside a truncated link (no page overflow).
        "relative inline font-medium text-accent-ink underline decoration-accent/30 underline-offset-2 transition-colors duration-150 [overflow-wrap:anywhere] hover:decoration-accent",
        className,
      )}
    >
      {children ?? displayUrl(href)}
      <ExternalLink aria-hidden className="ml-0.5 inline size-3 align-[-0.05em]" />
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

/**
 * Plain text from the server rendered with clickable links and code chips
 * for env var names, `.env.local` and `npm run dev`.
 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {tokenizeText(text).map((token, index) =>
        token.type === "url" ? (
          <ExternalAnchor key={index} href={token.value} />
        ) : token.type === "code" ? (
          <code key={index} className={inlineCodeClass}>
            {token.value}
          </code>
        ) : (
          <span key={index}>{token.value}</span>
        ),
      )}
    </>
  );
}
