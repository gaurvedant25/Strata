/* Pure streak regression checks; no browser, account, or stored data is touched. */
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
  STREAK_WINDOW_MS,
  qualifiesForStreak,
  streakSummary,
} = require("../src/lib/stats.ts");

const HOUR = 60 * 60 * 1000;
const completed = (id, endedAt, options = {}) => ({
  id,
  name: options.name ?? `Workout ${id}`,
  date: options.date ?? "1999-01-01", // completion day must not trust this
  startedAt: options.startedAt ?? endedAt - HOUR,
  endedAt,
  entries: [
    {
      id: `entry-${id}`,
      exerciseId: "lift",
      sets: [
        {
          id: `set-${id}`,
          reps: options.timed ? 0 : 8,
          seconds: options.timed ? 45 : undefined,
          weight: options.timed ? 0 : 80,
          done: options.done ?? true,
          skipped: options.skipped ?? false,
        },
      ],
    },
  ],
});

const t = new Date(2026, 0, 1, 12).getTime();
assert.equal(STREAK_WINDOW_MS, 60 * HOUR);
assert.equal(streakSummary([], t).current, 0);
assert.equal(qualifiesForStreak(completed("timed", t, { timed: true })), true);
assert.equal(
  qualifiesForStreak(completed("skipped", t, { done: false, skipped: true })),
  false,
);

let summary = streakSummary([completed("one", t)], t + STREAK_WINDOW_MS - 1000);
assert.equal(summary.current, 1, "Alive one second before the 60-hour boundary");
assert.equal(summary.remainingMs, 1000);
summary = streakSummary([completed("one", t)], t + STREAK_WINDOW_MS);
assert.equal(summary.current, 0, "Expires at exactly 60 hours");
assert.equal(summary.best, 1, "Expiry does not erase the historical best");

const exact = [completed("old", t), completed("new", t + STREAK_WINDOW_MS)];
assert.equal(streakSummary(exact.reverse(), t + STREAK_WINDOW_MS + HOUR).current, 2);
const broken = [completed("old", t), completed("new", t + STREAK_WINDOW_MS + 1)];
assert.equal(streakSummary(broken, t + STREAK_WINDOW_MS + HOUR).current, 1);

const olderBest = [
  completed("run-1", t - 12 * 24 * HOUR),
  completed("run-2", t - 10 * 24 * HOUR),
  completed("run-3", t - 8 * 24 * HOUR),
  completed("current", t),
];
summary = streakSummary(olderBest, t + HOUR);
assert.equal(summary.current, 1, "A later workout starts a new current run");
assert.equal(summary.best, 3, "A shorter current run retains the historical best");

const morning = new Date(2026, 0, 5, 8).getTime();
const evening = new Date(2026, 0, 5, 20).getTime();
summary = streakSummary(
  [completed("am", morning), completed("pm", evening)],
  evening + HOUR,
);
assert.equal(summary.current, 1, "Two workouts on one local day count once");
assert.equal(
  summary.expiresAt,
  evening + STREAK_WINDOW_MS,
  "The latest same-day workout extends the deadline",
);

const beforeMidnight = new Date(2026, 0, 8, 23, 30).getTime();
const afterMidnight = new Date(2026, 0, 9, 1, 30).getTime();
summary = streakSummary(
  [
    completed("before", beforeMidnight, { date: "2026-01-08" }),
    completed("after", afterMidnight, { date: "2026-01-08" }),
  ],
  afterMidnight + HOUR,
);
assert.equal(summary.current, 2, "Completion time decides the local streak day");

const qualifying = completed("real", t + 2 * HOUR);
const skipped = completed("skip", t + 3 * HOUR, { done: false, skipped: true });
summary = streakSummary([skipped, qualifying], t + 4 * HOUR);
assert.equal(summary.current, 1);
assert.equal(summary.latestSessionId, "real", "All-skipped workouts do not extend a streak");

const edited = { ...qualifying, startedAt: qualifying.startedAt - 10 * HOUR };
summary = streakSummary([edited], t + 4 * HOUR);
assert.equal(summary.latestCompletedAt, qualifying.endedAt, "An edit keeps the original completion time");

console.log("Streaks: qualification, local days, 60-hour expiry, and history passed.");
