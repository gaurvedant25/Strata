/* Pure Pro-preview rule checks; no browser, account, network or stored data. */
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
  DAY_MS,
  FUTURE_FEATURES,
  PREVIEW_DAYS,
  PRO_BENEFITS,
  PRO_FEATURES,
  FREE_FEATURES,
  LOCKOUT_ARMED,
  can,
  canStartWorkout,
  canWrite,
  endsIn,
  writeAllowedByPlan,
  gateDestination,
  hasRenewingSubscription,
  planLabel,
  formatRemaining,
  fromRow,
  hasQualifyingWorkout,
  isFinalDay,
  previewSummary,
  resolve,
  shortDate,
} = require("../src/lib/entitlement.ts");

const HOUR = 3_600_000;
const T0 = new Date(2026, 0, 1, 9).getTime();

/** A finished workout with one real set, unless told otherwise. */
const workout = (id, endedAt, o = {}) => ({
  id,
  name: `Workout ${id}`,
  date: "2026-01-01",
  startedAt: o.startedAt ?? endedAt - HOUR,
  endedAt: o.endedAt === null ? undefined : endedAt,
  entries:
    o.entries ??
    [
      {
        id: `e-${id}`,
        exerciseId: o.exerciseId ?? "bench",
        sets: [
          {
            id: `s-${id}`,
            reps: 5,
            weight: o.weight ?? 100,
            done: o.done ?? true,
            skipped: o.skipped ?? false,
          },
        ],
      },
    ],
});

/** A server row as `get_entitlement()` hands it over, in snake_case ISO. */
const row = (o = {}) => ({
  pro_preview_started_at: o.startedAt ? new Date(o.startedAt).toISOString() : null,
  pro_preview_ends_at: o.endsAt ? new Date(o.endsAt).toISOString() : null,
  pro_preview_consumed: o.consumed ?? false,
  subscription_status: o.status ?? "none",
  subscription_expires_at: o.subExpires ? new Date(o.subExpires).toISOString() : null,
  entitlement_source: o.source ?? "free",
});

const preview = (start = T0) =>
  fromRow(
    row({
      startedAt: start,
      endsAt: start + PREVIEW_DAYS * DAY_MS,
      consumed: true,
      source: "pro_preview",
    }),
  );

// ── What starts a preview ───────────────────────────────────────────────────

assert.equal(
  hasQualifyingWorkout([workout("a", T0)]),
  true,
  "One finished workout with a logged set qualifies",
);

assert.equal(hasQualifyingWorkout([]), false, "No history does not qualify");

assert.equal(
  hasQualifyingWorkout([workout("empty", T0, { entries: [] })]),
  false,
  "A workout with no exercises does not start the preview",
);

assert.equal(
  hasQualifyingWorkout([workout("skipped", T0, { done: false, skipped: true })]),
  false,
  "An all-skipped workout does not start the preview",
);

assert.equal(
  hasQualifyingWorkout([workout("open", T0, { endedAt: null })]),
  false,
  "A workout still running does not start the preview",
);

assert.equal(
  hasQualifyingWorkout([
    workout("skipped", T0, { done: false, skipped: true }),
    workout("real", T0 + HOUR),
  ]),
  true,
  "One qualifying workout among skipped ones is enough",
);

// The existing-user rollout is the same question asked of an old history: the
// condition is standing, so a user who trained months ago meets it on the first
// launch after release — and it is stamped now rather than backdated, because
// the server sets both timestamps from its own clock.
const oldHistory = [workout("ancient", T0 - 200 * DAY_MS)];
assert.equal(
  hasQualifyingWorkout(oldHistory),
  true,
  "An existing user with old workouts is eligible on first launch",
);
const rolledOut = resolve(preview(T0), T0 + HOUR);
assert.equal(rolledOut.state, "pro_preview");
assert.equal(
  rolledOut.msRemaining > 6 * DAY_MS,
  true,
  "The rollout preview is not backdated into an instant expiry",
);

// ── The seven days ──────────────────────────────────────────────────────────

const rec = preview(T0);
assert.equal(
  rec.proPreviewEndsAt - rec.proPreviewStartedAt,
  7 * DAY_MS,
  "A preview lasts exactly seven days",
);

