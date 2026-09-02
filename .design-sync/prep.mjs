/**
 * design-sync prep: stabilize the compiled stylesheet path.
 *
 * Vite emits the app's compiled Tailwind CSS as dist/assets/index-<hash>.css,
 * and the hash changes on every build - but cfg.cssEntry has to be one fixed
 * path. This copies the newest compiled stylesheet to a stable location so the
 * converter always finds it.
 *
 * Run via cfg.buildCmd (npm run build && node .design-sync/prep.mjs).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "dist", "assets");
const outDir = join(here, ".cache");
const out = join(outDir, "ds-styles.css");

if (!existsSync(assets)) {
  console.error(`[prep] ${assets} missing - run the app build first (npm run build)`);
  process.exit(1);
}

const newest = readdirSync(assets)
  .filter((f) => f.endsWith(".css"))
  .map((f) => join(assets, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];

if (!newest) {
  console.error(`[prep] no .css in ${assets} - did the build emit styles?`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(newest, out);
console.error(`[prep] cssEntry <- ${newest} (${statSync(out).size}B)`);
