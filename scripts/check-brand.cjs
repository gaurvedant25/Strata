/*
 * The app is called Strata, everywhere.
 *
 * It was Gym Log first, and a rename that leaves the old name in one corner is
 * worse than no rename: a share card that still signs itself "Gym Log", a
 * store build with the old id, a backup file named after an app that no longer
 * exists. This check holds the whole line, in three parts:
 *
 *   1. No file in the project says the old name in any spelling, apart from
 *      the few places that have to know it to move an install's data across.
 *   2. Every place a platform reads the app's name or id says Strata.
 *   3. Every share template, for every subject, in both sizes, with and
 *      without a photo, draws "Strata" and never the old name — read off the
 *      canvas calls themselves, since that is what ends up in the picture.
 *
 * Pure: no browser, no account, no stored data.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const ts = require("typescript");
const assert = require("node:assert/strict");

// `.tsx` too: the card's body figure takes its tones from the BodyMap
// component, so the real module is loaded rather than a stand-in.
require.extensions[".ts"] = require.extensions[".tsx"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
};

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/* ---- 1. The old name, anywhere ------------------------------------------ */

const OLD = /gym[\s_-]?log/i;
/**
 * The only places allowed to spell it: the code that moves an existing
 * install's data from the old names, and the live web address, which stays
 * where it is because each browser keeps an app's data per address.
 */
const ALLOWED = [
  { file: "src/lib/legacyStorage.ts" },
  { file: "src/lib/db.ts", line: /OLD_NAME = "gymlog"|OLD_FORMAT = "gymlog"/ },
  { file: "docs/store-listing.md", line: /gym-log-ebon\.vercel\.app/ },
  { file: "scripts/check-brand.cjs" },
];
const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|jar|jks|keystore|woff2?|ttf|otf|aab|apk|pdf|zip|pyc|bin|mp4|mov)$/i;

