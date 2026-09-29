import { personalRecords, qualifiesForStreak, streakSummary } from "./stats";
import type { Session } from "../types";
import { localDate } from "./util";

/**
 * Who is allowed what, worked out in one place.
 *
 * Everything here is a pure function of a server row and a timestamp, so the
 * rules can be tested without a browser, an account or a network — see
 * `scripts/check-entitlement.cjs`. The provider in `useEntitlement.tsx` does
 * the fetching, caching and clock correction and then asks these questions.
 *
 * The reason the logic lives apart from the React is the instruction that
 * matters most here: no date arithmetic scattered through components. A screen
 * asks `ent.can("advanced-trends")` and never learns what a preview is.
 */

export const PREVIEW_DAYS = 7;

/**
 * Whether the free tier's write lockout is armed.
 *
 * Armed: once the preview week is spent and there is no subscription, a new
 * workout cannot be started. Everything already recorded stays open to read.
 *
 * Only the Android build can take a payment today (Play Billing); the web and
 * iOS builds run `Unconfigured`, so a lapsed preview there meets the wall
 * without a checkout behind it until those stores are wired. The owner chose
 * the lockout knowing that.
 *
 * It drives the gate, the paywall's benefit list and the free-features list
 * together, so this one switch keeps all three honest at once.
 */
export const LOCKOUT_ARMED = true;
export const DAY_MS = 86_400_000;

export type EntitlementState = "free" | "pro_preview" | "subscribed" | "expired";

/** Why access was granted, in the server's own vocabulary. */
export type EntitlementSource = "free" | "pro_preview" | "subscription";

/**
 * `cancelled` is not `expired`. Somebody who turns off renewal has paid for the
 * period they are in and keeps Pro until it ends — taking it away the moment
 * they cancel would be charging for time and then not giving it.
 */
export type SubscriptionStatus = "none" | "active" | "cancelled" | "expired";

/**
 * The server row, in the app's casing.
 *
 * Postgres holds these as snake_case timestamptz, which is that schema's
 * convention; the app holds epoch milliseconds in camelCase, which is this
 * codebase's. `fromRow` is the single seam between the two.
 */
export type ProRecord = {
  proPreviewStartedAt: number | null;
  proPreviewEndsAt: number | null;
  proPreviewConsumed: boolean;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: number | null;
  entitlementSource: EntitlementSource;
};

/**
 * The feature matrix. One table, and the only place the split is decided.
 *
 * Every key here is a capability that is *built and reachable today*. Defining
 * a key does not make a feature exist, and a paywall that lists things the app
 * cannot do is a lie told to somebody about to pay — so the unfinished ideas
 * live in `FUTURE_FEATURES` below, outside the matrix, where nothing can
 * accidentally advertise them.
 */
export const PRO_FEATURES = {
  /** The 90-day and one-year windows on the Progress curve. */
  "progress-windows": "90-day and one-year progress views",
  /** Cycling the Strength trend callout past its default week. */
  "trend-periods": "Month and year strength comparisons",
  /** The share templates marked Pro, and the photo/overlay editor. */
  "premium-share": "Premium share templates and photo editing",
} as const;

export type ProFeature = keyof typeof PRO_FEATURES;

/**
 * What a gate can be opened about.
 *
 * `start-workout` is not a `PRO_FEATURES` key on purpose — it follows
 * `canWrite` rather than `can`, for the reason spelled out on that function —
 * but it still has to be nameable when routing and reporting, so it joins the
 * vocabulary here rather than widening the matrix.
 */
export type GateSubject = ProFeature | "start-workout";

/**
 * Ideas that are not built.
 *
 * Deliberately a separate object with no `ProFeature` type attached, so it is
 * impossible to gate on one by accident and impossible to render one in the
 * benefits list. When one of these ships it moves up into `PRO_FEATURES` and
 * gets a gate; until then the app must not mention it.
 */
export const FUTURE_FEATURES = {
  "muscle-comparison": "Detailed muscle-level comparisons",
  "deep-ranking": "Ranking analysis beyond your current rank",
  "routine-tools": "Advanced routine tools",
} as const;

/**
 * What never costs anything, in the order somebody would want to read it.
 *
 * This is the promise the expiry screen and the paywall both make, so it is
 * written once and shown from both rather than retyped into each.
 *
 * Note what is *not* on it any more. Starting a new workout used to be the
 * first line, and once the preview ends it is not free, so it cannot be listed
 * as such — a "what stays free" list that includes the one thing being sold is
 * the most damaging kind of wrong. Everything already recorded stays open, and
 * that is the line the list leads with instead.
 *
 * "Rest timer" was on here too, and the app has never had one. Every entry must
 * be checkable against something that exists in this repository; a free list is
 * as much a promise as a paid one, and an imaginary line in it is a claim the
 * app cannot honour.
 */
