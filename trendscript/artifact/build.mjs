#!/usr/bin/env node
/**
 * Build of the TrendScript HTML edition.
 *
 *   node artifact/build.mjs --snapshot   capture artifact/snapshot.json (real data, in Node)
 *   node artifact/build.mjs              build artifact/dist/trendscript.html
 *
 * The page reuses the app's React UI unchanged: esbuild bundles
 * artifact/src/main.tsx (in-page "server", Next shims, claude.ai
 * capabilities), Tailwind v4 compiles src/app/globals.css with the same
 * content sources, and everything — script, styles, snapshot — is inlined in
 * one file that follows the claude.ai Artifact page contract (no
 * doctype/html/head/body tags, <title> first, fonts from Google Fonts only).
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(artifactDir, "..");
const srcDir = path.join(rootDir, "src");
const editionDir = path.join(artifactDir, "src");
const snapshotPath = path.join(artifactDir, "snapshot.json");
const distFile = path.join(artifactDir, "dist", "trendscript.html");
const tsconfig = path.join(artifactDir, "tsconfig.json");

const MAX_BYTES = 6 * 1024 * 1024;
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// ---------------------------------------------------------------------------
// esbuild plugins
// ---------------------------------------------------------------------------

/** `@/…` → src/… (tsconfig paths), with per-specifier overrides for edition modules. */
function srcAlias(overrides = {}) {
  return {
    name: "src-alias",
    setup(b) {
      b.onResolve({ filter: /^@\// }, async (args) => {
        const override = overrides[args.path];
        if (override) return { path: override };
        const result = await b.resolve(`./${args.path.slice(2)}`, { resolveDir: srcDir, kind: args.kind });
        return result.errors.length ? { errors: result.errors } : { path: result.path };
      });
    },
  };
}

/** Exact import specifiers replaced by edition modules (Next shims, SDK stub). */
function replaceModules(map) {
  const filter = new RegExp(`^(${Object.keys(map).map(escapeRegExp).join("|")})$`);
  return {
    name: "replace-modules",
    setup(b) {
      b.onResolve({ filter }, (args) => ({ path: map[args.path] }));
    },
  };
}

/** Fails the browser build if anything pulls in a Node built-in. */
const noNodeBuiltins = {
  name: "no-node-builtins",
  setup(b) {
    b.onResolve(
      { filter: /^(node:.*|fs|path|os|child_process|crypto|net|tls|http|https|zlib|stream|url|util|buffer|events|worker_threads)$/ },
      (args) => ({
        errors: [{ text: `Module Node « ${args.path} » importé par ${path.relative(rootDir, args.importer)} : interdit dans l'édition HTML.` }],
      }),
    );
  },
};

/**
 * Build-time patches of reused files, each asserted: if the source changes,
 * the build fails instead of shipping an unpatched component.
 */
