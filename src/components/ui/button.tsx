import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition duration-200 " +
  "disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-3";

const variants: Record<Variant, string> = {
  // brand-600 keeps white text at 6.1:1 — brand-500 only reached 4.35:1.
  primary:
    "bg-brand-600 text-white shadow-[0_10px_40px_-12px] shadow-brand-600/70 " +
    "hover:bg-brand-500 hover:shadow-brand-500/60 active:bg-brand-700",
  secondary:
    "border border-white/12 bg-white/[0.04] text-mist-50 backdrop-blur-sm " +
    "hover:border-white/25 hover:bg-white/[0.08]",
  ghost: "text-mist-200 hover:text-white",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-[0.95rem]",
};

function classes(variant: Variant, size: Size, className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  external,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
  external?: boolean;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  const isExternal = external ?? /^(https?:)?\/\//.test(href);

  if (isExternal) {
    return (
      <a
        href={href}
        className={classes(variant, size, className)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={classes(variant, size, className)} {...rest} />;
}
