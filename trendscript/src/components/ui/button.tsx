import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover " +
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.18),var(--ts-shadow-xs)]",
  secondary:
    "border border-line bg-surface text-ink shadow-xs hover:border-line-strong hover:bg-surface-2",
  soft: "bg-accent-soft text-accent-ink hover:bg-accent/20",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-danger-fg shadow-xs hover:bg-danger-hover",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-3 text-[0.8125rem]",
  md: "h-10 rounded-xl px-4 text-sm",
  lg: "h-12 rounded-xl px-5 text-[0.9375rem]",
};

const iconOnlySizes: Record<ButtonSize, string> = {
  sm: "size-8 rounded-lg",
  md: "size-10 rounded-xl",
  lg: "size-12 rounded-xl",
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width. */
  fullWidth?: boolean;
  /** Square button holding a single icon (pair with an aria-label). */
  iconOnly?: boolean;
}

/** Class string of a button, for elements that can't use <Button>/<ButtonLink>. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  iconOnly = false,
}: ButtonStyleOptions = {}): string {
  return cn(base, variants[variant], iconOnly ? iconOnlySizes[size] : sizes[size], fullWidth && "w-full");
}

interface ButtonContentProps {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  size: ButtonSize;
  children?: ReactNode;
}

function ButtonContent({ leftIcon, rightIcon, loading, size, children }: ButtonContentProps) {
  return (
    <>
      {loading ? <Spinner size={size === "lg" ? "md" : "sm"} /> : leftIcon}
      {children}
      {rightIcon}
    </>
  );
}

export interface ButtonProps extends ComponentProps<"button">, ButtonStyleOptions {
  /** Icon before the label (lucide icon, e.g. `<Sparkles className="size-4" />`). */
  leftIcon?: ReactNode;
  /** Icon after the label. */
  rightIcon?: ReactNode;
  /**
   * Shows a spinner in place of `leftIcon`, disables the button and sets
   * `aria-busy`. Pair with `loadingText` to change the label meanwhile.
   */
  loading?: boolean;
  /** Label while `loading` (e.g. "Analyse en cours…"). */
  loadingText?: ReactNode;
}

/**
 * Action button. Defaults to `type="button"` so it never submits a form by
 * accident — pass `type="submit"` explicitly in forms.
 *
 * @example
 * <Button leftIcon={<Sparkles className="size-4" />} loading={busy} loadingText="Génération…">
 *   Générer le script
 * </Button>
 */
export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  iconOnly,
  leftIcon,
  rightIcon,
  loading = false,
  loadingText,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, fullWidth, iconOnly }), className)}
      {...rest}
    >
      <ButtonContent leftIcon={leftIcon} rightIcon={rightIcon} loading={loading} size={size}>
        {loading && loadingText ? loadingText : children}
      </ButtonContent>
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "iconOnly" | "leftIcon" | "rightIcon" | "loadingText"> {
  /** Accessible name — required because the button has no visible text. */
  label: string;
  /** The icon (lucide), sized by the caller or defaulting to the button's font size. */
  icon: ReactNode;
}

/** Square button with a single icon and a mandatory accessible label. */
export function IconButton({ label, icon, variant = "ghost", size = "md", loading, ...rest }: IconButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      iconOnly
      aria-label={label}
      title={rest.title ?? label}
      loading={loading}
      {...rest}
    >
      {loading ? null : icon}
    </Button>
  );
}

const EXTERNAL_HREF = /^(https?:)?\/\/|^mailto:|^tel:/;

export interface ButtonLinkProps
  extends Omit<ComponentProps<typeof Link>, "href" | "className" | "children">,
    ButtonStyleOptions {
  href: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * A link styled as a button. Internal paths use next/link; absolute URLs
 * open in a new tab with `rel="noopener noreferrer"`.
 */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  fullWidth,
  iconOnly,
  leftIcon,
  rightIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = cn(buttonClasses({ variant, size, fullWidth, iconOnly }), className);
  const content = (
    <ButtonContent leftIcon={leftIcon} rightIcon={rightIcon} size={size}>
      {children}
    </ButtonContent>
  );

  if (EXTERNAL_HREF.test(href)) {
    const external = /^(https?:)?\/\//.test(href);
    return (
      <a
        href={href}
        className={classes}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        aria-label={rest["aria-label"]}
        title={rest.title}
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
