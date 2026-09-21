/*
 * Pins the claims the "How rankings work" card makes about the scoring model.
 *
 * The card derives almost everything it says from `strength.ts` at render, so
 * most of it cannot drift. What is left is prose — the three cable exceptions,
 * the three ways a bodyweight movement is scored, what the progress bar and
 * its "to go" figure mean, which regions are read in weight rather than in
 * multiples of bodyweight — and prose drifts silently. Each sentence in the
 * card that is not read out of the source has an assertion here instead.
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

const {
  ABSOLUTE,
  BODYWEIGHT_LOADED,
  CANONICAL_LIFT,
  PLANK_SHARE,
  RANKING_LIFTS,
  REGION_ORDER,
  TIERS,
  TIER_LEVEL,
  computeMuscleScores,
} = require("../src/lib/strength.ts");
const { e1rm } = require("../src/lib/stats.ts");

const all = Object.values(RANKING_LIFTS).flat();
const uniq = (a) => [...new Set(a)];
const names = (f) => uniq(all.filter(f).map((l) => l.name));

/* ---- 1. The idea ------------------------------------------------------- */

assert.deepEqual(
  [...TIERS],
  ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Titan"],
  "The card lists the rungs in this order, Titan at the top",
);
assert.equal(TIERS.length, 6, "Six rungs: five thresholds and a floor");
assert.equal(REGION_ORDER.length, 14, "The card says fourteen regions");
assert.equal(TIER_LEVEL.Titan, "Legend");
for (const t of TIERS) assert.ok(TIER_LEVEL[t], `${t} has a level name`);

/* ---- 2. Which workouts count ------------------------------------------- */

// The three cable exceptions the card names, and nothing else machine-shaped.
assert.deepEqual(
  names((l) => /Cable|Pulldown/.test(l.name)),
  ["Lat Pulldown", "Close-Grip Lat Pulldown", "Seated Cable Row"],
  "The card names exactly these cable exceptions",
);
assert.deepEqual(
  names((l) => /Machine|Pec Deck|Smith|Press Machine|Extension Machine/.test(l.name)),
  [],
  "No selectorised machine ranks, so the card may say machines do not",
);
// Only finished workouts score: an identical session without `endedAt` scores
// nothing at all.
const EX = [
  { id: "x-bench", name: "Barbell Bench Press", muscle: "Chest", createdAt: 0 },
  { id: "x-pullup", name: "Pull-up", muscle: "Back", bodyweight: true, createdAt: 0 },
  { id: "x-plank", name: "Plank", muscle: "Core", bodyweight: true, tracks: "time", createdAt: 0 },
  { id: "x-crunch", name: "Crunch", muscle: "Core", bodyweight: true, createdAt: 0 },
  { id: "x-ohp", name: "Overhead Press", muscle: "Shoulders", createdAt: 0 },
  { id: "x-pp", name: "Push Press", muscle: "Shoulders", createdAt: 0 },
  { id: "x-pec", name: "Pec Deck", muscle: "Chest", createdAt: 0 },
];
const session = (exerciseId, sets, { ended = true } = {}) => ({
  id: `s-${exerciseId}-${Math.random()}`,
  name: "Workout",
  date: "2026-01-01",
  startedAt: 1,
  endedAt: ended ? 2 : undefined,
  entries: [
    {
      id: `e-${exerciseId}`,
      exerciseId,
      sets: sets.map((set, i) => ({
        id: `set-${i}`,
        reps: set.reps ?? 0,
        seconds: set.seconds,
        weight: set.weight,
        done: set.done ?? true,
      })),
    },
  ],
});
const score = (sessions, bw = 80, gender = "male") =>
  computeMuscleScores(sessions, EX, bw, gender);

const benchSet = [{ weight: 100, reps: 5 }];
assert.ok(
  score([session("x-bench", benchSet)]).chest,
  "A finished workout scores",
);
assert.equal(
  score([session("x-bench", benchSet, { ended: false })]).chest,
  undefined,
  "A workout still running scores nothing",
);
assert.equal(
  score([session("x-bench", [{ weight: 100, reps: 5, done: false }])]).chest,
  undefined,
  "A set never ticked off scores nothing",
);
assert.equal(
  score([session("x-pec", benchSet)]).chest,
  undefined,
  "A machine lift is logged but does not set a tier",
);

/* ---- 3. How a lift is measured ----------------------------------------- */

