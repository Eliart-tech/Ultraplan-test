import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — ${site.tagline}`,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    display: "standalone",
    background_color: "#06060a",
    theme_color: "#06060a",
    lang: "fr",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
  };
}
