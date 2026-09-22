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
    <article className="pt-36 pb-24 sm:pt-44">
      <Container className="max-w-3xl">
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-sm text-mist-500">
          Dernière mise à jour : {updatedAt}
        </p>

        <div
          className="mt-12 flex flex-col gap-8 text-sm leading-relaxed text-mist-300
            [&_a]:text-brand-300 [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-brand-200
            [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white
            [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white
            [&_li]:marker:text-brand-400
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
