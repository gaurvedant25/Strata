import { useEffect, useMemo, useState } from "react";
import { bodyCard } from "../lib/card/select";
import { BodyMap, type BodyView, type Callouts } from "../components/BodyMap";
import { drawnInView, groupsInView } from "../lib/anatomy/anchors";
import { LogBestSet } from "../components/LogBestSet";
import { ShareCardEditor } from "../components/ShareCardEditor";
import { RankIntroCard, useRankIntro } from "../components/RankIntroCard";
import { RankingGuide } from "../components/RankingGuide";
import { Numeral, resetNumerals } from "../components/Numeral";
import { Share, Tune } from "../components/icons";
import {
  BigNumber,
  Button,
  Empty,
  Eyebrow,
  Sheet,
  TextTabs,
  numInputCls,
} from "../components/ui";
import {
  BACK_GROUPS,
  benchmarkLift,
  liftTrend,
  nextPeriod,
  MUSCLE_LABEL,
  TIERS,
  TIER_COLOR,
  TIER_LEVEL,
  REGION_SECTIONS,
  bestNamed,
  computeMuscleScores,
  type MuscleGroup,
  type MuscleScore,
  type Tier,
  type TrendPeriod,
} from "../lib/strength";
import { personalRecords } from "../lib/stats";
import { fmtClock, num, parseKey, todayKey } from "../lib/util";
import { useStore } from "../store";
import { useEntitlement, useWriteGate } from "../lib/useEntitlement";
import type { GateSubject } from "../lib/entitlement";

/**
 * What the figure says about a region nothing has been logged against.
 *
 * A region with no scored lift has no numbers to annotate, but the figure
 * still has to answer the tap: one box, in the same frame the real callouts
 * use, saying why it is empty. Short lines because the box is a quarter of the
 * stage wide — the sentence naming the lift to log lives in the panel below,
 * where there is room for it.
 */
const NO_DATA: Callouts = {
  right: [
    { text: "No data", size: 11, weight: 600, dim: true },
    { text: "Log a lift", size: 11, weight: 600 },
  ],
};

const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The trend figure, for the box beside the figure.
 *
 * What used to sit there was a "Top 1%", interpolated out of a six-row table
 * of numbers that were simply written down — no lifter outside this phone was
 * ever counted for it. A percentage reads as evidence, so the strongest thing
 * on the screen was also the only invented one.
 *
 * This is a percentage the app can actually stand behind: the reader's own
 * estimated 1RM on the lift that ranks the region, first reading against
 * latest, inside a window they choose by tapping the box.
 *
 * A true minus sign rather than a hyphen, because the two sit beside a plus in
 * the same column and a hyphen is visibly shorter and lower than the bar of a
 * plus. Anything that rounds to nothing is "0%" without a sign: "+0.0%" claims
 * a direction the number does not have.
 */
function fmtChange(percent: number) {
  const r = Number(percent.toFixed(1));
  if (r === 0) return "0%";
  return `${r > 0 ? "+" : "−"}${Math.abs(r)}%`;
}

/** How the period reads aloud, where the box only has room for one word. */
const PERIOD_SPOKEN: Record<TrendPeriod, string> = {
  week: "the past 7 days",
  month: "the past 30 days",
  year: "the past 365 days",
};

/**
 * The tier dot. The only colour on the screen besides the figure itself.
 *
 * Colour is all it has, so on its own it says nothing to anyone who cannot
 * separate these hues or cannot see it at all. It carries its tier as text for
 * assistive technology; sighted readers get the same word spelled out in the
 * eyebrow beside it.
 */
function Dot({ score, size = 7 }: { score?: MuscleScore; size?: number }) {
  return (
    <span
      role="img"
      aria-label={score ? `${score.tier} tier` : "Not yet scored"}
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: score ? score.color : "var(--color-faint)",
        boxShadow: score ? `0 0 ${size + 3}px ${score.color}` : undefined,
      }}
    />
  );
}

/** The bar colour for a region with nothing logged against it yet. */
const UNSCORED = "var(--color-faint)";