assert.equal(e1rm(100, 1), 100, "A single rep is itself");
assert.equal(e1rm(100, 0), 0, "No reps, no estimate");
assert.equal(
  Number(e1rm(100, 5).toFixed(1)),
  116.7,
  "The worked example the card prints",
);
assert.ok(
  e1rm(100, 6) > e1rm(100, 5),
  "More reps at the same weight estimate higher",
);
// The best set wins, not the most recent.
const best = score([
  session("x-bench", [{ weight: 140, reps: 3 }]),
  session("x-bench", [{ weight: 60, reps: 5 }]),
]).chest;
assert.equal(
  Number(best.best1rm.toFixed(2)),
  Number(e1rm(140, 3).toFixed(2)),
  "The best single set across all finished workouts is what is used",
);

/* ---- 4. How lifts are compared ----------------------------------------- */

const ohp = RANKING_LIFTS.shoulders[0];
const pp = RANKING_LIFTS.shoulders.find((l) => l.name === "Push Press");
assert.equal(ohp.name, "Overhead Press");
assert.equal(ohp.factor, 1, "The benchmark is the lift at a factor of 1");
assert.ok(pp.factor > 1, "The push press is the heavier movement by nature");
// The card's arithmetic: 66 push press loses to 60 overhead press.
assert.ok(
  66 / pp.factor < 60 / ohp.factor,
  "The naturally heavier lift does not automatically win",
);
const heavierLoses = score([
  session("x-ohp", [{ weight: 60, reps: 1 }]),
  session("x-pp", [{ weight: 66, reps: 1 }]),
]).shoulders;
assert.equal(
  heavierLoses.lift,
  "Overhead Press",
  "And the model agrees with the card's example",
);
for (const muscle of Object.keys(RANKING_LIFTS)) {
  assert.equal(
    CANONICAL_LIFT[muscle],
    RANKING_LIFTS[muscle][0].name,
    "The benchmark is the region's first lift",
  );
  assert.equal(RANKING_LIFTS[muscle][0].factor, 1);
}

/* ---- 5. Bodyweight movements ------------------------------------------- */

assert.deepEqual(
  names((l) => l.carriesBodyweight && !l.hold),
  ["Dip", "Chin-up", "Pull-up"],
  "The three lifts the card says you are the load on",
);
assert.deepEqual(names((l) => l.hold), ["Plank"], "One timed hold");
assert.deepEqual(
  names((l) => l.added && !l.carriesBodyweight),
  [
    "Back Extension",
    "Hanging Leg Raise",
    "Sit-up",
    "Ab Wheel Rollout",
    "Crunch",
    "Russian Twist",
    "Bicycle Crunch",
    "Glute Bridge",
  ],
  "The lifts the card says are scored on the plate alone",
);
for (const l of all)
  if (l.carriesBodyweight)
    assert.ok(l.added, "carriesBodyweight implies added, as the card assumes");
assert.ok(BODYWEIGHT_LOADED.has("Pull-up") && BODYWEIGHT_LOADED.has("Plank"));

// A pull-up ranks from the first unweighted rep, and is scored on body + belt.
const bwOnly = score([session("x-pullup", [{ weight: 0, reps: 8 }])]).lats;
assert.ok(bwOnly, "Zero added weight is a real answer on a lift that carries you");
assert.equal(
  Number(bwOnly.best1rm.toFixed(4)),
  Number(e1rm(80, 8).toFixed(4)),
  "Scored on bodyweight plus the plate",
);
const belted = score([session("x-pullup", [{ weight: 20, reps: 3 }])]).lats;
assert.equal(
  Number(belted.best1rm.toFixed(4)),
  Number(e1rm(100, 3).toFixed(4)),
  "The whole load, not the belt",
);
assert.equal(
  Number(belted.added1rm.toFixed(4)),
  Number(e1rm(20, 3).toFixed(4)),
  "And the belt is kept separately, which is what the screen shows you",
);
assert.ok(
  belted.added1rm < belted.best1rm,
  "The card says the entered figure and the scored figure differ here",
);

// The plate is the load: unweighted, it scores nothing.
assert.equal(
  score([session("x-crunch", [{ weight: 0, reps: 20 }])]).abs,
  undefined,
  "A plate-loaded core lift logged unweighted leaves the region grey",
);
assert.ok(
  score([session("x-crunch", [{ weight: 20, reps: 20 }])]).abs,
  "And ranks once there is a plate on it",
);