function patchSources(patches) {
  return {
    name: "patch-sources",
    setup(b) {
      for (const patch of patches) {
        b.onLoad({ filter: new RegExp(`${escapeRegExp(patch.file)}$`) }, (args) => {
          const source = readFileSync(args.path, "utf8");
          if (!source.includes(patch.find)) {
            return { errors: [{ text: `Patch « ${patch.why} » : texte introuvable dans ${patch.file}.` }] };
          }
          return { contents: source.replace(patch.find, patch.replace), loader: "tsx", resolveDir: path.dirname(args.path) };
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Snapshot capture (Node)
// ---------------------------------------------------------------------------

async function captureSnapshot() {
  const tmp = mkdtempSync(path.join(tmpdir(), "trendscript-snapshot-"));
  const outfile = path.join(tmp, "capture-snapshot.mjs");
  try {
    await build({
      entryPoints: [path.join(artifactDir, "capture-snapshot.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      outfile,
      tsconfig,
      plugins: [srcAlias()],
      logLevel: "warning",
    });
    // Node's fetch only honours HTTPS_PROXY with NODE_USE_ENV_PROXY (Node ≥ 22.21).
    const proxied = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
    const run = spawnSync(process.execPath, [outfile, snapshotPath], {
      stdio: "inherit",
      env: { ...process.env, ...(proxied ? { NODE_USE_ENV_PROXY: "1", NODE_NO_WARNINGS: "1" } : {}) },
    });
    if (run.status !== 0) throw new Error(`capture échouée (code ${run.status})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// CSS: the app's Tailwind v4 stylesheet + explicit theme switch
// ---------------------------------------------------------------------------

/** Index of the "}" closing the block whose "{" is at `open`. */
function closingBrace(css, open) {
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    if (css[index] === "{") depth++;
    else if (css[index] === "}" && --depth === 0) return index;
  }
  throw new Error("CSS : accolade fermante introuvable");
}

/**
 * globals.css with:
 * - the same content sources, made explicit (src/ + the edition's own files);
 * - the dark tokens applied by `prefers-color-scheme` unless the viewer
 *   forces `data-theme="light"`, and by `:root[data-theme="dark"]`;
 * - Inter from Google Fonts in place of next/font's `--font-inter`.
 */
function editionCss() {
  let css = readFileSync(path.join(srcDir, "app", "globals.css"), "utf8");
  const importLine = '@import "tailwindcss";';
  if (!css.includes(importLine)) throw new Error("globals.css : @import \"tailwindcss\" introuvable");
  css = css.replace(importLine, '@import "tailwindcss" source(none);\n@source "../src";\n@source "./src";');
  // The app excludes the edition from its own sources; here the sources are explicit.
  css = css.replace(/^@source not "[^"]*artifact";\n/m, "");

  const media = "@media (prefers-color-scheme: dark) {";
  const mediaStart = css.indexOf(media);
  if (mediaStart === -1) throw new Error("globals.css : bloc sombre introuvable");
  const mediaEnd = closingBrace(css, mediaStart + media.length - 1);
  const inner = css.slice(mediaStart + media.length, mediaEnd);
  const rootOpen = inner.indexOf(":root {");
  if (rootOpen === -1) throw new Error("globals.css : :root du bloc sombre introuvable");
  const bodyStart = rootOpen + ":root {".length;
  const bodyEnd = closingBrace(inner, bodyStart - 1);
  const darkTokens = inner.slice(bodyStart, bodyEnd);
  const themed = `@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${darkTokens}}
}

:root[data-theme="dark"] {${darkTokens}}`;
  css = css.slice(0, mediaStart) + themed + css.slice(mediaEnd + 1);

  return `${css}

/* ---------------------------------------------------------------------------
   HTML edition
--------------------------------------------------------------------------- */
:root {
  --font-inter: "Inter";
}
:root[data-theme="light"] {
  color-scheme: light;
}
:root[data-theme="dark"] {
  color-scheme: dark;
}
#root {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  flex-direction: column;
}
`;
}

async function compileCss() {
  const from = path.join(artifactDir, "edition.css");
  const result = await postcss([tailwind({ base: artifactDir, optimize: { minify: true } })]).process(editionCss(), { from });
  const css = result.css;
  if (/url\(\s*["']?\/_next\//.test(css)) throw new Error("CSS : référence /_next/ restante");
  return css;
}

// ---------------------------------------------------------------------------
// JS bundle
// ---------------------------------------------------------------------------

async function bundleJs() {
  const result = await build({
    entryPoints: [path.join(editionDir, "main.tsx")],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    target: ["es2022", "chrome111", "safari16.4", "firefox115"],
    minify: true,
    legalComments: "none",
    jsx: "automatic",
    tsconfig,
    charset: "utf8",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": "{}",
    },
    plugins: [
      noNodeBuiltins,
      replaceModules({
        "next/link": path.join(editionDir, "next-link.tsx"),
        "next/navigation": path.join(editionDir, "next-navigation.ts"),
        "@anthropic-ai/sdk": path.join(editionDir, "anthropic-stub.ts"),
      }),
      srcAlias({ "@/lib/client/export": path.join(editionDir, "export-shim.ts") }),
      patchSources([
        {
          file: path.join("src", "components", "layout", "app-header.tsx"),
          find: 'process.env.NODE_ENV === "production"',
          replace: "false /* édition HTML : rien à protéger, pas de serveur */",
          why: "pas d'avertissement « accès non protégé » (APP_PASSWORD) sans serveur",
        },
      ]),
    ],
    logLevel: "warning",
    metafile: true,
  });
  const inputs = Object.keys(result.metafile.inputs);
  const leaked = inputs.filter((file) => /(^|\/)node_modules\/(next|@anthropic-ai)\//.test(file));
  if (leaked.length) throw new Error(`modules serveur dans le bundle : ${leaked.slice(0, 5).join(", ")}`);
  return result.outputFiles[0].text;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/**
 * Inline <script> content: no "</script", "<!--" or document-tag sequences
 * (the page contract forbids <!DOCTYPE>/<html>/<head>/<body>). "</script",
 * "<!--" and "<!DOCTYPE" only occur inside string and regex literals
 * (fast-xml-parser's safety patterns), where "\/" and "\!" are plain
 * escapes; the result is re-parsed, and any tag left fails the build.
 */
function scriptSafe(code) {
  const safe = code
    .replace(/<\/(script)/gi, "<\\/$1")
    .replace(/<!--/g, "<\\!--")
    .replace(/<!(doctype)/gi, "<\\!$1");
  new vm.Script(safe); // throws on a syntax error
  for (const pattern of [/<\/script/i, /<!doctype/i, /<\/?(html|head|body)\b/i]) {
    if (pattern.test(safe)) throw new Error(`bundle : séquence interdite ${pattern}`);
  }
  return safe;
}

function jsonScriptSafe(json) {
  // Read with JSON.parse (never executed): only "<" needs escaping.
  return json.replace(/</g, "\\u003c");
}

async function buildHtml() {
  let snapshotText;
  try {
    snapshotText = readFileSync(snapshotPath, "utf8");
  } catch {
    throw new Error("artifact/snapshot.json manquant : lancez d'abord npm run artifact:snapshot");
  }
  const snapshot = JSON.parse(snapshotText);
  const [css, js] = await Promise.all([compileCss(), bundleJs()]);

  const html = `<title>TrendScript</title>
<meta name="description" content="TrendScript — des tendances réelles (Google Trends, Google Actualités, Wikipédia, YouTube) au script de vidéo courte prêt à tourner. Édition HTML.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_HREF}">
<style>${css}</style>
<div id="root"><p style="margin:auto;padding:4rem 1rem;font:500 0.9375rem/1.5 Inter,system-ui,sans-serif;color:var(--ts-muted);text-align:center">Chargement de TrendScript…</p></div>
<noscript><p style="padding:1rem;text-align:center">TrendScript a besoin de JavaScript.</p></noscript>
<script type="application/json" id="ts-snapshot">${jsonScriptSafe(JSON.stringify(snapshot))}</script>
<script>${scriptSafe(js)}</script>
`;
  mkdirSync(path.dirname(distFile), { recursive: true });
  writeFileSync(distFile, html);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const mode = process.argv.includes("--snapshot") ? "snapshot" : "build";

try {
  if (mode === "snapshot") {
    await captureSnapshot();
  } else {
    await buildHtml();
    const size = statSync(distFile).size;
    console.log(`[artifact] ${path.relative(rootDir, distFile)} : ${size.toLocaleString("fr-FR")} octets`);
    if (size > MAX_BYTES) throw new Error(`fichier trop lourd (${size} octets > ${MAX_BYTES})`);
  }
} catch (error) {
  console.error(`[artifact] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