/**
 * How far the selected region is up its current rung.
 *
 * It sits above the figure rather than in the panel below because it is the one
 * thing on this screen that is about the future: everything under the body map
 * reports what you have already lifted, and this says what is left. It also
 * answers the question the tier name alone provokes — "Platinum, and then?" —
 * so it reads best next to the figure whose colour raised the question.
 *
 * Three rows in seventy-four pixels: the rung you are on and the one above it,
 * how far along you are, and what it costs. The top row names both ranks, each
 * in its own tier colour, so the pair reads as a step rather than a label — the
 * muscle is not repeated here, since the panel below already carries its name.
 * The bar fills in the colour of the rank you hold: what has been filled in is
 * what you have earned, and the rank above is a destination, not a
 * measurement. Everything else is the white and grey the rest of the screen is
 * built from, and there is no glow, no gradient and no second card inside this
 * one.
 */
function RankProgress({
  score,
  muscle,
  unitLabel,
}: {
  score: MuscleScore;
  muscle: MuscleGroup;
  unitLabel: string;
}) {
  const next = score.next;
  // Titan is the top of the ladder, so the bar is full and the rank named is
  // the one already held. Rounding down below the top keeps a lifter from being
  // shown "100%" at a rank they have not reached.
  const pct = next ? Math.min(99, Math.floor(next.progress * 100)) : 100;

  /*
   * What is left, in the terms it is actually measured in.
   *
   * `remaining` is a gap in estimated 1RM — the region is scored on
   * `bestE1rm`, so the figure is how much that estimate has to rise, not how
   * much to put on the bar for a working set. Said as a bare weight it reads
   * as the latter, which is a promise the model never made: at five reps a
   * 14 kg gain in estimated 1RM is around 12 kg on the bar. So the lift on the
   * left carries "est. 1RM" and the weight on the right is only ever "to go".
   *
   * A hold is not closed by loading it, so it quotes the hold that reaches the
   * threshold instead of a difference.
   */
  const cost = !next
    ? "Top rank"
    : next.holdSeconds != null
      ? `${fmtClock(next.holdSeconds)} hold needed`
      : `${num(next.remaining ?? 0, 1)} ${unitLabel} to go`;

  return (
    <section className="mb-2.5 rounded-[15px] bg-card px-[13px] py-[10px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[0.8125rem] leading-none">
          <span style={{ color: score.color }}>{score.tier}</span>
          {/* An arrow only where there is somewhere to go. */}
          {next && (
            <>
              <span className="text-muted"> → </span>
              <span style={{ color: TIER_COLOR[next.tier] }}>{next.tier}</span>
            </>
          )}
        </span>
        <span className="shrink-0 font-mono text-[1.3125rem] font-semibold leading-none tracking-[-0.02em]">
          <Numeral id="home:next" text={String(pct)} delay={30} />
          <span className="text-[0.8125rem] font-medium text-muted">%</span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          next
            ? `${pct}% of the way from ${score.tier} to ${next.tier} in ${MUSCLE_LABEL[muscle]}`
            : `${MUSCLE_LABEL[muscle]} is at the top rank`
        }
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#2a2a2a]"
      >
        <div
          className="h-full rounded-full transition-[width] duration-[560ms] ease-settle"
          style={{
            // A sliver at the low end, so an early rung still reads as started
            // rather than as a region with nothing logged against it.
            width: `${Math.max(2, pct)}%`,
            background: score.color,
          }}
        />
      </div>

      {/* The lift the rank was read from, and what closing the gap costs. Wraps
          rather than crushes: a long exercise name truncates first, and at a
          larger text size the cost drops to its own line and the card grows
          with it. */}
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[0.75rem] leading-[1.4] text-muted">
        <span className="flex min-w-0 items-baseline">
          <span className="truncate text-fg">{score.lift}</span>
          {next?.remaining != null && (
            <span className="shrink-0">&nbsp;· est. 1RM</span>
          )}
        </span>
        <span className="shrink-0">{cost}</span>
      </div>
    </section>
  );
}

/**
 * The permanent way into the ranking explanation.
 *
 * The one-time card retires itself, so this is what is left: the question
 * "what is a Platinum?" does not stop being asked once somebody has dismissed
 * an introduction, and an explanation you can only ever see before you have
 * lifted anything is an explanation nobody reads. Quiet, and at the end of
 * whatever it follows, because it is a reference rather than a prompt.
 */
function GuideLink({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="press press-row flex min-h-11 w-full items-center justify-between gap-2.5 rounded-[9px] px-1 text-left"
    >
      <span className="text-[0.8125rem] text-muted">How rankings work</span>
      <span aria-hidden="true" className="font-mono text-[0.875rem] text-muted">
        &rsaquo;
      </span>
    </button>
  );
}