export const FREE_FEATURES: readonly string[] = LOCKOUT_ARMED
  ? [
      "Read all your workout history",
      "Your body chart and current ranks",
      "Progress charts and personal records",
      "Data export and account deletion",
    ]
  : [
      // With the lockout disarmed, logging really is free, and the list has to
      // say so. A "what stays free" list is a promise either way round.
      "Unlimited workout logging",
      "All your workout history",
      "Your body chart and current ranks",
      "Progress charts and personal records",
      "Data export and account deletion",
    ];

/**
 * The three things Pro actually does, for the top of the paywall.
 *
 * Each maps to a `ProFeature` that is gated somewhere real. The draft copy also
 * offered muscle-level and ranking insight; neither is built, so neither is
 * sold here.
 */
type Benefit = {
  feature: ProFeature | "start-workout";
  title: string;
  body: string;
};

/**
 * The three things Pro does, and only things it really does.
 *
 * The list follows `LOCKOUT_ARMED`, because the largest benefit only exists
 * when the lockout does. Selling "keep training with it" while everybody can
 * train for free would be the rest-timer mistake again, in the one place where
 * it costs money rather than credibility.
 */
export const PRO_BENEFITS: Benefit[] = [
  ...(LOCKOUT_ARMED
    ? [
        {
          // Not a `ProFeature` — see `writeAllowedByPlan` for why the rule
          // differs — but it leads because it is the largest thing being
          // bought, and a paywall that opens on chart ranges while quietly
          // selling the ability to train would bury its own headline.
          feature: "start-workout" as const,
          title: "Keep training with it",
          body: "Start workouts, log weigh-ins, build routines. Free reads your history; Pro is what adds to it.",
        },
      ]
    : [
        {
          feature: "trend-periods" as const,
          title: "Understand your training",
          body: "See how each ranking lift has moved over a month or a year, not only this week.",
        },
      ]),
  {
    feature: "progress-windows",
    title: "See what's improving",
    body: "Compare strength across 90-day and one-year windows, not just the last month.",
  },
  {
    feature: "premium-share",
    title: "Make progress worth sharing",
    body: "Premium share templates, plus photo and overlay editing on your cards.",
  },
];

export type Entitlement = {
  state: EntitlementState;
  /** The short question. True for a preview and for a paid subscription alike. */
  pro: boolean;
  source: EntitlementSource;
  previewStartedAt: number | null;
  previewEndsAt: number | null;
  /** Whether this account has ever had its one preview. */
  previewConsumed: boolean;
  /** Milliseconds of preview left, floored at zero. */
  msRemaining: number;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: number | null;
};

const ms = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/** A row as `get_entitlement()` returns it, turned into the app's shape. */
export function fromRow(row: Record<string, unknown> | null): ProRecord | null {
  if (!row) return null;
  const status = String(row.subscription_status ?? "none");
  const source = String(row.entitlement_source ?? "free");
  return {
    proPreviewStartedAt: ms(row.pro_preview_started_at),
    proPreviewEndsAt: ms(row.pro_preview_ends_at),
    proPreviewConsumed: row.pro_preview_consumed === true,
    subscriptionStatus: (["none", "active", "cancelled", "expired"].includes(status)
      ? status
      : "none") as SubscriptionStatus,
    subscriptionExpiresAt: ms(row.subscription_expires_at),
    entitlementSource: (["free", "pro_preview", "subscription"].includes(source)
      ? source
      : "free") as EntitlementSource,
  };
}

export const FREE: Entitlement = {
  state: "free",
  pro: false,
  source: "free",
  previewStartedAt: null,
  previewEndsAt: null,
  previewConsumed: false,
  msRemaining: 0,
  subscriptionStatus: "none",
  subscriptionExpiresAt: null,
};

/**
 * The whole state machine.
 *
 * Order matters. A paying subscriber is checked first and never sees a preview
 * state, even if their preview row is still inside its seven days — which is
 * the case for anyone who subscribed part way through one.
 */
export function resolve(record: ProRecord | null, now: number): Entitlement {
  if (!record) return FREE;

  const subLive =
    (record.subscriptionStatus === "active" ||
      record.subscriptionStatus === "cancelled") &&
    (record.subscriptionExpiresAt === null ||
      record.subscriptionExpiresAt > now);

  if (subLive)
    return {
      state: "subscribed",
      pro: true,
      source: "subscription",
      previewStartedAt: record.proPreviewStartedAt,
      previewEndsAt: record.proPreviewEndsAt,
      previewConsumed: record.proPreviewConsumed,
      msRemaining: 0,
      subscriptionStatus: record.subscriptionStatus,
      subscriptionExpiresAt: record.subscriptionExpiresAt,
    };

  const ends = record.proPreviewEndsAt;
  const left = ends === null ? 0 : ends - now;
  const inPreview = ends !== null && left > 0;

  return {
    state: inPreview ? "pro_preview" : record.proPreviewConsumed ? "expired" : "free",
    pro: inPreview,
    source: inPreview ? "pro_preview" : "free",
    previewStartedAt: record.proPreviewStartedAt,
    previewEndsAt: ends,
    previewConsumed: record.proPreviewConsumed,
    msRemaining: Math.max(0, left),
    subscriptionStatus: record.subscriptionStatus,
    subscriptionExpiresAt: record.subscriptionExpiresAt,
  };
}

