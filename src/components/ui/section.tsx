import { cn } from "@/lib/cn";
import { Container } from "./container";

/** A page section with consistent vertical rhythm and an anchorable id. */
export function Section({
  id,
  className,
  containerClassName,
  children,
}: {
  id?: string;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("relative py-20 sm:py-28", className)}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-brand-300">
      <span aria-hidden className="h-px w-6 bg-brand-400/70" />
      {children}
    </span>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  subtitle,
  align = "left",
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        id={id ? `${id}-title` : undefined}
        className="max-w-3xl text-3xl font-semibold leading-[1.12] sm:text-4xl md:text-[2.75rem]"
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          className={cn(
            "max-w-2xl text-base leading-relaxed text-mist-400 sm:text-lg",
            align === "center" && "mx-auto",
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