/**
 * A section's own tier: the average of the regions inside it.
 *
 * Averaging rather than taking the best, because a section is meant to say how
 * the whole of it is doing — one strong region should not speak for two weak
 * ones sitting next to it.
 *
 * Only scored regions are counted. An unscored one means nothing has been
 * logged for it, not that it is weak, and folding it in as the bottom rung
 * would let an untrained lift quietly drag down a section that is going fine.
 * This is a label on a list; the body map still colours every region by its
 * own score and is untouched by any of it.
 */
function averageTier(
  groups: MuscleGroup[],
  scores: Partial<Record<MuscleGroup, MuscleScore>>,
): Tier | null {
  const ranks = groups
    .map((g) => scores[g]?.tier)
    .filter((t): t is Tier => !!t);
  if (!ranks.length) return null;
  const mean = ranks.reduce((t, r) => t + TIERS.indexOf(r), 0) / ranks.length;
  return TIERS[Math.round(mean)];
}

/**
 * One row of the muscle-group list.
 *
 * A card rather than a hairline row, carrying its tier as a bar down the
 * leading edge — which is what lets a closed section still show something of
 * what is inside it, and what makes a list this long scannable by colour
 * before it is read.
 */
function Row({
  name,
  sub,
  tierText,
  tierColor,
  nameSize,
  nameColor,
  background,
  minHeight,
  indent,
  chevron,
  onClick,
}: {
  name: string;
  sub?: string | null;
  tierText?: string;
  tierColor: string;
  nameSize: number;
  nameColor: string;
  background: string;
  minHeight: number;
  indent?: boolean;
  /** Present on a section; rotates when it is open. */
  chevron?: "closed" | "open";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      // A child is inset from the leading edge only, but it still has to end
      // where its parent ends — the card behind it has a padding, and a row
      // running past it reads as a mistake rather than as a nesting.
      style={{
        minHeight,
        marginLeft: indent ? 22 : 0,
        width: indent ? "calc(100% - 22px)" : "100%",
        background,
      }}
      aria-expanded={chevron ? chevron === "open" : undefined}
      className="press press-row relative grid grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-2.5 overflow-hidden rounded-[9px] pl-4 pr-3 text-left"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: tierColor }}
      />
      <span className="flex min-w-0 flex-col gap-[5px] py-[11px]">
        <span
          className="truncate leading-[1.15]"
          style={{ fontSize: `${nameSize / 16}rem`, color: nameColor }}
        >
          {name}
        </span>
        {sub && (
          <span className="font-mono text-[0.6875rem] uppercase leading-none tracking-[0.16em] text-muted">
            {sub}
          </span>
        )}
      </span>
      <span
        className="whitespace-nowrap font-mono text-[0.6875rem] font-medium uppercase leading-none tracking-[0.16em]"
        style={{ color: tierColor }}
      >
        {tierText}
      </span>
      <span
        className="inline-block text-right font-mono text-[0.875rem] leading-none text-muted transition-transform duration-[180ms]"
        style={{
          transform: chevron === "open" ? "rotate(90deg)" : "rotate(0deg)",
        }}
      >
        {chevron ? "›" : ""}
      </span>
    </button>
  );
}

