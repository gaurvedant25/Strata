// Verifies that every Tailwind class used in the authored previews actually
// exists in the shipped stylesheet. The stylesheet is the app's own compiled
// Tailwind output, so a class no app file uses is simply not there.
import { readFileSync, readdirSync } from "node:fs";

const css = readFileSync("ds-bundle/_ds_bundle.css", "utf8");

function has(cls) {
  // Tailwind escapes special chars in selectors: .text-\[15px\], .bg-ink\/95
  let sel = "";
  for (const ch of cls) sel += /[a-zA-Z0-9_-]/.test(ch) ? ch : "\\" + ch;
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, (m) => "\\" + m);
  // minified CSS may follow the class with a combinator, not just {/,/space
  return new RegExp("\\." + esc + "[,{\\s:>~+\\[]").test(css);
}

const missing = new Map();
for (const f of readdirSync(".design-sync/previews")) {
  const src = readFileSync(`.design-sync/previews/${f}`, "utf8");
  for (const m of src.matchAll(/className="([^"]+)"/g)) {
    for (const c of m[1].split(/\s+/).filter(Boolean)) {
      if (!has(c)) missing.set(c, (missing.get(c) ?? new Set()).add(f));
    }
  }
}

if (!missing.size) console.log("all preview classes resolve against the shipped CSS");
for (const [c, fs] of [...missing].sort()) {
  console.log(`MISSING  .${c}  <- ${[...fs].join(", ")}`);
}
