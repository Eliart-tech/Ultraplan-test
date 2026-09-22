import { cn } from "@/lib/cn";
import { Container } from "./container";

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

/** Small blush dot followed by the section label. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[0.9rem] text-ink-800",
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-blush-400" />
      {children}
    </span>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  subtitle,
  align = "center",
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
        "flex flex-col gap-5",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        id={id ? `${id}-title` : undefined}
        className="max-w-3xl text-[2rem] leading-[1.14] sm:text-[2.6rem] md:text-[3rem]"
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          className={cn(
            "max-w-2xl text-base leading-relaxed text-ink-400",
            align === "center" && "mx-auto",
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
