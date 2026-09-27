// Exporte la bannière LinkedIn en PNG.
//
//   node brand/linkedin/render.mjs
//
// Nécessite Playwright (`npm i -D playwright` puis `npx playwright install chromium`).
// Produit, à côté de ce fichier :
//   banniere-linkedin.png            1584 × 396  — format LinkedIn officiel
//   banniere-linkedin@2x.png         3168 × 792  — même visuel, plus net sur écran Retina
//   banniere-linkedin-clair.png      variante claire, 1584 × 396
//   banniere-linkedin-clair@2x.png   variante claire, 3168 × 792
//   apercu-profil.png                simulation des deux variantes sur un profil
//   variantes/*.png                  autres accroches (1584 × 396 et @2x)

import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const banner = pathToFileURL(path.join(dir, "banniere.html")).href;
const preview = pathToFileURL(path.join(dir, "apercu.html")).href;

const browser = await chromium.launch();

async function shoot(url, selector, file, scale, viewport = { width: 1584, height: 396 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
  const tab = await context.newPage();
  await tab.goto(url, { waitUntil: "load" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.locator(selector).screenshot({ path: path.join(dir, file) });
  await context.close();
  console.log(`✓ ${file}`);
}

await shoot(banner, "#banner", "banniere-linkedin.png", 1);
await shoot(banner, "#banner", "banniere-linkedin@2x.png", 2);
await shoot(`${banner}?theme=clair`, "#banner", "banniere-linkedin-clair.png", 1);
await shoot(`${banner}?theme=clair`, "#banner", "banniere-linkedin-clair@2x.png", 2);
for (const name of ["variante-1-equipe-ia", "variante-2-avant-apres", "variante-3-fondateur"]) {
  const url = pathToFileURL(path.join(dir, "variantes", `${name}.html`)).href;
  await shoot(url, "#banner", `variantes/${name}.png`, 1);
  await shoot(url, "#banner", `variantes/${name}@2x.png`, 2);
}
// L'aperçu lit les PNG ci-dessus : il doit être rendu en dernier.
await shoot(preview, "#apercu", "apercu-profil.png", 2, { width: 1760, height: 480 });

await browser.close();
