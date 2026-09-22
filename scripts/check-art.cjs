/*
 * Keeps the exercise thumbnails and the exercise library in step.
 *
 * `exerciseArt` derives a path from an exercise's id rather than reading a
 * manifest, which is what keeps that module trivial — and also what makes this
 * check necessary: a lift added to the library with no picture fetched for it
 * would show a fallback mark and a 404 in the network log, and nothing else
 * would complain.
 *
 * Pure: no browser, no account, no stored data.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const assert = require("node:assert/strict");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};

const { seedExercises, seedId } = require("../src/lib/seed.ts");

const DIR = path.join(__dirname, "..", "public", "exercise");
const files = new Set(
  fs.readdirSync(DIR).filter((f) => f.endsWith(".png")),
);

/* Every library lift has a picture, under the slug of its own id. */
const want = new Set();
for (const e of seedExercises()) {
  const file = `${e.id.replace(/^sx-/, "")}.png`;
  assert.equal(e.id, seedId(e.name), `${e.name} has an unexpected id`);
  assert.ok(files.has(file), `${e.name} has no thumbnail (${file})`);
  const size = fs.statSync(path.join(DIR, file)).size;
  // A file this small is a failed download that got written anyway, not a
  // picture of a squat.
  assert.ok(size > 512, `${file} is only ${size} bytes`);
  want.add(file);
}

/* And nothing in the folder belongs to a lift the library no longer has. */
for (const file of files) {
  assert.ok(want.has(file), `${file} matches no exercise in the library`);
}

const total = [...files].reduce(
  (n, f) => n + fs.statSync(path.join(DIR, f)).size,
  0,
);
console.log(
  `check-art: ${files.size} thumbnails, ${Math.round(total / 1024)} KB, one for every library lift`,
);
