import { Container } from "./container";

/** Shared shell for the long-form legal pages. */
export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <article className="wash-sky pt-36 pb-24 sm:pt-44">
      <Container className="max-w-3xl">
        <h1 className="text-[2.4rem] leading-tight sm:text-[3.2rem]">
          {title}
        </h1>
        <p className="mt-4 text-sm text-ink-400">
          Dernière mise à jour : {updatedAt}
        </p>

        <div
          className="mt-12 flex flex-col gap-8 text-sm leading-relaxed text-ink-500
            [&_a]:text-ink-800 [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-sky-600
            [&_h2]:text-xl [&_h2]:text-ink-800
            [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-ink-800
            [&_li]:marker:text-blush-400
            [&_p+p]:mt-3
            [&_section]:flex [&_section]:flex-col [&_section]:gap-3
            [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5"
        >
          {children}
        </div>
      </Container>
    </article>
  );
}
