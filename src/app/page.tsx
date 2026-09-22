import { About } from "@/components/sections/about";
import { Agents } from "@/components/sections/agents";
import { Clients } from "@/components/sections/clients";
import { Faq } from "@/components/sections/faq";
import { FinalCta } from "@/components/sections/final-cta";
import { Hero } from "@/components/sections/hero";
import { Process } from "@/components/sections/process";
import { Services } from "@/components/sections/services";
import { Statement } from "@/components/sections/statement";
import { Testimonials } from "@/components/sections/testimonials";
import { faqJsonLd } from "@/lib/json-ld";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Clients />
      <Services />
      <Statement />
      <Agents />
      <Testimonials />
      <Process />
      <About />
      <Faq />
      <FinalCta />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />
    </>
  );
}
