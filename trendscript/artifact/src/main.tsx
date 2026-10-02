/**
 * Entry of the TrendScript HTML edition: the app's real React UI (header,
 * Studio, Historique, Réglages) on top of an in-page "server", rendered in
 * place of Next's root layout. Routes are hash routes (#studio,
 * #historique, #reglages).
 */

import { Component, Suspense, useEffect, useRef, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import ErrorPage from "@/app/error";
import HistoryPage from "@/app/historique/page";
import NotFound from "@/app/not-found";
import StudioPage from "@/app/page";
import SettingsPage from "@/app/reglages/page";
import { AppHeader } from "@/components/layout/app-header";
import { Container } from "@/components/ui/container";
import { useServerStatus } from "@/lib/client/use-server-status";
import { useEditionState } from "./capabilities";
import { EditionBanner, Toaster } from "./edition-banner";
import { getSnapshot } from "./edition";
import { installFakeServer } from "./fake-server";
import { usePathname } from "./next-navigation";
import { installPolyfills } from "./polyfills";
import { installRouter, isRouteHash, navigate, scrollToAnchor } from "./router";

installPolyfills();
const snapshot = getSnapshot();
installFakeServer(snapshot);
installRouter();

const TITLES: Record<string, string> = {
  "/": "Studio · TrendScript",
  "/historique": "Historique · TrendScript",
  "/reglages": "Réglages · TrendScript",
};

/** Next's route error boundary (src/app/error.tsx), reused as is. */
class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void info;
    void error;
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const reset = () => this.setState({ error: null });
    return <ErrorPage error={error} retry={reset} reset={reset} />;
  }
}

function Page({ path }: { path: string }) {
  switch (path) {
    case "/":
      return <StudioPage />;
    case "/historique":
      return <HistoryPage />;
    case "/reglages":
      return <SettingsPage />;
    default:
      return <NotFound />;
  }
}

/** Re-reads the status (header pill, Réglages) when Claude / Firecrawl availability changes. */
function StatusRefresher() {
  const { claude, firecrawl } = useEditionState();
  const { reload } = useServerStatus();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reload();
  }, [claude, firecrawl, reload]);
  return null;
}

function App() {
  const path = usePathname();

  useEffect(() => {
    document.title = TITLES[path] ?? "Page introuvable · TrendScript";
  }, [path]);

  return (
    <>
      <a
        href="#contenu"
        className="sr-only z-[60] rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-pop focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Aller au contenu principal
      </a>
      <AppHeader />
      <EditionBanner capturedAt={snapshot.capturedAt} />
      <main id="contenu" tabIndex={-1} className="flex-1 outline-none">
        <RouteErrorBoundary key={path}>
          <Suspense fallback={null}>
            <Page path={path} />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <footer className="mt-16 border-t border-line">
        <Container className="flex flex-col gap-1 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>TrendScript · tendances réelles, scripts prêts à tourner.</p>
          <p>Votre profil et votre historique restent dans ce navigateur.</p>
        </Container>
      </footer>
      <Toaster />
      <StatusRefresher />
    </>
  );
}

/**
 * Plain anchors: in-page ones ("#profil", "#contenu") scroll without
 * replacing the route hash; internal paths ("/reglages") navigate in memory.
 */
function installAnchorHandling(): void {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self")) return;
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#") && href.length > 1 && !isRouteHash(href)) {
      event.preventDefault();
      scrollToAnchor(decodeURIComponent(href.slice(1)));
    } else if (href.startsWith("/") && !href.startsWith("//")) {
      event.preventDefault();
      navigate(href);
    }
  });
}

installAnchorHandling();
document.documentElement.lang = "fr";
const container = document.getElementById("root");
if (container) {
  container.replaceChildren();
  createRoot(container).render(<App />);
}