assert.equal(resolve(rec, T0).state, "pro_preview", "Live at the first instant");
assert.equal(
  resolve(rec, T0 + 7 * DAY_MS - 1).state,
  "pro_preview",
  "Live one millisecond before the end",
);
assert.equal(
  resolve(rec, T0 + 7 * DAY_MS).state,
  "expired",
  "Expired exactly on the boundary, not a tick later",
);
assert.equal(
  resolve(rec, T0 + 7 * DAY_MS).msRemaining,
  0,
  "Remaining time never goes negative",
);
assert.equal(
  resolve(rec, T0 + 400 * DAY_MS).state,
  "expired",
  "Long past the end it is still expired, never free again",
);

// ── Final-day messaging ─────────────────────────────────────────────────────

assert.equal(
  isFinalDay(resolve(rec, T0 + 5 * DAY_MS)),
  false,
  "Day six is silent — no promotion in the first five days or on day six",
);
assert.equal(
  isFinalDay(resolve(rec, T0 + 6 * DAY_MS)),
  true,
  "The notice belongs in the last twenty-four hours",
);
assert.equal(
  isFinalDay(resolve(rec, T0 + 7 * DAY_MS)),
  false,
  "Once it has ended there is no 'ends tomorrow' left to say",
);

// ── Honest remaining time ───────────────────────────────────────────────────

assert.equal(formatRemaining(7 * DAY_MS), "7 days left");
assert.equal(
  formatRemaining(7 * DAY_MS - 1000),
  "7 days left",
  "A second into a seven-day preview still reads as seven days, not six",
);
assert.equal(
  formatRemaining(6 * DAY_MS - 500),
  "6 days left",
  "One day in reads as six left, which is the boundary flooring got wrong",
);
assert.equal(formatRemaining(5 * DAY_MS + 2 * HOUR), "5 days left");
assert.equal(
  formatRemaining(DAY_MS + 5 * 60_000),
  "1 day left",
  "Just over a day is a day",
);
assert.equal(
  formatRemaining(23 * HOUR),
  "23 hours left",
  "Under a day counts hours rather than rounding up to a day",
);
assert.equal(
  formatRemaining(5 * 60_000),
  "5 minutes left",
  "Five minutes must never read as '1 day'",
);
assert.equal(formatRemaining(30_000), "Less than a minute left");
assert.equal(formatRemaining(0), "Ended");
assert.equal(formatRemaining(-DAY_MS), "Ended");

// ── Subscribers ─────────────────────────────────────────────────────────────

const subscriber = fromRow(
  row({
    startedAt: T0,
    endsAt: T0 + 7 * DAY_MS,
    consumed: true,
    status: "active",
    subExpires: T0 + 30 * DAY_MS,
    source: "subscription",
  }),
);
const mid = resolve(subscriber, T0 + 3 * DAY_MS);
assert.equal(mid.state, "subscribed", "A subscriber is never shown a preview state");
assert.equal(mid.source, "subscription", "Why access was granted is reported");
assert.equal(mid.pro, true);

assert.equal(
  resolve(subscriber, T0 + 40 * DAY_MS).state,
  "expired",
  "A lapsed subscriber whose preview is also gone lands on expired, not free",
);

const openEnded = fromRow(row({ status: "active", source: "subscription" }));
assert.equal(
  resolve(openEnded, T0 + 900 * DAY_MS).state,
  "subscribed",
  "A lifetime unlock has no expiry and never lapses",
);

// ── Never restartable ───────────────────────────────────────────────────────

// Signing out, reinstalling and clearing local storage all end in the same
// place: the row is re-read from the server. A consumed row can only ever
// resolve to expired, whatever the device believes.
const consumedOnly = fromRow(row({ consumed: true }));
assert.equal(
  resolve(consumedOnly, T0).state,
  "expired",
  "A consumed preview with no dates left is expired, not a fresh free start",
);
assert.equal(
  resolve(null, T0).state,
  "free",
  "No row at all — a signed-out or brand new account — is plain free",
);
assert.equal(
  resolve(null, T0).previewConsumed,
  false,
  "A user with no row is still eligible",
);

// ── Device-clock manipulation ───────────────────────────────────────────────