// The hold conversion, and its two properties the card states.
assert.equal(PLANK_SHARE, 0.6, "The card prints this share as a percentage");
const minute = score([session("x-plank", [{ seconds: 60, weight: 0 }])]).abs;
assert.equal(
  Number(minute.best1rm.toFixed(6)),
  PLANK_SHARE * 80,
  "At sixty seconds the figure is exactly the load carried",
);
const two = score([session("x-plank", [{ seconds: 120, weight: 0 }])]).abs;
assert.equal(
  Number((two.best1rm / minute.best1rm).toFixed(2)),
  1.41,
  "Doubling the hold is worth about forty percent more, not twice as much",
);
assert.ok(minute.hold, "A hold is reported as a stopwatch, not only as a weight");
assert.equal(minute.hold.seconds, 60);
const heavier = computeMuscleScores(
  [session("x-plank", [{ seconds: 60, weight: 0 }])],
  EX,
  100,
  "male",
).abs;
assert.ok(
  heavier.best1rm > minute.best1rm,
  "A heavier lifter holding the same plank is credited for carrying more",
);

/* ---- 6. How a tier is chosen ------------------------------------------- */

assert.deepEqual(
  Object.keys(ABSOLUTE),
  ["abs"],
  "Abs is the one region read in weight rather than bodyweight multiples",
);
assert.equal(
  minute.ratio,
  minute.equivalent,
  "An absolute region is not divided by the lifter",
);
const rel = score([session("x-bench", benchSet)]).chest;
assert.equal(
  Number(rel.ratio.toFixed(6)),
  Number((rel.equivalent / 80).toFixed(6)),
  "Every other region is the equivalent over bodyweight",
);
// No bodyweight leaves everything unscored; no eligible lift leaves one region.
assert.deepEqual(
  computeMuscleScores([session("x-bench", benchSet)], EX, null, "male"),
  {},
  "No body weight on file leaves every region unscored",
);
const onlyChest = score([session("x-bench", benchSet)]);
assert.ok(onlyChest.chest && !onlyChest.quadriceps, "Untouched regions stay grey");
// The gender setting selects the thresholds, and is the only setting that does.
const asMale = score([session("x-bench", benchSet)], 80, "male").chest;
const asFemale = score([session("x-bench", benchSet)], 80, "female").chest;
assert.equal(asMale.ratio, asFemale.ratio, "The lift is read the same either way");
assert.notEqual(
  asMale.tier,
  asFemale.tier,
  "But the thresholds it is read against differ",
);
// Bronze is the floor.
assert.equal(
  score([session("x-bench", [{ weight: 5, reps: 1 }])]).chest.tier,
  "Bronze",
  "Below the first threshold is Bronze",
);

/* ---- 7. The progress bar ----------------------------------------------- */

assert.ok(rel.next, "Below the top there is a rung above and a way to it");
assert.ok(
  rel.next.progress >= 0 && rel.next.progress <= 1,
  "Progress is a position inside the current band",
);
assert.ok(
  TIERS.indexOf(rel.next.tier) === TIERS.indexOf(rel.tier) + 1,
  "The bar names the very next rung, not a distant one",
);
// "to go" is a gap in estimated 1RM, on the lift that won the region.
assert.equal(rel.next.holdSeconds, null, "A counted lift quotes a weight");
assert.ok(rel.next.remaining > 0);
const closed = score([
  session("x-bench", [
    { weight: 100 + rel.next.remaining / (1 + 5 / 30), reps: 5 },
  ]),
]).chest;
assert.equal(
  TIERS.indexOf(closed.tier),
  TIERS.indexOf(rel.tier) + 1,
  "Adding remaining/(1 + reps/30) to the bar is what actually clears the rung, " +
    "which is why the card says the figure is an estimate gap and not bar weight",
);
assert.ok(
  rel.next.remaining / (1 + 5 / 30) < rel.next.remaining,
  "So the weight to add is less than the figure quoted, as the card warns",
);
// The card's illustration of that: a 14 gap at five reps is about 12 on the bar.
assert.equal(Math.round(14 / (1 + 5 / 30)), 12);
// A hold quotes time instead of weight.
assert.equal(minute.next.remaining, null, "A hold is not closed by loading it");
assert.ok(minute.next.holdSeconds > 60, "It quotes the hold that would clear it");
// Titan has nothing above it.
const titan = score([session("x-bench", [{ weight: 400, reps: 5 }])]).chest;
assert.equal(titan.tier, "Titan");
assert.equal(titan.next, null, "At the top the bar is full and has no target");
// The card says the percentage is floored and capped at 99 below the top.
const pct = (s) => (s.next ? Math.min(99, Math.floor(s.next.progress * 100)) : 100);
assert.ok(pct(rel) <= 99);
assert.equal(pct(titan), 100);

