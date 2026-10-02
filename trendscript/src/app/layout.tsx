import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppHeader } from "@/components/layout/app-header";
import { Container } from "@/components/ui/container";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TrendScript — des tendances réelles au script vidéo",
    template: "%s · TrendScript",
  },
  description:
    "Repérez les sujets qui montent sur Google, YouTube, Instagram, TikTok, Wikipédia et dans l'actualité, choisissez un angle et obtenez un script de vidéo courte prêt à tourner.",
  applicationName: "TrendScript",
  // Private creator tool: keep it out of search engines.
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c12" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#contenu"
          className="sr-only z-[60] rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-pop focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Aller au contenu principal
        </a>
        <AppHeader />
        <main id="contenu" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <footer className="mt-16 border-t border-line">
          <Container className="flex flex-col gap-1 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
            <p>TrendScript · tendances réelles, scripts prêts à tourner.</p>
            <p>Votre profil et votre historique restent dans ce navigateur.</p>
          </Container>
        </footer>
      </body>
    </html>
  );
}
