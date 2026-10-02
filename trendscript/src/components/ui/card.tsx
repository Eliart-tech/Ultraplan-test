import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardElement = "div" | "section" | "article" | "li" | "aside";

export interface CardProps extends ComponentProps<"div"> {
  /** Semantic element to render (default `div`). */
  as?: CardElement;
  /** Hover lift for clickable cards (the click target itself is up to you). */
  interactive?: boolean;
  /** Accent ring for the chosen card in a list (topic, angle…). */
  selected?: boolean;
  /** Raised look (shadow) — for popovers, sticky panels, hero blocks. */
  elevated?: boolean;
}

/**
 * Surface container: white / #13141C with a hairline border and 16 px radius.
 * Compose with CardHeader, CardBody, CardFooter — or put content directly
 * inside with your own padding.
 */
export function Card({
  as = "div",
  interactive = false,
  selected = false,
  elevated = false,
  className,
  ...rest
}: CardProps) {
  const Component = as as ElementType;
  return (
    <Component
      className={cn(
        "relative rounded-2xl border bg-surface",
        selected ? "border-accent ring-1 ring-accent" : "border-line",
        elevated ? "shadow-pop" : "shadow-card",
        interactive &&
          "transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop motion-reduce:hover:translate-y-0",
        className,
      )}
      {...rest}
    />
  );
}

export interface CardHeaderProps extends Omit<ComponentProps<"div">, "title"> {
  /** Card title (rendered in an h2 by default, see `titleAs`). */
  title?: ReactNode;
  /** Muted line under the title. */
  description?: ReactNode;
  /** Small icon tile shown left of the title. */
  icon?: ReactNode;
  /** Right-aligned actions (buttons, badges, popover). */
  actions?: ReactNode;
  titleAs?: "h2" | "h3" | "h4";
}

/**
 * Header row of a card. Pass `title`/`description`/`actions` for the standard
 * layout, or `children` for a custom one.
 */
export function CardHeader({
  title,
  description,
  icon,
  actions,
  titleAs = "h2",
  className,
  children,
  ...rest
}: CardHeaderProps) {
  const Title = titleAs;
  return (
    <div className={cn("flex items-start gap-3 px-5 pt-5 sm:px-6 sm:pt-6", className)} {...rest}>
      {icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink [&_svg]:size-[18px]">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? <Title className="text-base font-semibold leading-snug text-ink">{title}</Title> : null}
        {description ? <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Title text for custom headers (when not using CardHeader's `title`). */
export function CardTitle({
  as = "h2",
  className,
  ...rest
}: ComponentProps<"h2"> & { as?: "h2" | "h3" | "h4" }) {
  const Component = as;
  return <Component className={cn("text-base font-semibold leading-snug text-ink", className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: ComponentProps<"p">) {
  return <p className={cn("text-sm leading-relaxed text-muted", className)} {...rest} />;
}

/** Main padded area of a card. */
export function CardBody({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...rest} />;
}

/** Bottom bar with a hairline separator, for actions. */
export function CardFooter({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5 sm:px-6",
        className,
      )}
      {...rest}
    />
  );
}
