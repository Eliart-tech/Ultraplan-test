import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The site's signature button: a pill with the label on the left and the arrow
 * in its own circle on the right.
 */

type Variant = "blush" | "white" | "navy" | "plain";
type Size = "md" | "lg";

const base =
  "group/btn inline-flex items-center gap-2 rounded-full font-normal transition duration-200 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<Variant, string> = {
  blush: "bg-blush-300 text-ink-800 hover:bg-blush-400",
  white: "bg-white text-ink-800 shadow-[0_2px_14px_rgba(37,48,102,0.10)] hover:bg-sky-50",
  navy: "bg-ink-800 text-white hover:bg-ink-900",
  plain: "text-ink-800 hover:text-sky-600",
};

const sizes: Record<Size, string> = {
  md: "h-11 pl-5 pr-1.5 text-[0.95rem]",
  lg: "h-13 pl-7 pr-2 text-base",
};

const dotSizes: Record<Size, string> = {
  md: "h-8 w-8",
  lg: "h-9 w-9",
};

const dotVariants: Record<Variant, string> = {
  blush: "bg-white text-ink-800",
  white: "bg-blush-300 text-ink-800",
  navy: "bg-white/15 text-white",
  plain: "bg-blush-300 text-ink-800",
};

function Arrow({ variant, size }: { variant: Variant; size: Size }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover/btn:translate-x-0.5",
        dotSizes[size],
        dotVariants[variant],
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path
          d="M2.5 8h11m0 0L9 3.5M13.5 8 9 12.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function ButtonLink({
  href,
  variant = "blush",
  size = "md",
  arrow = true,
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  const classes = cn(base, variants[variant], sizes[size], !arrow && "pr-5", className);
  const content = (
    <>
      <span>{children}</span>
      {arrow ? <Arrow variant={variant} size={size} /> : null}
    </>
  );

  if (/^(https?:)?\/\/|^mailto:|^tel:/.test(href)) {
    const external = href.startsWith("http");
    return (
      <a
        href={href}
        className={classes}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {content}
    </Link>
  );
}

export function Button({
  variant = "blush",
  size = "md",
  arrow = true,
  className,
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], !arrow && "pr-5", className)}
      {...rest}
    >
      <span>{children}</span>
      {arrow ? <Arrow variant={variant} size={size} /> : null}
    </button>
  );
}
