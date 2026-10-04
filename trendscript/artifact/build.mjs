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
 * the build fails instead of shipping an unpatched component. Several patches
 * may target one file; `EDITION_UI_IMPORT` is added to every patched file so
 * a replacement can render the edition's own wording (artifact/src/edition-ui.tsx).
 */
const EDITION_UI = "@edition/ui";
const EDITION_UI_IMPORT = `import * as EditionUi from "${EDITION_UI}";\n`;

function patchSources(patches) {
  const byFile = new Map();
  for (const patch of patches) {
    const list = byFile.get(patch.file) ?? [];
    list.push(patch);
    byFile.set(patch.file, list);
  }
  return {
    name: "patch-sources",
    setup(b) {
      for (const [file, list] of byFile) {
        b.onLoad({ filter: new RegExp(`${escapeRegExp(file)}$`) }, (args) => {
          let source = readFileSync(args.path, "utf8");
          for (const patch of list) {
            const count = source.split(patch.find).length - 1;
            if (count !== 1) {
              return {
                errors: [{ text: `Patch « ${patch.why} » : texte ${count ? "présent plusieurs fois" : "introuvable"} dans ${file}.` }],
              };
            }
            source = source.replace(patch.find, () => patch.replace);
          }
          // After the "use client" directive, if any.
          const directive = source.match(/^\s*["']use client["'];?\s*\n/);
          const at = directive ? directive[0].length : 0;
          source = `${source.slice(0, at)}${EDITION_UI_IMPORT}${source.slice(at)}`;
          return { contents: source, loader: "tsx", resolveDir: path.dirname(args.path) };
        });
      }
    },
  };
}

/**
 * Whole components swapped for edition versions, whether imported through
 * `@/…` or relatively (`./claude-card` from sources-panel.tsx).
 */
function replaceFiles(map) {
  const targets = new Map(Object.entries(map).map(([from, to]) => [path.join(srcDir, from), to]));
  return {
    name: "replace-files",
    setup(b) {
      b.onResolve({ filter: /^\.{1,2}\// }, (args) => {
        if (!args.importer.startsWith(srcDir)) return undefined;
        const base = path.resolve(args.resolveDir, args.path);
        for (const ext of ["", ".tsx", ".ts"]) {
          const hit = targets.get(base + ext);
          if (hit) return { path: hit };
        }
        return undefined;
      });
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
  // Chromium and Firefox ignore -webkit-backdrop-filter: the sticky bars need the standard property.
  const glass = css.match(/\.glass\{[^}]*\}/)?.[0] ?? "";
  if (!/(^|[{;])backdrop-filter:/.test(glass)) throw new Error(`CSS : .glass sans backdrop-filter standard (${glass || "règle absente"})`);
  return css;
}

// ---------------------------------------------------------------------------
// JS bundle
// ---------------------------------------------------------------------------

const file = (...parts) => path.join("src", ...parts);

/**
 * Wording of the reused components that only makes sense for the server
 * version (ANTHROPIC_API_KEY, restart, APP_PASSWORD, "lu sur le serveur"),
 * replaced by what applies in this edition (`EditionUi.*`, edition-ui.tsx).
 */
const EDITION_PATCHES = [
  // Header
  {
    file: file("components", "layout", "app-header.tsx"),
    find: 'process.env.NODE_ENV === "production"',
    replace: "false /* édition HTML : rien à protéger, pas de serveur */",
    why: "pas d'avertissement « accès non protégé » (APP_PASSWORD) sans serveur",
  },
  {
    file: file("components", "layout", "app-header.tsx"),
    find: '"Mode sans IA : ANTHROPIC_API_KEY non définie"',
    replace: "EditionUi.noAiDescription()",
    why: "pastille : pourquoi Claude manque ici",
  },
  {
    file: file("components", "layout", "app-header.tsx"),
    find: '{ai ? "IA active" : "Mode sans IA"}',
    replace: '{ai ? "IA active" : EditionUi.noAiPillLabel()}',
    why: "pastille : « Vérification… » tant que use() n'a pas répondu",
  },
  // Studio
  {
    file: file("components", "studio", "studio.tsx"),
    find: "const meta = STEP_META[step];",
    replace: "const meta = EditionUi.stepMeta(STEP_META[step], step, draft.analysis);",
    why: "Sujets : « qui montaient le … » quand tout vient d'un vieil instantané",
  },
  {
    file: file("components", "studio", "radar-step.tsx"),
    find: 'Mode sans IA : sujets regroupés automatiquement, sans angles.{" "}',
    replace: '<EditionUi.RadarNoAiText />{" "}',
    why: "barre du Radar : vérification en cours / mode sans IA",
  },
  {
    file: file("components", "studio", "topics-step.tsx"),
    find: '"Les sujets sont regroupés automatiquement à partir des données réelles, sans angles proposés. Ajoutez ANTHROPIC_API_KEY (voir Réglages) pour que Claude regroupe les signaux, évalue la pertinence pour votre niche et propose des angles."',
    replace: "<EditionUi.BasicModeText />",
    why: "Sujets : pas d'ANTHROPIC_API_KEY à ajouter ici",
  },
  {
    file: file("components", "studio", "topics-step.tsx"),
    find: 'onEdit={() => dispatch({ type: "goTo", step: "radar" })}\n      />\n',
    replace: 'onEdit={() => dispatch({ type: "goTo", step: "radar" })}\n      />\n\n      <EditionUi.SnapshotNotice analysis={analysis} now={now} />\n',
    why: "Sujets : date et âge de l'instantané, jamais masquables",
  },
  {
    file: file("components", "studio", "topics-step.tsx"),
    find: '{formatNumber(totalSignals)} {pluralize(totalSignals, "signal", "signaux")} · {used} source{used > 1 ? "s" : ""}\n            </Badge>\n',
    replace:
      '{formatNumber(totalSignals)} {pluralize(totalSignals, "signal", "signaux")} · {used} source{used > 1 ? "s" : ""}\n            </Badge>\n            <EditionUi.SnapshotBadge analysis={analysis} />\n',
    why: "Sujets : pastille « Instantané du … »",
  },
  {
    file: file("components", "studio", "topic-card.tsx"),
    find: "const lifespan = LIFESPAN_META[topic.lifespan] ?? LIFESPAN_META.court;",
    replace: "const lifespan = EditionUi.lifespanMeta(LIFESPAN_META[topic.lifespan] ?? LIFESPAN_META.court, topic);",
    why: "timing d'un sujet daté par l'instantané",
  },
  {
    file: file("components", "studio", "angle-step.tsx"),
    find: 'Claude propose trois angles par sujet (pédagogique, analyse, debunk…) quand{" "}\n              <code className="rounded bg-surface px-1 font-mono text-xs">ANTHROPIC_API_KEY</code> est configurée —{" "}\n',
    replace:
      'Claude propose trois angles par sujet (pédagogique, analyse, debunk…), mais il n&apos;est pas disponible ici (\n              <EditionUi.ClaudeProblem />) —{" "}\n',
    why: "Angle : pas d'ANTHROPIC_API_KEY à configurer ici",
  },
  {
    file: file("components", "studio", "script-settings.tsx"),
    find: 'Ajoutez <code className="rounded bg-surface px-1 font-mono text-xs">ANTHROPIC_API_KEY</code> dans les\n            variables d&apos;environnement, puis redémarrez l&apos;application.{" "}\n',
    replace: '<EditionUi.ScriptUnavailableText />{" "}\n',
    why: "Script : pas de clé ni de redémarrage ici",
  },
  {
    file: file("components", "studio", "script-settings.tsx"),
    find: '{settings.research ? "Recherche web + écriture : 1 à 3 min" : "Écriture : 30 s à 1 min 30"}\n          {settings.review ? ", relecture critique comprise (+30 s à 1 min)." : "."}',
    replace: "<EditionUi.ScriptTimingHint research={settings.research} review={settings.review} />",
    why: "Script : crédits Firecrawl d'une génération",
  },
  // Historique
  {
    file: file("components", "history", "history-view.tsx"),
    find: 'setAnnouncement("Export JSON de l\'historique téléchargé.");',
    replace: "/* édition HTML : le Toaster (role=status) annonce le vrai résultat */",
    why: "pas d'annonce « téléchargé » avant la réponse de claude.ai",
  },
  // Réglages
  {
    file: file("app", "reglages", "page.tsx"),
    find: "et ce qu'il advient de vos données.\"\n      />\n",
    replace: "et ce qu'il advient de vos données.\"\n      />\n      <EditionUi.SettingsNote />\n",
    why: "Réglages : ce qui s'applique ici, sous le titre",
  },
  {
    file: file("components", "settings", "sources-panel.tsx"),
    find: '<div className="grid gap-3 sm:grid-cols-3">\n          <Stat\n            icon={<Sparkles />}',
    replace: '<div className="grid gap-3 sm:grid-cols-2">\n          <Stat\n            icon={<Sparkles />}',
    why: "Réglages : deux tuiles (pas d'« Accès »)",
  },
  {
    file: file("components", "settings", "sources-panel.tsx"),
    find: '          <Stat\n            icon={<LockKeyhole />}\n            label="Accès"\n            value={status.auth.enabled ? "Protégé" : "Ouvert"}\n            tone={status.auth.enabled ? "success" : "warning"}\n            hint={status.auth.enabled ? "Mot de passe actif" : "Sans mot de passe"}\n          />\n',
    replace: "",
    why: "Réglages : pas de tuile « Accès » sans serveur",
  },
  {
    file: file("components", "settings", "sources-panel.tsx"),
    find: "Statut lu sur le serveur. Après avoir ajouté une clé et redémarré, actualisez.",
    replace: "Statut de cette page : Claude et Firecrawl via votre compte claude.ai, le reste depuis l'instantané inclus.",
    why: "Réglages : pas de serveur",
  },
  {
    file: file("components", "settings", "sources-panel.tsx"),
    find: "missingEnvTemplate(status)",
    replace: "missingEnvTemplate({ ...status, ai: { ...status.ai, configured: true }, auth: { enabled: true } })",
    why: "modèle .env.local : seulement les sources de la version serveur",
  },
  {
    file: file("components", "settings", "sources-panel.tsx"),
    find: "      <AuthCard enabled={status.auth.enabled} />\n",
    replace: "",
    why: "Réglages : pas de mot de passe sans serveur",
  },
  {
    file: file("components", "settings", "key-howto.tsx"),
    find: "            Comment ajouter une clé\n",
    replace: "            Comment ajouter une clé (version serveur)\n",
    why: "clés : version serveur uniquement",
  },
  {
    file: file("components", "settings", "key-howto.tsx"),
    find: "Les clés sont lues par le serveur au démarrage, jamais par le navigateur : elles ne se saisissent pas dans\n            cette page.",
    replace:
      "Les sources « à configurer » ne fonctionnent qu&apos;avec la version serveur de TrendScript : ses clés sont lues\n            par le serveur au démarrage. Rien à saisir dans cette page.",
    why: "clés : version serveur uniquement",
  },
];

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
    // ASCII output: non-ASCII characters (incl. U+FFFD in fast-xml-parser's regexes) become \u escapes.
    charset: "ascii",
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
        [EDITION_UI]: path.join(editionDir, "edition-ui.tsx"),
      }),
      srcAlias({
        "@/lib/client/export": path.join(editionDir, "export-shim.ts"),
        "@/components/settings/privacy-section": path.join(editionDir, "settings", "privacy-section.tsx"),
      }),
      replaceFiles({
        "components/settings/claude-card.tsx": path.join(editionDir, "settings", "claude-card.tsx"),
      }),
      patchSources(EDITION_PATCHES),
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