// Winding the clock back cannot revive a finished preview, because the dates
// are the server's and `resolve` compares against the corrected clock the
// provider supplies. Here that is expressed directly: an earlier `now` against
// a consumed, finished row never yields Pro.
const finished = fromRow(
  row({ startedAt: T0 - 30 * DAY_MS, endsAt: T0 - 23 * DAY_MS, consumed: true }),
);
assert.equal(resolve(finished, T0).state, "expired");
assert.equal(
  resolve(finished, T0 - 25 * DAY_MS).state,
  "pro_preview",
  "The rules are a pure function of the clock they are given…",
);
assert.equal(
  can(resolve(finished, T0), "advanced-trends"),
  false,
  "…and the clock the app gives them is server-corrected and monotonic",
);

// ── Free access after expiry ────────────────────────────────────────────────

const expired = resolve(rec, T0 + 8 * DAY_MS);
assert.equal(expired.pro, false);
for (const f of [
  "advanced-trends",
  "muscle-comparison",
  "deep-ranking",
  "premium-share",
  "routine-tools",
])
  assert.equal(can(expired, f), false, `${f} closes when the preview ends`);

const live = resolve(rec, T0 + DAY_MS);
for (const f of ["advanced-trends", "premium-share"])
  assert.equal(can(live, f), true, `${f} is open during the preview`);

// ── What the Plan row says, and what it offers ──────────────────────────────

assert.equal(planLabel(resolve(null, T0)), "Free");
assert.equal(planLabel(resolve(rec, T0 + DAY_MS)), "Pro preview · 6 days left");
assert.equal(planLabel(resolve(rec, T0 + 8 * DAY_MS)), "Free · Pro preview used");
assert.equal(
  planLabel(resolve(subscriber, T0 + DAY_MS), T0).startsWith("Pro · Renews"),
  true,
  "A dated subscription names its renewal date",
);
assert.equal(
  planLabel(resolve(openEnded, T0), T0),
  "Lifetime Pro",
  "A lifetime unlock says so, rather than reading as a renewing plan",
);

assert.equal(
  hasRenewingSubscription(resolve(subscriber, T0 + DAY_MS)),
  true,
  "A dated subscription is the one thing with something to cancel",
);
assert.equal(
  hasRenewingSubscription(resolve(openEnded, T0)),
  false,
  "A lifetime unlock renews nothing, so it is never offered a cancel",
);
assert.equal(
  hasRenewingSubscription(resolve(rec, T0 + DAY_MS)),
  false,
  "A preview charges nothing and so has nothing to cancel either",
);
assert.equal(hasRenewingSubscription(resolve(null, T0)), false);

// ── The summary on the expiry screen ────────────────────────────────────────

const end = T0 + 7 * DAY_MS;
const history = [
  workout("before", T0 - 10 * DAY_MS, { weight: 60 }),
  workout("in-1", T0 + DAY_MS, { weight: 100 }),
  workout("in-2", T0 + 2 * DAY_MS, { exerciseId: "squat", weight: 140 }),
  workout("skipped", T0 + 3 * DAY_MS, { done: false, skipped: true }),
  workout("after", end + DAY_MS, { weight: 200 }),
];
const sum = previewSummary(history, T0, end, end);
assert.equal(sum.workouts, 2, "Only qualifying workouts inside the window count");
assert.equal(sum.trainingMs, 2 * HOUR, "Training time sums each session's own span");
// Records are the ones that *still stand* from that week. `after` is a heavier
// bench later on, so bench's all-time best has moved outside the window and only
// the squat is left. At the moment the expiry screen actually appears there is
// no "after" yet, so the two readings agree in practice.
assert.equal(sum.records, 1, "A record beaten later no longer belongs to the week");
const atExpiry = previewSummary(history.slice(0, 4), T0, end, end);
assert.equal(atExpiry.records, 2, "Both records set during the week are counted");
assert.equal(atExpiry.workouts, 2, "…over the same two qualifying workouts");

const emptySum = previewSummary([], T0, end, end);
assert.deepEqual(
  emptySum,
  { workouts: 0, streak: 0, records: 0, trainingMs: 0 },
  "A week with nothing in it returns zeroes rather than undefined",
);

// A workout left open overnight must not be reported as fourteen hours of
// training; the span is dropped rather than the workout being hidden.
const marathon = [workout("long", T0 + DAY_MS, { startedAt: T0 + DAY_MS - 14 * HOUR })];
const longSum = previewSummary(marathon, T0, end, end);
assert.equal(longSum.workouts, 1, "The workout still counts");
assert.equal(longSum.trainingMs, 0, "…but an implausible span contributes no time");

