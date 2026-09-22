import { Clients } from "@/components/sections/clients";
import { Faq } from "@/components/sections/faq";
import { FinalCta } from "@/components/sections/final-cta";
import { Hero } from "@/components/sections/hero";
import { Method } from "@/components/sections/method";
import { Pricing } from "@/components/sections/pricing";
import { Problem } from "@/components/sections/problem";
import { Results } from "@/components/sections/results";
import { Services } from "@/components/sections/services";
import { Testimonials } from "@/components/sections/testimonials";
import { UseCases } from "@/components/sections/use-cases";
import { faqJsonLd } from "@/lib/json-ld";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Clients />
      <Problem />
      <Services />
      <Method />
      <UseCases />
      <Results />
      <Testimonials />
      <Pricing />
      <Faq />
      <FinalCta />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />
    </>
  );
}