/**
 * Whether a feature is open.
 *
 * Every access decision in the app comes through here. Components never compare
 * dates, never look at `previewEndsAt`, and never ask whether somebody is
 * subscribed — they name a capability and are told yes or no.
 */
export function can(ent: Entitlement, _feature: ProFeature): boolean {
  return ent.pro;
}

/**
 * How long is left, in words, without ever overstating it.
 *
 * The rule that matters is the one about not saying "1 day" when minutes
 * remain, and it is kept by switching units rather than by how the number is
 * rounded: under a day this counts hours, under an hour minutes, and the last
 * minute says so rather than showing a zero. Nothing short of a day can reach
 * the days branch at all.
 *
 * Above a day it rounds to the nearest rather than flooring. Flooring reads as
 * a bug at every boundary — a preview one day into seven has 5.999 days left
 * and would announce "5 days", losing a day the user still has.
 */
export function formatRemaining(msLeft: number): string {
  if (msLeft <= 0) return "Ended";
  const mins = Math.floor(msLeft / 60_000);
  if (mins < 1) return "Less than a minute left";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} left`;
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const days = Math.round(msLeft / DAY_MS);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

/**
 * What the Plan row says, in one place so the row and the sheet it opens can
 * never disagree about which plan somebody is on.
 */
export function planLabel(ent: Entitlement, now = Date.now()): string {
  if (ent.state === "subscribed") {
    if (ent.subscriptionExpiresAt === null) return "Lifetime Pro";
    const on = shortDate(ent.subscriptionExpiresAt, now);
    // Cancelled is still paid-for time. Saying "Renews" would be wrong, and
    // saying "Expired" would be worse — "available until" is the true one.
    return ent.subscriptionStatus === "cancelled"
      ? `Pro · Available until ${on}`
      : `Pro · Renews ${on}`;
  }
  if (ent.state === "pro_preview")
    return `Pro preview · ${formatRemaining(ent.msRemaining)}`;
  if (ent.state === "expired") return "Free · Pro preview used";
  return "Free";
}

/**
 * A date in the form the plan row wants: "24 Sep", and the year too when it is
 * not this one, because "24 Sep" on a lifetime-adjacent annual plan could mean
 * either of two years.
 */
export function shortDate(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return localDate(d, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Whether there is a renewing subscription behind this — which is to say,
 * whether there is anything to cancel.
 *
 * An expiry date is what separates the two kinds of Pro. A monthly or yearly
 * plan carries one and will bill again; the lifetime unlock has none, renews
 * nothing, and offering to "cancel" it would be offering to take something
 * away for no reason.
 */
export function hasRenewingSubscription(ent: Entitlement): boolean {
  return ent.state === "subscribed" && ent.subscriptionExpiresAt !== null;
}

/**
 * "in 11 hours", "in 3 minutes", "in under a minute".
 *
 * The final-day notice used to say "ends tomorrow" for the whole last day,
 * which is true at hour 23 and a lie at minute 3 — somebody reading it with ten
 * minutes left was being told they had until the morning. Same unit ladder as
 * `formatRemaining`, phrased to sit inside a sentence.
 */
export function endsIn(msLeft: number): string {
  if (msLeft <= 0) return "now";
  const mins = Math.floor(msLeft / 60_000);
  if (mins < 1) return "in under a minute";
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(msLeft / DAY_MS);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Whether this account may change anything at all.
 *
 * The free tier reads; it does not write. All four tabs stay open and every
 * record stays legible, but starting a workout, logging a weigh-in, editing a
 * routine, adding an exercise and exporting a card are all actions, and an
 * action is what Pro buys.
 *
 * Deliberately not a `ProFeature`, because it does not follow the Pro rule. The
 * Pro rule is "are you Pro"; this one is "have you spent your preview", and the
 * two differ for exactly the population that matters most — somebody signed in
 * who has never previewed. They are not Pro, and they must be able to log,
 * because completing a workout is what starts their preview. Gate them on
 * `ent.pro` and the preview becomes unreachable for everyone who installs the
 * app.
 *
 * Signed out resolves to `free` and so is never blocked: an install with no
 * account works normally, which is both the kinder first run and the safer one
 * to put in front of a store reviewer.
 *
 * Only `expired` — preview spent, nothing paying — is stopped.
 *
 * Two things this must never cover, whatever else is gated:
 *
 *   · exporting a backup, erasing data and deleting the account. Those are the
 *     user's rights over their own records, not features, and charging for the
 *     exit is both wrong and a fast way to fail a store review.
 *   · finishing a workout that is already running. A preview that lapses
 *     mid-session must not cost somebody the sets they have logged since.
 */
export function writeAllowedByPlan(ent: Entitlement): boolean {
  return ent.state !== "expired";
}

/**
 * The question every action actually asks.
 *
 * Kept separate from the rule above so the rule stays testable on its own while
 * the switch decides whether it is applied at all.
 */
export function canWrite(ent: Entitlement): boolean {
  return LOCKOUT_ARMED ? writeAllowedByPlan(ent) : true;
}

/** Reads better at the call site, and is the same question. */
export const canStartWorkout = canWrite;

/** The last 24 hours, which is when the one closing notice belongs. */
export function isFinalDay(ent: Entitlement): boolean {
  return (
    ent.state === "pro_preview" &&
    ent.msRemaining > 0 &&
    ent.msRemaining <= DAY_MS
  );
}

/**
 * Whether anything in this history would start a preview.
 *
 * The same test the streak uses — a finished workout carrying at least one set
 * that was logged rather than skipped — so "qualifying" means one thing in this
 * app rather than two subtly different things.
 */
export function hasQualifyingWorkout(sessions: Session[]): boolean {
  return sessions.some(
    (x) =>
      typeof x.endedAt === "number" &&
      Number.isFinite(x.endedAt) &&
      x.endedAt > 0 &&
      qualifiesForStreak(x),
  );
}

/**
 * What the preview week actually contained.
 *
 * Only figures this app can stand behind: every one is counted from workouts
 * that were finished, and a window with nothing in it returns zeroes rather
 * than being left undefined — the expiry screen decides what to do about a
 * zero, and it should not also have to decide what to do about a `null`.
 *
 * `records` counts the lifts whose all-time best was set inside the window and
 * still stands. At the moment this screen appears there is nothing after the
 * window yet, so that is simply "records set during the preview"; read months
 * later it quietly means "records from that week you have not beaten since",
 * which is the more useful of the two readings anyway.
 *
 * `trainingMs` sums each session's own start-to-finish, so a workout left open
 * overnight is not silently counted as fourteen hours of training: the same
 * clamp the rest of the app uses is applied by `sessionElapsed`, and here a
 * session that reports a negative or absurd span contributes nothing.
 */
export type PreviewSummary = {
  workouts: number;
  streak: number;
  records: number;
  trainingMs: number;
};

/** A session that ran longer than this was almost certainly left open. */
const MAX_SESSION_MS = 6 * 60 * 60 * 1000;

export function previewSummary(
  sessions: Session[],
  start: number | null,
  end: number | null,
  now: number,
): PreviewSummary {
  const from = start ?? 0;
  const to = end ?? now;
  const inWindow = sessions.filter(
    (s) =>
      typeof s.endedAt === "number" &&
      Number.isFinite(s.endedAt) &&
      s.endedAt >= from &&
      s.endedAt <= to &&
      qualifiesForStreak(s),
  );

  let trainingMs = 0;
  for (const s of inWindow) {
    const span = (s.endedAt as number) - s.startedAt;
    if (span > 0 && span <= MAX_SESSION_MS) trainingMs += span;
  }

  let records = 0;
  for (const pr of personalRecords(sessions).values())
    if (pr.at >= from && pr.at <= to) records++;

  return {
    workouts: inWindow.length,
    streak: streakSummary(sessions, now).current,
    records,
    trainingMs,
  };
}

/**
 * Where tapping a locked control should actually take somebody.
 *
 * The old behaviour sent everyone to prices, which was worst for the person
 * most likely to convert: a signed-out visitor was shown ₹1,800 without ever
 * being told that an account gives them a week of Pro for nothing. What they
 * need first is the offer, not the price list.
 *
 *   invite-guest    no account, preview unused — offer the account
 *   invite-workout  account, preview unused, nothing logged yet — say what
 *                   starts it, because the preview is not theirs to start here
 *   paywall         the preview is spent; prices are now the honest answer
 *   none            already Pro, so there was nothing to gate
 */
export type GateDestination =
  | "invite-guest"
  | "invite-workout"
  | "paywall"
  | "none";

export function gateDestination(opts: {
  ent: Entitlement;
  signedIn: boolean;
  hasQualifyingWorkout: boolean;
}): GateDestination {
  if (opts.ent.pro) return "none";
  if (opts.ent.previewConsumed) return "paywall";
  if (!opts.signedIn) return "invite-guest";
  return opts.hasQualifyingWorkout ? "paywall" : "invite-workout";
}