// ── Row parsing ─────────────────────────────────────────────────────────────

assert.equal(fromRow(null), null, "No row parses to nothing");
const junk = fromRow({
  pro_preview_consumed: "yes",
  subscription_status: "banana",
  entitlement_source: "nonsense",
});
assert.equal(junk.proPreviewConsumed, false, "Only a real boolean consumes a preview");
assert.equal(junk.subscriptionStatus, "none", "An unknown status falls back to none");
assert.equal(junk.entitlementSource, "free", "An unknown source falls back to free");

// ── Where a locked control sends people ────────────────────────────────────

const free = resolve(null, T0);
const done = expired;
const paying = resolve(subscriber, T0 + DAY_MS);

assert.equal(
  gateDestination({ ent: free, signedIn: false, hasQualifyingWorkout: false }),
  "invite-guest",
  "A guest is offered the preview, not a price list",
);
assert.equal(
  gateDestination({ ent: free, signedIn: false, hasQualifyingWorkout: true }),
  "invite-guest",
  "Local workouts do not change that — the preview needs an account to live on",
);
assert.equal(
  gateDestination({ ent: free, signedIn: true, hasQualifyingWorkout: false }),
  "invite-workout",
  "Signed in with nothing logged: say what starts the preview",
);
assert.equal(
  gateDestination({ ent: free, signedIn: true, hasQualifyingWorkout: true }),
  "paywall",
  "Eligible and already training — the preview is starting; prices are the fallback",
);
assert.equal(
  gateDestination({ ent: done, signedIn: true, hasQualifyingWorkout: true }),
  "paywall",
  "A spent preview goes straight to prices",
);
assert.equal(
  gateDestination({ ent: done, signedIn: false, hasQualifyingWorkout: false }),
  "paywall",
  "Consumed is consumed, whatever the session state says",
);
assert.equal(
  gateDestination({ ent: live, signedIn: true, hasQualifyingWorkout: true }),
  "none",
  "A preview user has nothing locked, so nothing opens",
);
assert.equal(
  gateDestination({ ent: paying, signedIn: true, hasQualifyingWorkout: true }),
  "none",
  "A subscriber is never shown an invitation",
);

// ── Cancelled keeps what it paid for ───────────────────────────────────────

const cancelled = fromRow(
  row({ consumed: true, status: "cancelled", subExpires: T0 + 10 * DAY_MS }),
);
assert.equal(
  resolve(cancelled, T0).state,
  "subscribed",
  "Cancelling does not end the period already paid for",
);
assert.equal(can(resolve(cancelled, T0), "premium-share"), true);
assert.equal(
  planLabel(resolve(cancelled, T0), T0),
  `Pro · Available until ${shortDate(T0 + 10 * DAY_MS, T0)}`,
  "…and the row says so rather than claiming a renewal",
);
assert.equal(
  resolve(cancelled, T0 + 11 * DAY_MS).state,
  "expired",
  "Once the paid period is over it is over",
);
assert.equal(
  planLabel(resolve(subscriber, T0), T0),
  `Pro · Renews ${shortDate(T0 + 30 * DAY_MS, T0)}`,
);
assert.equal(planLabel(resolve(openEnded, T0), T0), "Lifetime Pro");

// ── Countdown wording ──────────────────────────────────────────────────────

assert.equal(endsIn(3 * DAY_MS), "in 3 days");
assert.equal(endsIn(23 * HOUR), "in 23 hours");
assert.equal(endsIn(90 * 60_000), "in 1 hour");
assert.equal(endsIn(9 * 60_000), "in 9 minutes");
assert.equal(
  endsIn(20_000),
  "in under a minute",
  "The last minute never rounds up to an hour or a day",
);
assert.equal(
  endsIn(23 * HOUR).includes("tomorrow"),
  false,
  "'Ends tomorrow' is never said on behalf of the whole final day",
);

// ── The matrix only contains things that exist ─────────────────────────────

const proKeys = Object.keys(PRO_FEATURES);
assert.deepEqual(
  proKeys.sort(),
  ["premium-share", "progress-windows", "trend-periods"],
  "Every gated capability is one that is actually built",
);
for (const k of Object.keys(FUTURE_FEATURES))
  assert.equal(
    proKeys.includes(k),
    false,
    `${k} is unfinished and must not be gateable or sellable`,
  );