// The card says the box beside the figure counts days since the region last
// improved, and that nothing on the screen is a percentile. Both have to stay
// true of the screen itself, so the invented ladder must not creep back.
{
  const home = fs.readFileSync("src/screens/Home.tsx", "utf8");
  assert.ok(
    !/percentile|Top \$\{/.test(home),
    "No percentile is computed or shown on the strength screen",
  );
  assert.ok(
    /est\. 1RM · \$\{period\}/.test(home),
    "The figure still carries the trend box the card describes",
  );
}

/* ---- The date the "since best" box counts from ------------------------- */

// It is the day the winning lift's best was set, so a lesser lift landing
// later must not move it — the region did not improve.
{
  const early = session("x-bench", [{ weight: 100, reps: 5 }]);
  early.date = "2026-01-01";
  const laterButWorse = session("x-bench", [{ weight: 60, reps: 5 }]);
  laterButWorse.date = "2026-06-01";
  assert.equal(
    score([early, laterButWorse]).chest.bestDate,
    "2026-01-01",
    "A worse set logged later is not an improvement",
  );
  const laterAndBetter = session("x-bench", [{ weight: 140, reps: 5 }]);
  laterAndBetter.date = "2026-06-01";
  assert.equal(
    score([early, laterAndBetter]).chest.bestDate,
    "2026-06-01",
    "Beating the standing best moves the date",
  );
}
// On a lift that carries you the date comes off the set that won on the whole
// load, which is not always the set that was heaviest on the belt.
{
  const beltHeavy = session("x-pullup", [{ weight: 40, reps: 1 }]);
  beltHeavy.date = "2026-02-01";
  const wholeLoadBest = session("x-pullup", [{ weight: 20, reps: 12 }]);
  wholeLoadBest.date = "2026-03-01";
  const lats = score([beltHeavy, wholeLoadBest]).lats;
  assert.equal(
    Number(lats.best1rm.toFixed(4)),
    Number(e1rm(100, 12).toFixed(4)),
    "The whole load is what the rank is read from",
  );
  assert.equal(
    lats.bestDate,
    "2026-03-01",
    "And the date follows that set, not the heavier belt",
  );
}
// A hold is dated the same way.
{
  const short = session("x-plank", [{ seconds: 60, weight: 0 }]);
  short.date = "2026-04-01";
  const long = session("x-plank", [{ seconds: 150, weight: 0 }]);
  long.date = "2026-05-01";
  assert.equal(score([short, long]).abs.bestDate, "2026-05-01");
}
// Every scored region can answer the question the box asks.
{
  const all = score([
    session("x-bench", benchSet),
    session("x-pullup", [{ weight: 10, reps: 5 }]),
    session("x-plank", [{ seconds: 90, weight: 0 }]),
  ]);
  for (const [muscle, sc] of Object.entries(all))
    assert.ok(sc.bestDate, `${muscle} knows when it last improved`);
}

/* ---- 8. How to improve a rank ------------------------------------------ */

// Progress on any eligible lift can take the region, not just the benchmark.
const viaRaise = score([
  session("x-ohp", [{ weight: 40, reps: 5 }]),
  session("x-pp", [{ weight: 100, reps: 5 }]),
]).shoulders;
assert.equal(
  viaRaise.lift,
  "Push Press",
  "A non-benchmark lift takes the region when it is the better lift",
);
// Bodyweight is the divisor everywhere but the absolute region, so a stale
// figure moves every tier — which is the card's reason for keeping it current.
const light = computeMuscleScores([session("x-bench", benchSet)], EX, 70, "male");
const heavy = computeMuscleScores([session("x-bench", benchSet)], EX, 90, "male");
assert.ok(
  light.chest.ratio > heavy.chest.ratio,
  "The same lift at a heavier bodyweight reads as a lower ratio",
);

console.log(
  "check-rankings: every claim in the How rankings work card matches the source",
);
