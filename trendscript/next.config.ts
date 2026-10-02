import path from "node:path";
import type { NextConfig } from "next";

/**
 * This app lives in a sub-folder of another project that has its own
 * package-lock.json: pin the root so Next doesn't pick the parent folder
 * (multiple-lockfiles warning, wider file watching and tracing).
 * `__dirname` exists when Next transpiles this file to CommonJS (default);
 * the cwd fallback covers Node's native ESM TypeScript loader.
 */
const projectRoot = path.resolve(typeof __dirname === "string" ? __dirname : process.cwd());

/**
 * Baseline security headers. The CSP only sets directives that cannot break
 * the UI (framing, <base>, plugins, form targets): trend thumbnails come from
 * many CDNs and Next injects inline scripts, so a strict script/img policy
 * would need a nonce-based setup in proxy.ts.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  // `next dev` would otherwise (re)write AGENTS.md / CLAUDE.md in this folder.
  agentRules: false,
  turbopack: { root: projectRoot },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
