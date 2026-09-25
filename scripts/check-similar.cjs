/*
 * Pins the suggestions the Replace sheet makes.
 *
 * The sheet's whole value is that its top four rows are lifts you would
 * actually accept in place of the one you just swiped away. That is a judgement
 * encoded in a table of movement pools and a three-part score, and both are the
 * kind of thing a later edit can quietly ruin: a name misspelled here drops a
 * lift out of its pool with no error anywhere, and a change to the scoring can
 * reorder every suggestion in the app while every screen still renders.
 *
 * So the pools are checked against the library, and the suggestions for the
 * lifts most likely to be swapped are asserted by name.
 *
 * Pure: no browser, no account, no stored data.
 */
const fs = require("node:fs");
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

const { FAMILIES, familyOf, similarExercises } = require("../src/lib/similar.ts");
const { seedExercises } = require("../src/lib/seed.ts");

const LIB = seedExercises();
const byName = new Map(LIB.map((e) => [e.name, e]));
const ex = (name) => {
  const found = byName.get(name);
  assert.ok(found, `${name} is not in the library`);
  return found;
};
/** The names the sheet would offer in place of `name`, best first. */
const suggest = (name, skip = []) =>
  similarExercises(ex(name), LIB, new Set(skip.map((n) => ex(n).id))).map(
    (e) => e.name,
  );

/* ---- 1. The pools name real lifts -------------------------------------- */

for (const [family, names] of Object.entries(FAMILIES)) {
  for (const name of names) {
    assert.ok(
      byName.has(name),
      `"${name}" is in the ${family} pool but not in the library`,
    );
  }
}

// One pool each, or the reverse lookup silently keeps whichever was defined
// last and the other pool loses a member.
const seen = new Map();
for (const [family, names] of Object.entries(FAMILIES)) {
  for (const name of names) {
    assert.ok(
      !seen.has(name),
      `"${name}" is in both the ${seen.get(name)} and ${family} pools`,
    );
    seen.set(name, family);
  }
}

/* ---- 2. The case the feature was asked for ----------------------------- */

// Swipe the flat barbell bench and the two answers at the top are the incline
// and the dumbbell version of the same press.
const bench = suggest("Barbell Bench Press");
assert.deepEqual(
  bench.slice(0, 2).sort(),
  ["Dumbbell Bench Press", "Incline Barbell Bench Press"],
  "The bench press suggests its incline and dumbbell versions first",
);
assert.ok(
  !bench.includes("Barbell Bench Press"),
  "A lift is never offered as its own replacement",
);
assert.ok(
  !bench.includes("Cable Fly"),
  "A fly is not a substitute for a press, even on the same muscle group",
);

/* ---- 3. Nothing already in the workout comes up ------------------------ */

const trimmed = suggest("Barbell Bench Press", [
  "Dumbbell Bench Press",
  "Incline Barbell Bench Press",
]);
for (const gone of ["Dumbbell Bench Press", "Incline Barbell Bench Press"]) {
  assert.ok(!trimmed.includes(gone), `${gone} is already in the workout`);
}
// The list closes up rather than shortening: the next best substitutes move in.
assert.equal(trimmed.length, 4, "The sheet still offers a full set of options");
assert.ok(
  trimmed.includes("Incline Dumbbell Press") &&
    trimmed.includes("Machine Chest Press"),
  "The next-best presses move up when the first two are taken",
);

/* ---- 4. A muscle group is not a set of substitutes --------------------- */

// The library files both of these under Legs, which is exactly why the muscle
// group cannot be the whole answer.
assert.ok(
  !suggest("Back Squat").includes("Standing Calf Raise"),
  "A calf raise is not a substitute for a squat",
);
assert.deepEqual(
  suggest("Standing Calf Raise")[0],
  "Seated Calf Raise",
  "A calf raise suggests the other calf raise",
);
// Filed under Arms rather than Chest, and still the right answer for a press.
assert.ok(
  suggest("Close-Grip Bench Press").includes("Barbell Bench Press"),
  "A pool crosses muscle groups where the movement does",
);

/* ---- 5. Counted and held sets never suggest each other ----------------- */

for (const held of ["Plank", "Treadmill Run", "Farmer's Carry"]) {
  for (const name of suggest(held)) {
    assert.equal(
      ex(name).tracks,
      "time",
      `${name} is counted in reps and cannot stand in for ${held}`,
    );
  }
}
for (const counted of ["Crunch", "Barbell Curl", "Back Squat"]) {
  for (const name of suggest(counted)) {
    assert.equal(
      ex(name).tracks,
      "reps",
      `${name} is held for a duration and cannot stand in for ${counted}`,
    );
  }
}

/* ---- 6. A lift nobody has an alternative for stays quiet --------------- */

// In no pool, and no other Arms lift shares two words with it. Offering the
// bicep curls here would be worse than offering nothing.
assert.equal(familyOf("Hand Gripper"), undefined);
assert.deepEqual(
  suggest("Hand Gripper"),
  [],
  "A lift with no real substitute suggests nothing",
);

// The wrist curl used to be that example. The wider library gave it real
// variations, and those — only those — are what it offers now, never the
// bicep curls that share one word with it.
for (const name of suggest("Wrist Curl"))
  assert.ok(/wrist curl/i.test(name), `${name} is not a wrist curl`);

/* ---- 7. An exercise the athlete created still gets answers ------------- */

const custom = {
  id: "x-custom",
  name: "Smith Machine Bench Press",
  muscle: "Chest",
  tracks: "reps",
  createdAt: 0,
};
assert.ok(
  similarExercises(custom, LIB)
    .map((e) => e.name)
    .includes("Barbell Bench Press"),
  "A created exercise is matched on its muscle group and its name",
);

/* ---- 8. Every library lift is answered the same way -------------------- */

for (const e of LIB) {
  const names = suggest(e.name);
  assert.ok(names.length <= 4, `${e.name} suggests more than four lifts`);
  assert.equal(
    new Set(names).size,
    names.length,
    `${e.name} suggests the same lift twice`,
  );
}

console.log(
  `check-similar: ${Object.keys(FAMILIES).length} movement pools cover ${seen.size} of ${LIB.length} library lifts, and every suggestion holds`,
);
