/*
 * The estimated-1RM trend behind the figure's right-hand callout.
 *
 * Covers what the box claims: a percentage drawn from one reading per workout
 * of one named lift inside a rolling window of local calendar days, first
 * against latest, with the all-time record deliberately kept out of it.
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
  TREND_DAYS,
  TREND_PERIODS,
  liftTrend,
  nextPeriod,
} = require("../src/lib/strength.ts");
const { e1rm } = require("../src/lib/stats.ts");

const TODAY = "2026-09-16";
const BW = 80;

/** The local day key `n` days before TODAY. */
function ago(n) {
  const d = new Date(2026, 8, 16);
  d.setDate(d.getDate() - n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const EX = [
  { id: "x-bench", name: "Barbell Bench Press", muscle: "Chest", createdAt: 0 },
  { id: "x-incline", name: "Incline Barbell Bench Press", muscle: "Chest", createdAt: 0 },
  { id: "x-pullup", name: "Pull-up", muscle: "Back", bodyweight: true, createdAt: 0 },
  { id: "x-plank", name: "Plank", muscle: "Core", bodyweight: true, tracks: "time", createdAt: 0 },
];

let seq = 0;
/** A finished workout of one exercise on a given day. `at` orders same-day sessions. */
function w(exerciseId, daysAgo, sets, opts = {}) {
  seq += 1;
  return {
    id: `s${seq}`,
    name: "Workout",
    date: ago(daysAgo),
    startedAt: opts.at ?? (1_000_000 - daysAgo * 1000),
    endedAt: opts.ended === false ? undefined : 2_000_000 - daysAgo * 1000,
    deleted: opts.deleted,
    entries: [
      {
        id: `e${seq}`,
        exerciseId,
        sets: sets.map((set, i) => ({
          id: `set${seq}-${i}`,
          reps: set.reps ?? 0,
          seconds: set.seconds,
          weight: set.weight ?? 0,
          done: set.done ?? true,
          skipped: set.skipped,
        })),
      },
    ],
  };
}

const trend = (sessions, lift = "Barbell Bench Press", period = "week", bw = BW) =>
  liftTrend(sessions, EX, lift, period, bw, TODAY);

/** Percent, to one decimal, the way the callout renders it. */
const pct = (t) => Number(t.percent.toFixed(1));

/* ---- The cycle --------------------------------------------------------- */

assert.deepEqual([...TREND_PERIODS], ["week", "month", "year"]);
assert.equal(nextPeriod("week"), "month");
assert.equal(nextPeriod("month"), "year");
assert.equal(nextPeriod("year"), "week", "The cycle comes round again");
assert.deepEqual(TREND_DAYS, { week: 7, month: 30, year: 365 });

/* ---- Direction --------------------------------------------------------- */

// Positive: 100x5 -> 110x5 is exactly a tenth more estimated 1RM.
{
  const t = trend([
    w("x-bench", 5, [{ weight: 100, reps: 5 }]),
    w("x-bench", 1, [{ weight: 110, reps: 5 }]),
  ]);
  assert.equal(t.kind, "change");
  assert.equal(pct(t), 10);
  assert.equal(Number(t.first.toFixed(4)), Number(e1rm(100, 5).toFixed(4)));
  assert.equal(Number(t.latest.toFixed(4)), Number(e1rm(110, 5).toFixed(4)));
}
// Negative, and reported as the drop from the first reading.
{
  const t = trend([
    w("x-bench", 5, [{ weight: 110, reps: 5 }]),
    w("x-bench", 1, [{ weight: 100, reps: 5 }]),
  ]);
  assert.equal(pct(t), -9.1);
}
// Flat.
{
  const t = trend([
    w("x-bench", 5, [{ weight: 100, reps: 5 }]),
    w("x-bench", 1, [{ weight: 100, reps: 5 }]),
  ]);
  assert.equal(t.kind, "change");
  assert.equal(t.percent, 0);
}
// Equal estimates from different set shapes are still flat: 100x5 and a
// heavier double that estimates the same are not a gain.
{
  const t = trend([
    w("x-bench", 5, [{ weight: 100, reps: 5 }]),
    w("x-bench", 1, [{ weight: e1rm(100, 5) / (1 + 2 / 30), reps: 2 }]),
  ]);
  assert.equal(pct(t), 0);
}

/* ---- Too little to compare --------------------------------------------- */

assert.deepEqual(trend([w("x-bench", 2, [{ weight: 100, reps: 5 }])]), {
  kind: "sparse",
  readings: 1,
});
assert.deepEqual(trend([]), { kind: "sparse", readings: 0 });
// Two workouts, but only one inside the week.
assert.equal(
  trend([
    w("x-bench", 20, [{ weight: 100, reps: 5 }]),
    w("x-bench", 2, [{ weight: 120, reps: 5 }]),
  ]).kind,
  "sparse",
  "A reading outside the window cannot be one end of the comparison",
);
// The same pair over a month does compare.
assert.equal(
  trend(
    [
      w("x-bench", 20, [{ weight: 100, reps: 5 }]),
      w("x-bench", 2, [{ weight: 120, reps: 5 }]),
    ],
    "Barbell Bench Press",
    "month",
  ).kind,
  "change",
  "And the wider window reaches it",
);

/* ---- Window boundaries ------------------------------------------------- */

for (const period of TREND_PERIODS) {
  const days = TREND_DAYS[period];
  const inside = trend(
    [
      w("x-bench", days - 1, [{ weight: 100, reps: 5 }]),
      w("x-bench", 0, [{ weight: 110, reps: 5 }]),
    ],
    "Barbell Bench Press",
    period,
  );
  assert.equal(inside.kind, "change", `${period}: the oldest day still counts`);
  assert.equal(pct(inside), 10);

  const outside = trend(
    [
      w("x-bench", days, [{ weight: 100, reps: 5 }]),
      w("x-bench", 0, [{ weight: 110, reps: 5 }]),
    ],
    "Barbell Bench Press",
    period,
  );
  assert.equal(
    outside.kind,
    "sparse",
    `${period}: one day further back has fallen out`,
  );
}

/* ---- Local calendar days, not elapsed hours ---------------------------- */

// Two sessions minutes apart either side of midnight are two days and two
// readings, and the earlier one is the "first" however the clocks read.
{
  const before = w("x-bench", 1, [{ weight: 100, reps: 5 }], {
    at: Date.UTC(2026, 8, 15, 23, 59),
  });
  const after = w("x-bench", 0, [{ weight: 110, reps: 5 }], {
    at: Date.UTC(2026, 8, 16, 0, 1),
  });
  const t = trend([before, after]);
  assert.equal(t.readings, 2, "Either side of midnight is two workouts");
  assert.equal(pct(t), 10);
}
// A workout today is inside every window, including the tightest.
assert.equal(
  trend([
    w("x-bench", 0, [{ weight: 100, reps: 5 }], { at: 10 }),
    w("x-bench", 0, [{ weight: 110, reps: 5 }], { at: 20 }),
  ]).kind,
  "change",
  "Two workouts on the same day still compare",
);

/* ---- Order of arrival -------------------------------------------------- */

// The store hands sessions over in whatever order it holds them; a restored
// backup or a second device can put an older workout after a newer one.
{
  const older = w("x-bench", 6, [{ weight: 100, reps: 5 }], { at: 100 });
  const newer = w("x-bench", 1, [{ weight: 110, reps: 5 }], { at: 900 });
  const forwards = trend([older, newer]);
  const backwards = trend([newer, older]);
  assert.equal(pct(forwards), 10);
  assert.deepEqual(
    backwards,
    forwards,
    "Reordering the input cannot reverse the sign",
  );
}

/* ---- One reading per workout ------------------------------------------- */

// A session that works up to a heavy single and drops back is represented by
// the single, not by whichever set was logged last.
{
  const t = trend([
    w("x-bench", 5, [{ weight: 100, reps: 5 }]),
    w("x-bench", 1, [
      { weight: 140, reps: 1 },
      { weight: 90, reps: 8 },
      { weight: 90, reps: 8 },
    ]),
  ]);
  assert.equal(Number(t.latest.toFixed(4)), 140, "The best set of the day wins");
  assert.equal(t.readings, 2, "However many sets it held, a workout is one reading");
}

/* ---- What does not qualify --------------------------------------------- */

const good = w("x-bench", 5, [{ weight: 100, reps: 5 }]);
const bad = (sets, opts) => trend([good, w("x-bench", 1, sets, opts)]).kind;
assert.equal(bad([{ weight: 200, reps: 5 }], { ended: false }), "sparse", "unfinished");
assert.equal(bad([{ weight: 200, reps: 5 }], { deleted: true }), "sparse", "deleted");
assert.equal(bad([{ weight: 200, reps: 5, done: false }]), "sparse", "never ticked off");
assert.equal(bad([{ weight: 200, reps: 5, done: false, skipped: true }]), "sparse", "skipped");
assert.equal(bad([{ weight: 200, seconds: 60, reps: 0 }]), "sparse", "timed");
assert.equal(bad([{ weight: 0, reps: 10 }]), "sparse", "no load");
// A different exercise is never folded in, however close its name sits.
assert.equal(
  trend([good, w("x-incline", 1, [{ weight: 200, reps: 5 }])]).kind,
  "sparse",
  "Two different lifts are not a trend",
);

/* ---- The all-time record stays out ------------------------------------- */

// A huge lift from last year is the lifter's record, and must not become one
// end of a comparison over a week.
{
  const sessions = [
    w("x-bench", 300, [{ weight: 200, reps: 5 }]),
    w("x-bench", 5, [{ weight: 100, reps: 5 }]),
    w("x-bench", 1, [{ weight: 110, reps: 5 }]),
  ];
  const week = trend(sessions);
  assert.equal(pct(week), 10, "The record is outside the week and stays outside");
  assert.equal(week.readings, 2);
  // Over a year it is inside, and then it is simply the first reading.
  const year = trend(sessions, "Barbell Bench Press", "year");
  assert.equal(year.readings, 3);
  assert.equal(Number(year.first.toFixed(4)), Number(e1rm(200, 5).toFixed(4)));
  assert.ok(year.percent < 0, "Measured from a record, the year reads as a drop");
}

/* ---- Bodyweight conventions -------------------------------------------- */

// A pull-up is logged as what hung off the belt and read on the whole load, so
// the trend has to add the lifter in before estimating, exactly as the rank
// does — otherwise +0 to +10 kg would read as an infinite gain.
{
  const t = trend(
    [
      w("x-pullup", 5, [{ weight: 0, reps: 8 }]),
      w("x-pullup", 1, [{ weight: 10, reps: 8 }]),
    ],
    "Pull-up",
  );
  assert.equal(t.kind, "change");
  assert.equal(Number(t.first.toFixed(4)), Number(e1rm(BW, 8).toFixed(4)));
  assert.equal(Number(t.latest.toFixed(4)), Number(e1rm(BW + 10, 8).toFixed(4)));
  assert.equal(pct(t), 12.5);
}
// Without a bodyweight there is no honest figure to take.
assert.deepEqual(
  trend(
    [
      w("x-pullup", 5, [{ weight: 0, reps: 8 }]),
      w("x-pullup", 1, [{ weight: 10, reps: 8 }]),
    ],
    "Pull-up",
    "week",
    null,
  ),
  { kind: "sparse", readings: 0 },
);

/* ---- Timed lifts ------------------------------------------------------- */

// A plank has no estimated 1RM to move, in any window, however much was logged.
for (const period of TREND_PERIODS)
  assert.deepEqual(
    trend(
      [
        w("x-plank", 5, [{ seconds: 60, weight: 0 }]),
        w("x-plank", 1, [{ seconds: 150, weight: 0 }]),
      ],
      "Plank",
      period,
    ),
    { kind: "hold" },
    `A hold is reported as a hold over the ${period}`,
  );

/* ---- Rendering rules the callout applies ------------------------------- */

const fmt = (p) => {
  const r = Number(p.toFixed(1));
  if (r === 0) return "0%";
  return `${r > 0 ? "+" : "−"}${Math.abs(r)}%`;
};
assert.equal(fmt(6.23), "+6.2%");
assert.equal(fmt(-9.09), "−9.1%", "A true minus sign, not a hyphen");
assert.equal(fmt(0), "0%");
assert.equal(fmt(0.04), "0%", "Anything rounding to nothing claims no direction");
assert.equal(fmt(-0.04), "0%");

console.log(
  "check-trend: direction, windows, boundaries, ordering, exclusions, bodyweight and holds passed",
);