export function Home({
  onSettings,
  onUnlock,
}: {
  onSettings: () => void;
  /** Opens whichever of the invitation or the paywall this person needs. */
  onUnlock: (feature: GateSubject) => void;
}) {
  const s = useStore();
  const pro = useEntitlement();
  // Every action on this screen goes through one guard rather than each one
  // growing its own conditional.
  const { guard } = useWriteGate(() => onUnlock("start-workout"));
  const [bwOpen, setBwOpen] = useState(false);
  const [bw, setBw] = useState("");
  /**
   * The region being read, kept per side of the figure.
   *
   * One selection shared by both sides meant turning the figure round left the
   * chest selected while you were looking at a back: the panel went on
   * reporting a bench press, and the callout pointed its line at the spine.
   * Each side remembers what you last asked it, and answers with a region it
   * actually draws.
   */
  const [selected, setSelected] = useState<
    Record<BodyView, MuscleGroup | null>
  >({ front: null, back: null });
  const [view, setView] = useState<BodyView>("front");
  /** The region whose "no data" box was tapped, and so the one being scored. */
  const [logging, setLogging] = useState<MuscleGroup | null>(null);
  /** Whether the ranking explanation is up. Openable from two places. */
  const [guideOpen, setGuideOpen] = useState(false);
  /**
   * The window the trend callout is reading, cycled by tapping the box.
   *
   * Held here rather than beside the selection, so it survives turning the
   * figure and picking another muscle — someone comparing regions over a month
   * should not be dropped back to a week each time they tap a new one. It
   * starts at a week on every visit to the screen, which is the reading most
   * likely to answer "is what I did this week working".
   */
  const [period, setPeriod] = useState<TrendPeriod>("week");

  /*
   * The week is free; the month and the year are Pro.
   *
   * The callout is the first thing on the app's main screen, so gating it
   * outright would make a free account look broken. Gating the *comparison*
   * instead keeps the reading everyone gets — how this lift has moved lately —
   * and sells the longer view, which is what "period-over-period" actually
   * means. Tapping while free opens the gate rather than doing nothing.
   */
  const cycleTrend = () => {
    if (!pro.can("trend-periods")) {
      onUnlock("trend-periods");
      return;
    }
    setPeriod(nextPeriod);
  };
  const intro = useRankIntro();
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";

  const latestBw = s.bodyweight[s.bodyweight.length - 1];

  const scores = useMemo(
    () =>
      computeMuscleScores(
        s.sessions,
        s.exercises,
        latestBw?.weight ?? null,
        s.settings.gender,
      ),
    [s.sessions, s.exercises, latestBw?.weight, s.settings.gender],
  );

  /*
   * The body chart as share data. `scores` is already memoised above, so this
   * costs a few strings rather than a second pass over every session; the
   * cards themselves are drawn by the share editor once it is opened.
   */
  const bodyData = useMemo(
    () =>
      Object.keys(scores).length
        ? bodyCard(s.settings.gender, view, scores, unitLabel)
        : null,
    [scores, s.settings.gender, view, unitLabel],
  );
  const [sharing, setSharing] = useState(false);

  // Leaving the tab unmounts this screen; forgetting its figures means coming
  // back scrambles rather than rolling from the region shown last time.
  useEffect(() => () => resetNumerals("home:"), []);

  // What this side of the figure opens on, before anything is picked: its own
  // first scored region, or its first region at all.
  const shown = useMemo(
    () => groupsInView(s.settings.gender, view),
    [s.settings.gender, view],
  );
  const active =
    selected[view] ?? shown.find((m) => scores[m]) ?? shown[0] ?? "chest";
  const detail = scores[active];

  // Annotations on the figure: what the best set of the region's lift actually
  // was, and roughly where that sits. Absent until the region has been scored.
  //
  // Their values churn rather than roll, unlike the figures in the panel below.
  // A change of region tears these boxes down and draws them again with the
  // leader line, so there is nothing on screen for a value to travel from; a
  // roll also ran its whole course behind a box that was still opening, which
  // is why switching region looked like it animated nothing at all.
  /**
   * How the ranking lift has moved across the chosen window.
   *
   * Recomputed when the window changes, which is the point of the tap.
   */
  const trend = useMemo(
    () =>
      detail
        ? liftTrend(
            s.sessions,
            s.exercises,
            detail.lift,
            period,
            latestBw?.weight ?? null,
          )
        : null,
    [detail, s.sessions, s.exercises, period, latestBw?.weight],
  );

  const callouts: Callouts = useMemo(() => {
    if (!detail || !trend) return NO_DATA;
    const prs = personalRecords(s.sessions.filter((x) => x.endedAt));
    const pr = bestNamed(s.exercises, prs, detail.lift);
    if (!pr) return NO_DATA;
    return {
      left: [
        { text: detail.lift, size: 8, weight: 600, dim: true },
        {
          text: `${num(pr.heaviest)} × ${pr.heaviestReps}`,
          size: 14,
          weight: 500,
          tight: true,
          scramble: true,
        },
        {
          text: parseKey(pr.date).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          }),
          size: 8,
          weight: 600,
          dim: true,
        },
      ],
      right:
        trend.kind === "hold"
          ? [
              // A hold is scored from a stopwatch and has no estimated 1RM to
              // move, so this box reports that rather than a percentage of a
              // figure that was never estimated.
              {
                text: "Timed hold",
                size: 11,
                weight: 600,
                tight: true,
              },
              { text: "no 1RM", size: 8, weight: 600, dim: true },
            ]
          : trend.kind === "change"
            ? [
                {
                  text: fmtChange(trend.percent),
                  size: 14,
                  weight: 600,
                  tight: true,
                  scramble: true,
                },
                {
                  text: `est. 1RM · ${period}`,
                  size: 8,
                  weight: 600,
                  dim: true,
                },
              ]
            : [
                // Nothing to plot is not an error, and set in tracked capitals
                // over four lines it read like one. Two plain sentences: what
                // is missing, and the one thing that fixes it.
                {
                  text: "Not enough data",
                  size: 11,
                  weight: 600,
                  tight: true,
                  wrap: true,
                },
                {
                  text: "Log your workouts",
                  size: 11,
                  weight: 500,
                  tight: true,
                  wrap: true,
                  dim: true,
                },
              ],
    };
  }, [detail, trend, period, s.exercises, s.sessions]);

  /** What the trend box announces, since the lines inside it are fragments. */
  const trendLabel = !detail
    ? `Score ${MUSCLE_LABEL[active]} from your best set`
    : trend?.kind === "change"
      ? `${detail.lift} estimated one-rep max, ${
          Number(trend.percent.toFixed(1)) === 0
            ? "unchanged"
            : `${trend.percent > 0 ? "up" : "down"} ${Math.abs(
                Number(trend.percent.toFixed(1)),
              )} percent`
        } over ${PERIOD_SPOKEN[period]}. Activate to change the period.`
      : `${detail.lift} estimated one-rep max: not enough data over ${PERIOD_SPOKEN[period]}. Activate to change the period.`;

  // A section opens when it holds the selected region, so tapping a muscle on
  // the figure reveals it in the list rather than hiding it inside a heading.
  const activeSection = REGION_SECTIONS.find(
    (x) => x.kind === "group" && x.children.includes(active),
  );
  const [openIds, setOpenIds] = useState<string[]>(() =>
    activeSection && activeSection.kind === "group" ? [activeSection.id] : [],
  );
  const activeId =
    activeSection && activeSection.kind === "group" ? activeSection.id : null;
  useEffect(() => {
    if (activeId)
      setOpenIds((o) => (o.includes(activeId) ? o : [...o, activeId]));
  }, [activeId]);

  /** Selecting a region from the figure keeps the side you are looking at. */
  function pickOnFigure(m: MuscleGroup) {
    setSelected((o) => ({ ...o, [view]: m }));
  }

  /** Selecting a region from the list also spins the figure to the side that
   *  region is on — unless the side already showing draws it. */
  function pick(m: MuscleGroup) {
    const to: BodyView = drawnInView(s.settings.gender, view, m)
      ? view
      : BACK_GROUPS.includes(m)
        ? "back"
        : "front";
    setSelected((o) => ({ ...o, [to]: m }));
    setView(to);
    /*
     * And carries you back up to it.
     *
     * Everything a selection changes — the figure turning and relighting, the
     * callouts redrawing, the score and the lift behind it — is above the list
     * you pick it from, and the list is long enough that picking a leg muscle
     * happens with all of it off the top of the screen. Without this the tap
     * appeared to do nothing but tint one row.
     *
     * Smoothly, because the point is to show that the screen moved rather than
     * to teleport: a figure that is suddenly there does not read as the same
     * figure you were just looking at. Someone who has asked for less motion
     * gets it immediately instead.
     */
    window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
  }

  /*
   * Save the weigh-in — unless what was typed was not a weight.
   *
   * Every entry is offered to the server first, which answers yes or no and
   * keeps its reasons to itself. Almost always the answer is no and the number
   * is saved exactly as before; on the one value that is not a weight, the
   * entry is swallowed instead, leaving the body-weight history untouched.
   *
   * The check has to be server-side. A comparison written here would ship in
   * the bundle and in the APK, where minification hides nothing, and the
   * entitlement it grants is a row this client is not allowed to write anyway.
   *
   * It fails towards saving: an unreachable server, a refusal or a rate limit
   * all come back false, and a real weigh-in is never lost to a network
   * problem.
   */
  async function saveBw() {
    const raw = bw.replace(",", ".").trim();
    const v = parseFloat(raw);
    if (!isFinite(v) || v <= 0) return;
    if (await pro.redeem(raw)) {
      setBw("");
      setBwOpen(false);
      return;
    }
    await s.logBodyWeight(todayKey(), v);
    setBw("");
    setBwOpen(false);
  }

  return (
    <div className="min-h-full px-5 pb-stack pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="flex items-center justify-between pb-3.5">
        <Eyebrow>Strength</Eyebrow>
        <div className="-my-3 -mr-3 flex items-center">
          {/* Only offered once there is something lit to send. An unscored
              figure is a picture of nothing. */}
          {bodyData && (
            <button
              onClick={guard(() => setSharing(true))}
              aria-label="Share body chart"
              className="grid size-11 place-items-center text-muted active:text-fg"
            >
              <Share size={17} />
            </button>
          )}
          <button
            onClick={onSettings}
            aria-label="Settings"
            className="grid size-11 place-items-center text-muted active:text-fg"
          >
            <Tune />
          </button>
        </div>
      </div>

      {/* Before anything the screen reports, because it is what the colours in
          all of it mean. Setup seeds a chart, so even a first run arrives here
          with ranks on screen and no account of where they came from. */}
      {intro.show && (
        <RankIntroCard
          onOpen={() => {
            intro.dismiss();
            setGuideOpen(true);
          }}
          onDismiss={intro.dismiss}
        />
      )}

      {!latestBw ? (
        <>
          <Empty
            eyebrow="Nothing scored yet"
            title="Every score here is a lift measured against your bodyweight."
            body="Nothing shows up until we know what you weigh."
            action={
              <Button onClick={guard(() => setBwOpen(true))}>Log body weight</Button>
            }
          />
          {/* The empty state is exactly where the explanation is most worth
              having, and it is the one state that draws none of the card the
              permanent entry normally sits in. */}
          <div className="mt-2 px-4">
            <GuideLink onOpen={() => setGuideOpen(true)} />
          </div>
        </>
      ) : (
        <>
          {/* Only for a region that has a rank to climb out of. An unscored one
              has its own prompt in the panel below, and a bar at nothing on top
              of the screen would be the second time it said so. */}
          {detail && (
            <RankProgress
              score={detail}
              muscle={active}
              unitLabel={unitLabel}
            />
          )}

          {/*
            The figure and the numbers read off it are two things, so they sit
            on two cards. A card is the quietest way to say "this belongs
            together" — one flat grey, no border, no shadow — and it lets the
            body map own a panel of its own instead of bleeding into the list
            underneath it.
          */}
          <section className="rounded-[26px] bg-card px-1.5 pb-1.5 pt-2.5">
            <div className="mt-0.5">
              <BodyMap
                gender={s.settings.gender}
                scores={scores}
                selected={active}
                onSelect={pickOnFigure}
                view={view}
                onViewChange={setView}
                showToggle={false}
                maxWidth={268}
                callouts={callouts}
                /* A scored region cycles the trend window; an empty one
                   still offers the shortcut that fills it. A hold has no
                   window to cycle, so its box stays inert and lets the
                   figure behind it keep the whole gesture. */
                onCalloutClick={
                  !detail
                    ? guard(() => setLogging(active))
                    : trend?.kind === "hold"
                      ? undefined
                      : cycleTrend
                }
                onCalloutLabel={trendLabel}
              />
            </div>

            {/*
            Bodyweight sits under the figure rather than above it, in the same
            boxed style as the callouts on either side of the body: everything
            on this screen is a lift measured against this number, so it reads
            as one more annotation on the figure instead of a headline of its
            own. Tapping it is still how you update it.
          */}
            {/*
              The stage is a fixed 0.92 rectangle and the figure is letterboxed
              inside it, which leaves a band of nothing under the feet — about
              9% of the card's width, and growing with it. This pulls the
              bodyweight up into that band so the number sits just under the
              figure rather than floating in the empty part of the card.

              A percentage rather than pixels because the band is a share of the
              width, as is the flanking callout: its box is capped at 72% down
              the stage and the tallest one bottoms out around 9.4%, so at 8%
              the number clears a callout on the calves at any size the card is
              drawn.
            */}
            {/*
              Front and back share that band, on the left, so the figure's own
              controls sit in one row under its feet rather than the toggle
              taking a line of its own below the number.
            */}
            <div className="relative z-[5] -mt-[8%] flex items-end justify-between">
              <TextTabs
                className="pl-3.5"
                gap="gap-6"
                options={[
                  { id: "front", label: "front" },
                  { id: "back", label: "back" },
                ]}
                value={view}
                onChange={setView}
              />
              <button
                onClick={guard(() => setBwOpen(true))}
                aria-label={`Body weight ${num(latestBw.weight)} ${unitLabel}, tap to update`}
                // No box, so the figure aligns to the content edge like everything
                // else on the screen. `min-w-11` keeps the target at 44px now that
                // the border is not holding it open.
                //
                // The `pr-2` is what puts this number in the same right-hand
                // column as the score, the lift and the rows in the panel
                // below. The card the figure sits on is padded 6px so the
                // figure can be as wide as the card allows; the panel below is
                // padded 14px. Left flush with its own card, this number would
                // be the only thing on the screen standing 8px further right
                // than everything under it, so it gives that 8px back.
                // `py-1.5` rather than a roomier pad: the row still stands 49px
                // tall, clear of the 44px floor, and the eight pixels it gives
                // back are eight the band under the figure was only padding
                // with.
                className="press min-w-11 py-1.5 pl-3 pr-2 text-right"
              >
                <span className="block font-mono text-[1.375rem] font-medium leading-none tracking-[-0.02em]">
                  <Numeral id="home:bw" text={num(latestBw.weight)} />
                </span>
                <span className="mt-1 block font-mono text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.16em] text-muted">
                  {unitLabel}
                </span>
              </button>
            </div>
          </section>

          {/* Card two: the selected region, and the list you select from. */}
          <section className="mt-2.5 rounded-[26px] bg-card px-3.5 pb-3.5 pt-4">
            <div>
              <div className="flex items-center gap-2.5">
                <Dot score={detail} size={9} />
                <h2 className="text-[1.6875rem] leading-none tracking-[-0.015em]">
                  {MUSCLE_LABEL[active]}
                </h2>
                {detail && (
                  <Eyebrow className="tracking-[0.16em]">
                    {detail.tier} · {TIER_LEVEL[detail.tier]}
                  </Eyebrow>
                )}
              </div>

              {detail ? (
                <>
                  <div className="pt-3.5">
                    <BigNumber
                      size={52}
                      // keyed on the region so switching regions replays the reveal,
                      // in step with the callouts settling on the figure above
                      value={
                        <Numeral
                          id="home:best"
                          text={
                            detail.hold
                              ? fmtClock(detail.hold.seconds)
                              : num(detail.added1rm ?? detail.best1rm)
                          }
                          delay={30}
                          hold={98}
                          perChar={34}
                        />
                      }
                      /* Three things can stand here, and each is the figure
                         you actually logged: a hold in minutes and seconds, the
                         weight on the belt for a pull-up, or a plain estimated
                         1RM. The whole load is still what the rank was read
                         from — it is just not the number you entered. */
                      unit={
                        detail.hold
                          ? "best hold"
                          : `${unitLabel}${
                              detail.added1rm == null ? "" : " added"
                            } est. 1RM`
                      }
                    />
                  </div>
                  {/* A hold has no multiple of bodyweight to quote — its whole
                      point is that the body is the load, not the divisor — so it
                      names what was on you instead. */}
                  {detail.hold ? (
                    <p className="mt-2.5 text-[0.8125rem] text-muted">
                      {detail.lift}
                      {detail.hold.added > 0 && (
                        <>
                          {" · "}
                          <span className="font-mono text-fg">
                            +{num(detail.hold.added)} {unitLabel}
                          </span>
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="mt-2.5 text-[0.8125rem] text-muted">
                      {detail.lift} ·{" "}
                      <span className="font-mono text-fg">
                        <Numeral
                          id="home:ratio"
                          text={num(detail.best1rm / latestBw.weight, 2)}
                        />
                        ×
                      </span>{" "}
                      bodyweight
                    </p>
                  )}
                </>
              ) : (
                // The same action as the box on the figure. This sentence has
                // always named the lift to log; it may as well be the way to
                // log it, for anyone who reads the panel before the diagram.
                <button
                  onClick={guard(() => setLogging(active))}
                  className="mt-3 text-left text-[0.8125rem] leading-relaxed text-muted active:text-fg"
                >
                  Log a {benchmarkLift(active, s.settings.benchmarks)} set to
                  score this region.{" "}
                  <span className="whitespace-nowrap font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-fg underline decoration-[1.5px] underline-offset-[4px]">
                    Add it
                  </span>
                </button>
              )}
            </div>

            {/* Flush with the header above it: the card is the band now */}
            <div className="mt-6 flex flex-col gap-1.5">
              <span className="pb-1.5 font-mono text-[0.6875rem] uppercase leading-none tracking-[0.18em] text-muted">
                Muscle groups
              </span>

              {REGION_SECTIONS.map((section) => {
                if (section.kind === "single") {
                  const sc = scores[section.group];
                  const on = active === section.group;
                  return (
                    <Row
                      key={section.group}
                      name={MUSCLE_LABEL[section.group]}
                      tierText={sc ? sc.tier : ""}
                      tierColor={sc ? sc.color : UNSCORED}
                      nameSize={16}
                      nameColor={on ? "#ffffff" : "#e4e4e4"}
                      background={on ? "#2a2a2a" : "#1e1e1e"}
                      minHeight={56}
                      onClick={() => pick(section.group)}
                    />
                  );
                }

                const open = openIds.includes(section.id);
                const avg = averageTier(section.children, scores);
                const holdsActive = section.children.includes(active);
                return (
                  <div key={section.id} className="flex flex-col gap-1.5">
                    <Row
                      name={section.label}
                      sub={`${section.children.length} muscles`}
                      tierText={avg ?? ""}
                      tierColor={avg ? TIER_COLOR[avg] : UNSCORED}
                      nameSize={16}
                      nameColor={holdsActive ? "#ffffff" : "#e4e4e4"}
                      background={holdsActive ? "#2a2a2a" : "#1e1e1e"}
                      minHeight={56}
                      chevron={open ? "open" : "closed"}
                      onClick={() =>
                        setOpenIds((o) =>
                          o.includes(section.id)
                            ? o.filter((x) => x !== section.id)
                            : [...o, section.id],
                        )
                      }
                    />

                    {open &&
                      section.children.map((c) => {
                        const sc = scores[c];
                        return (
                          <Row
                            key={c}
                            name={MUSCLE_LABEL[c]}
                            tierText={sc ? sc.tier : ""}
                            tierColor={sc ? sc.color : UNSCORED}
                            nameSize={14}
                            nameColor={active === c ? "#ffffff" : "#a8a8a8"}
                            background={active === c ? "#2a2a2a" : "#191919"}
                            minHeight={44}
                            indent
                            onClick={() => pick(c)}
                          />
                        );
                      })}
                  </div>
                );
              })}
            </div>

            {/* Ruled off from the list so it cannot be mistaken for a
                fifteenth region. */}
            <div className="mt-3.5 border-t border-cardrule pt-2">
              <GuideLink onOpen={() => setGuideOpen(true)} />
            </div>
          </section>
        </>
      )}

      <Sheet
        open={bwOpen}
        onClose={() => setBwOpen(false)}
        title="Log body weight"
        footer={<Button onClick={() => void saveBw()}>Save</Button>}
      >
        <input
          autoFocus
          inputMode="decimal"
          className={numInputCls}
          placeholder={`Weight in ${unitLabel}`}
          value={bw}
          onChange={(e) => setBw(e.target.value)}
        />
        <p className="mt-2.5 text-[0.75rem] text-muted">
          Saved against today. One entry per day.
        </p>
      </Sheet>

      <LogBestSet
        open={!!logging}
        muscle={logging}
        onClose={() => setLogging(null)}
      />

      {/* Reads the selected region so its worked example is the reader's own
          rank rather than an invented one. */}
      <RankingGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        muscle={active}
        score={detail}
        bodyweight={latestBw?.weight ?? null}
        benchmark={benchmarkLift(active, s.settings.benchmarks)}
        unitLabel={unitLabel}
      />

      {sharing && bodyData && (
        <ShareCardEditor
          subject="body"
          data={bodyData}
          onClose={() => setSharing(false)}
          onUnlock={() => {
            setSharing(false);
            onUnlock("premium-share");
          }}
        />
      )}
    </div>
  );
}