const files = execSync("git ls-files --cached --others --exclude-standard", {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => f && !BINARY.test(f) && fs.existsSync(path.join(ROOT, f)));

const found = [];
for (const file of files) {
  const rule = ALLOWED.find((a) => a.file === file);
  if (rule && !rule.line) continue;
  read(file)
    .split("\n")
    .forEach((text, i) => {
      if (!OLD.test(text)) return;
      if (rule?.line?.test(text)) return;
      found.push(`${file}:${i + 1}: ${text.trim().slice(0, 120)}`);
    });
}
assert.deepEqual(found, [], `The old name is still in:\n${found.join("\n")}`);

/* ---- 2. What each platform reads ---------------------------------------- */

const has = (file, re, what) => assert.match(read(file), re, `${file}: ${what}`);
has("index.html", /<title>Strata<\/title>/, "page title");
has("index.html", /apple-mobile-web-app-title" content="Strata"/, "iOS home-screen name");
has("vite.config.ts", /name: "Strata",\s*short_name: "Strata"/, "web app name");
has("capacitor.config.ts", /appId: "com\.vedant\.strata"/, "app id");
has("capacitor.config.ts", /appName: "Strata"/, "app name");
has("android/app/build.gradle", /applicationId "com\.vedant\.strata"/, "Android application id");
has("android/app/build.gradle", /namespace = "com\.vedant\.strata"/, "Android namespace");
has("android/app/src/main/res/values/strings.xml", /name="app_name">Strata</, "Android label");
has(
  "android/app/src/main/java/com/vedant/strata/MainActivity.java",
  /^package com\.vedant\.strata;/m,
  "Android activity package",
);
has("ios/App/App/Info.plist", /<string>Strata<\/string>/, "iOS display name");
assert.equal(
  (read("ios/App/App.xcodeproj/project.pbxproj").match(/PRODUCT_BUNDLE_IDENTIFIER = com\.vedant\.strata;/g) ?? []).length,
  2,
  "iOS bundle id, debug and release",
);
has("src/lib/billing.ts", /PACKAGE_NAME = "com\.vedant\.strata"/, "Play Billing package");
has("package.json", /"name": "strata"/, "package name");

/* ---- 3. Every share template draws the name ----------------------------- */

global.Path2D = class {
  addPath() {}
};
const { TEMPLATES } = require("../src/lib/card/templates.ts");
const { liftCard, bodyCard } = require("../src/lib/card/select.ts");
const { TIER_COLOR } = require("../src/lib/strength.ts");
const { ASPECTS } = require("../src/lib/card/draw.ts");

const score = (tier, best1rm, s) => ({
  tier,
  color: TIER_COLOR[tier],
  score: s,
  best1rm,
  added1rm: null,
  hold: null,
});
const data = {
  streak: {
    days: 12,
    best: 19,
    subject: "Legs · 5 exercises",
    dateLabel: "Thu, Sep 24",
    stats: [
      { label: "Sets", value: "16" },
      { label: "kg", value: "12,960" },
      { label: "Time", value: "1h 12m" },
    ],
    recent: Array.from({ length: 84 }, (_, i) => i % 3 === 0),
  },
  lift: liftCard({
    name: "Bench press",
    currentStreak: 6,
    metricId: "e1rm",
    metricLabel: "Estimated 1RM",
    unit: "kg",
    sinceLabel: "",
    stats: [],
    decimals: 1,
    values: [80, 100],
    history: [80, 100],
    dates: ["1 Sep 2026", "2 Sep 2026"],
  }),
  body: bodyCard(
    "male",
    "front",
    {
      chest: score("Titan", 133, 1),
      shoulders: score("Diamond", 100, 0.85),
      biceps: score("Platinum", 50, 0.7),
      lats: score("Gold", 90, 0.55),
      quadriceps: score("Silver", 140, 0.4),
    },
    "kg",
  ),
  workout: {
    name: "Push",
    dateLabel: "Thu, Sep 24",
    unit: "kg",
    volume: "8,420",
    volumeRecord: true,
    duration: "1h 04m",
    sets: 17,
    exerciseCount: 5,
    currentStreak: 12,
    records: [{ name: "Bench", metric: "Estimated 1RM", value: "116.7" }],
    muscles: ["chest", "shoulders", "triceps"],
    gender: "male",
  },
};

const drawnBy = new Map();
for (const t of TEMPLATES) {
  const d = data[t.subject];
  assert.ok(d, `No sample data for ${t.subject}`);
  if (t.fits && !t.fits(d)) continue;
  for (const aspect of ["story", "square"])
    for (const mode of ["all", "overlay"])
      for (const withPhoto of [false, true]) {
        const { w, h } = ASPECTS[aspect];
        const drawn = [];
        const ctx = new Proxy(
          {
            font: "",
            globalAlpha: 1,
            createLinearGradient() {
              return { addColorStop() {} };
            },
            createRadialGradient() {
              return { addColorStop() {} };
            },
            measureText(s) {
              const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 10);
              return {
                width: s.length * size * 0.6,
                actualBoundingBoxAscent: size * 0.75,
                actualBoundingBoxDescent: size * 0.2,
              };
            },
            fillText(s) {
              drawn.push(s);
            },
          },
          { get: (obj, key) => (key in obj ? obj[key] : () => {}) },
        );
        const L = {
          ctx,
          w,
          h,
          u: w / 100,
          H: h / (w / 100),
          aspect,
          renderMode: mode,
          overlayColor: "#ffffff",
          photo: withPhoto
            ? { image: { naturalWidth: 1600, naturalHeight: 1200 }, zoom: 1, x: 0.5, y: 0.5, rotation: 0 }
            : undefined,
        };
        t.draw(L, d);
        // Tracked type is set a letter at a time, so the name is only readable
        // once the letters are put back together.
        const text = drawn.join("");
        const where = `${t.id} (${aspect}, ${mode}${withPhoto ? ", photo" : ""})`;
        assert.match(text, /strata/i, `${where} does not say Strata: ${text.slice(0, 160)}`);
        assert.doesNotMatch(text, OLD, `${where} still says the old name`);
        drawnBy.set(t.id, (drawnBy.get(t.id) ?? 0) + 1);
      }
}
const skipped = TEMPLATES.filter((t) => !drawnBy.has(t.id)).map((t) => t.id);
assert.deepEqual(skipped, [], "Every template is drawn at least once");

console.log(
  `check-brand: ${files.length} files carry no old name, every platform says Strata, and all ${TEMPLATES.length} share templates sign themselves Strata`,
);