for (const b of PRO_BENEFITS)
  assert.equal(
    // `start-workout` is the one benefit that is not a `ProFeature`: it is
    // gated by `canStartWorkout`, which lets an un-previewed account through so
    // the preview stays reachable. Everything else must be a real matrix key.
    proKeys.includes(b.feature) || b.feature === "start-workout",
    true,
    `The paywall must not advertise ${b.feature}, which nothing gates`,
  );
assert.equal(PRO_BENEFITS.length <= 3, true, "At most three benefits");

// Free access survives expiry for everything on the free list, and every Pro
// key closes. Data is never in either list — records are not a feature.
for (const k of proKeys) {
  assert.equal(can(live, k), true, `${k} is open during the preview`);
  assert.equal(can(done, k), false, `${k} closes when the preview ends`);
  assert.equal(can(paying, k), true, `${k} is open to a subscriber`);
}

// ── Who may start a workout ────────────────────────────────────────────────

// The rule must not be `ent.pro`: a signed-in user who has never previewed is
// not Pro, and blocking them would make the preview impossible to ever reach.
assert.equal(free.pro, false);
assert.equal(
  writeAllowedByPlan(free),
  true,
  "…which is exactly why this is a separate rule from `can`",
);

// Everything already recorded stays reachable in every state. Nothing about
// entitlement touches stored data, and the free list must not claim otherwise.
assert.equal(
  FREE_FEATURES.some((f) => /history/i.test(f)),
  true,
  "History is promised free in both states",
);

// Nothing on the free list may name a capability this repository does not have.
// "Rest timer" sat here for a while and the app has never had one.
const tracked = require("node:child_process")
  .execSync("git ls-files src", { encoding: "utf8" })
  .split("\n")
  .map((f) => f.trim())
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
/*
 * Comments are stripped before the search.
 *
 * The guard is about what the app *says*, and a comment is not something a
 * user can read. Leaving them in meant the note in `entitlement.ts` recording
 * that a rest timer was removed tripped the very check that records it — a
 * rule that fails on its own documentation, and which only surfaced once that
 * file became tracked, because `git ls-files` cannot see what is not.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const sourceTree = tracked
  .map((f) => stripComments(fs.readFileSync(f, "utf8")))
  .join("\n")
  .toLowerCase();
assert.equal(
  sourceTree.includes("rest timer"),
  false,
  "A rest timer is still being named somewhere, and none exists",
);

// Writing is the whole free/paid line now: reading is always open, and every
// action — a workout, a weigh-in, a routine, an export of a card — follows the
// one rule rather than each screen inventing its own.
assert.equal(canWrite, canStartWorkout, "Starting a workout is just a write");

// The rule, tested on its own so it stays correct while disarmed.
for (const [label, ent, expected] of [
  ["signed out / never previewed", free, true],
  ["inside the preview", live, true],
  ["subscriber", paying, true],
  ["cancelled but still paid up", resolve(cancelled, T0), true],
  ["preview spent", done, false],
])
  assert.equal(writeAllowedByPlan(ent), expected, `the rule — ${label}`);

// And what actually ships, which depends on the switch.
for (const ent of [free, live, paying, done])
  assert.equal(
    canWrite(ent),
    LOCKOUT_ARMED ? writeAllowedByPlan(ent) : true,
    "canWrite applies the rule only while the lockout is armed",
  );

/*
 * The switch has to carry the copy with it, or the app sells something it is
 * not withholding. Disarmed: logging is free and must be listed as such, and
 * the paywall must not claim to sell it. Armed: the reverse.
 */
if (LOCKOUT_ARMED) {
  assert.equal(
    FREE_FEATURES.some((f) => /logging/i.test(f)),
    false,
    "Armed: the free list cannot advertise the thing being sold",
  );
  assert.equal(
    PRO_BENEFITS.some((b) => b.feature === "start-workout"),
    true,
    "Armed: training is the headline benefit",
  );
} else {
  assert.equal(
    FREE_FEATURES.some((f) => /logging/i.test(f)),
    true,
    "Disarmed: logging is free, so the free list says so",
  );
  assert.equal(
    PRO_BENEFITS.some((b) => b.feature === "start-workout"),
    false,
    "Disarmed: the paywall must not sell what nobody is stopped from doing",
  );
}

// Nothing about entitlement may reach the data itself. These stay true in every
// state, including expired, because they are rights rather than features.
assert.equal(
  FREE_FEATURES.some((f) => /export|deletion/i.test(f)),
  true,
  "Export and deletion are promised free and must stay that way",
);
assert.equal(
  FREE_FEATURES.some((f) => /read|history/i.test(f)),
  true,
  "…as does reading back everything already recorded",
);

// ── Prices, and the comparisons derived from them ──────────────────────────

const {
  PLANS,
  monthlyEquivalent,
  listPrice,
  savePercent,
} = require("../src/lib/plans.ts");

const plan = (id) => PLANS.find((p) => p.id === id);
const inr = (id) => listPrice(plan(id));

assert.equal(inr("monthly").text, "₹250");
assert.equal(inr("yearly").text, "₹1,800");
assert.equal(inr("lifetime").text, "₹3,000");
assert.equal(
  savePercent(inr("monthly"), inr("yearly")),
  40,
  "12 × ₹250 against ₹1,800 really is 40% — the claim is computed, not typed",
);
assert.match(
  monthlyEquivalent(inr("yearly")),
  /150/,
  "₹1,800 a year is ₹150 a month",
);

// Store prices win, and the comparisons follow them rather than the fallback.
const usdMonthly = { text: "$4.99", amount: 4.99, currency: "USD" };
const usdYearly = { text: "$29.99", amount: 29.99, currency: "USD" };
assert.equal(savePercent(usdMonthly, usdYearly), 50);
assert.match(monthlyEquivalent(usdYearly), /2\.50|2,50/);

// And go quiet rather than guessing when they cannot be compared.
assert.equal(
  savePercent({ text: "$4.99" }, usdYearly),
  null,
  "No amount means no saving claim",
);
assert.equal(
  savePercent({ text: "€4.99", amount: 4.99, currency: "EUR" }, usdYearly),
  null,
  "Two currencies are an exchange rate question, not a discount",
);
assert.equal(
  monthlyEquivalent({ text: "$29.99", amount: 29.99 }),
  null,
  "No currency means no monthly equivalent",
);
assert.equal(
  savePercent(usdMonthly, { text: "$59.99", amount: 59.99, currency: "USD" }),
  null,
  "A yearly plan that saves nothing makes no claim",
);

/*
 * A price the store has not given is a price the screen does not have.
 *
 * The paywall passes null straight through from an unanswered store, so every
 * helper downstream has to treat it as "nothing to say" rather than throw or,
 * worse, quietly fall back to rupees for a buyer who does not pay in them.
 */
const { priceLine } = require("../src/lib/plans.ts");
assert.equal(priceLine(plan("monthly"), null), null);
assert.equal(priceLine(plan("lifetime"), null), null);
assert.equal(priceLine(plan("monthly"), usdMonthly), "$4.99/month");
assert.equal(priceLine(plan("lifetime"), usdMonthly), "$4.99");
assert.equal(savePercent(null, usdYearly), null);
assert.equal(savePercent(usdMonthly, null), null);
assert.equal(monthlyEquivalent(null), null);

/*
 * And the list price stays out of the shipped paywall entirely: it is a
 * reference figure, so the only place allowed to reach for it is the
 * development branch.
 */
const paywall = fs.readFileSync("src/components/Paywall.tsx", "utf8");
assert.match(
  paywall,
  /import\.meta\.env\.DEV \? listPrice\(p\) : null/,
  "The rupee list price may only stand in during development",
);

// ── Analytics carry nothing personal ───────────────────────────────────────

const analytics = fs.readFileSync("src/lib/analytics.ts", "utf8");
for (const forbidden of ["email", "name", "note", "exercise", "workoutId", "userId"])
  assert.equal(
    new RegExp(`\b${forbidden}\??:`, "i").test(analytics),
    false,
    `The analytics payload must have no ${forbidden} field for anything to put data in`,
  );
assert.match(
  analytics,
  /feature\?:|state\?:|plan\?:|platform\?:/,
  "…only the safe enumerated fields",
);

console.log(
  "Pro preview: qualification, span, boundaries, countdown wording, gate routing, cancellation, matrix, prices and analytics safety passed.",
);
