import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "../components/confirm";
import { Share } from "../components/icons";
import { Numeral, resetNumerals } from "../components/Numeral";
import { Sparkline } from "../components/Sparkline";
import {
  BigNumber,
  Button,
  Empty,
  Eyebrow,
  IconButton,
  Sheet,
  StatBand,
  TextTabs,
  numInputCls,
} from "../components/ui";
import { exerciseHistory, personalRecords, streakSummary } from "../lib/stats";
import { useNow } from "../lib/useNow";
import { useEntitlement, useWriteGate } from "../lib/useEntitlement";
import type { GateSubject } from "../lib/entitlement";
import { localDate, num, parseKey } from "../lib/util";
import { liftCard } from "../lib/card/select";
import { ProgressSharePreview } from "../components/ProgressSharePreview";
import { useStore } from "../store";
import type { BodyWeight } from "../types";
type Metric = "e1rm" | "topWeight" | "volume";
const METRICS: { id: Metric; label: string }[] = [
  { id: "e1rm", label: "Est. 1RM" },
  { id: "topWeight", label: "Top set" },
  { id: "volume", label: "Volume" },
];

const shortDate = (key: string) =>
  localDate(parseKey(key), {
    day: "numeric",
    month: "short",
  });

const longDate = (key: string) =>
  localDate(parseKey(key), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/**
 * The width the curves are laid out at, in their own units: a 390pt screen
 * less the page gutters, the card's hairline and the card's own padding. The
 * viewBox scales to whatever the card actually measures, so this only has to
 * be the right shape — but at the size a phone holds it, it is exact.
 */
const CHART_W = 304;

/**
 * How far back the curve reaches. Matches the windows History offers.
 *
 * `pro` marks the long windows. Everyone keeps a readable picture of where they
 * are — all-time and the last month are the basic progress the free tier is
 * promised — and Pro is the quarter and the year, which is where a trend stops
 * being "how am I doing" and starts being analysis.
 */
type Range = "all" | "30d" | "90d" | "year";
const RANGES: { id: Range; label: string; days: number; pro?: true }[] = [
  { id: "all", label: "All", days: Infinity },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90, pro: true },
  { id: "year", label: "1y", days: 365, pro: true },
];

/**
 * Filled when this lift is the one the screen opens on.
 *
 * Coloured by hand rather than through `currentColor`, because the button it
 * sits in sets a colour of its own and two utilities for the same property
 * settle by stylesheet order rather than by which was asked for last.
 */
function StarIcon({ on }: { on: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={on ? "var(--color-fg)" : "none"}
      stroke={on ? "var(--color-fg)" : "var(--color-dim)"}
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2.9 5.87 6.48.94-4.69 4.57 1.11 6.45L12 17.77l-5.8 3.06 1.11-6.45L2.62 9.81l6.48-.94z" />
    </svg>
  );
}

export function Progress({
  onUnlock,
}: {
  /** Opens whichever of the invitation or the paywall this person needs. */
  onUnlock: (feature: GateSubject) => void;
}) {
  const { can } = useEntitlement();
  const { guard } = useWriteGate(() => onUnlock("start-workout"));
  const s = useStore();
  // Only the streak on a shared card reads the time, and it moves by the day.
  const now = useNow(60_000);
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";
  const [metric, setMetric] = useState<Metric>("e1rm");

  const done = useMemo(() => s.sessions.filter((x) => x.endedAt), [s.sessions]);
  const prs = useMemo(() => personalRecords(done), [done]);

  const tracked = useMemo(
    () =>
      s.exercises
        .filter((e) => prs.has(e.id))
        .sort((a, b) => (prs.get(b.id)!.at ?? 0) - (prs.get(a.id)!.at ?? 0)),
    [s.exercises, prs],
  );

  // Held by id, not index, so the selection survives a new exercise being
  // tracked or the list reordering as PRs land. It opens on the pinned lift if
  // there is one — read once, since changing the pin is not a reason to move
  // the screen off the lift being looked at.
  const [exId, setExId] = useState<string>(() => s.pinnedLiftId ?? "");
  const [picker, setPicker] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const [range, setRange] = useState<Range>("all");
  // Which session the finger is on. Cleared whenever the series underneath it
  // changes, so an index can never point at a different lift's history.
  const [scrub, setScrub] = useState<number | null>(null);
  // A drag writes the figures straight, since they have to keep up with the
  // finger; a tap lets them roll to whatever it landed on.
  const [sweeping, setSweeping] = useState(false);
  // The body weight curve reads the same way as the one above it, and keeps its
  // own place on it: the two are separate series and a finger is only ever on
  // one of them.
  const [bwScrub, setBwScrub] = useState<number | null>(null);
  const [bwSweeping, setBwSweeping] = useState(false);
  /**
   * The weigh-in being corrected, reached by holding its point on the curve.
   *
   * A body weight chart is the one series in the app you cannot fix by
   * training differently: a number typed with a finger on the wrong key, or a
   * day weighed with a bag still on the scale, bends the line for good and
   * drags every strength score on the other screen with it, since all of them
   * are ratios against this number. So the point that is wrong has to be
   * reachable from the picture of it.
   */
  /**
   * The height the lift chart is actually given, measured.
   *
   * This screen does not scroll — everything it has to say is meant to be on
   * the glass at once — so the curve takes whatever is left after the fixed
   * rows above and below it have had their share, rather than standing at a
   * height written down here and pushing the rest off the bottom of a small
   * phone. Measured rather than calculated, because the rows either side of it
   * grow with the reader's text size and no arithmetic here would know.
   *
   * The slot it measures is positioned, and the chart inside it is absolute, so
   * the SVG's own height can never feed back into the box being observed.
   */
  const [chartH, setChartH] = useState(168);
  const chartRO = useRef<ResizeObserver | null>(null);
  /*
   * A callback ref rather than a ref plus an effect.
   *
   * This screen returns early three times over — no history, no tracked lift,
   * the real page — so the chart is mounted on some renders and not others. An
   * effect placed beside the markup would be a hook that runs conditionally,
   * and one hoisted above the returns with no dependencies would tear down and
   * rebuild the observer on every render. React hands a callback ref the
   * element on mount and `null` on unmount, which is exactly the lifecycle the
   * observer wants, and it is not a hook at all.
   */
  const chartBox = useCallback((el: HTMLDivElement | null) => {
    chartRO.current?.disconnect();
    chartRO.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const h = Math.round(entry.contentRect.height);
      // A floor, so a viewport too short for the whole screen leaves a curve
      // that can still be read and lets the page scroll instead of squashing
      // it to nothing.
      if (h > 0) setChartH(Math.max(88, h));
    });
    ro.observe(el);
    chartRO.current = ro;
  }, []);
  const [editBw, setEditBw] = useState<BodyWeight | null>(null);
  const [editBwText, setEditBwText] = useState("");
  /** Whether the share deck is up. Drawing only starts when it is. */
  const [sharing, setSharing] = useState(false);
  const ask = useConfirm();
  const current = tracked.find((e) => e.id === exId) ?? tracked[0];

  // The picker ranks by strength rather than by recency: the question it
  // answers is "which lift do I want to look at", and the heaviest ones are
  // the ones being chased. `tracked` keeps its own order, since the default
  // selection is the lift that most recently moved.
  const ranked = useMemo(() => {
    const needle = pickQ.trim().toLowerCase();
    return tracked
      .filter(
        (e) =>
          !needle ||
          e.name.toLowerCase().includes(needle) ||
          e.muscle.toLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          (prs.get(b.id)?.bestE1rm ?? 0) - (prs.get(a.id)?.bestE1rm ?? 0),
      );
  }, [tracked, prs, pickQ]);

  // Leaving the tab unmounts the screen; forgetting the figures means coming
  // back reads as an arrival and scrambles, rather than rolling from whatever
  // was on screen last time.
  useEffect(() => () => resetNumerals("progress:"), []);

  const points = useMemo(() => {
    if (!current) return [];
    const days = RANGES.find((r) => r.id === range)!.days;
    const since = days === Infinity ? 0 : Date.now() - days * 864e5;
    return exerciseHistory(done, current.id).filter((p) => p.at >= since);
  }, [done, current, range]);

  /**
   * Room under the last card for the floating stack to hover in.
   *
   * `pb-stack` is not usable here: it reserves 184px, sized for the tallest
   * state the stack ever reaches so that a *scrolling* screen always has an end
   * you can reach past it. On a page that does not scroll that padding is dead
   * height taken straight out of the chart. This is the stack as it actually
   * stands right now — the bar, plus the pill only while a workout is open —
   * with a gap above it.
   */
  const stackClearance = `calc(max(env(safe-area-inset-bottom) - 12px, 14px) + ${
    s.active ? 136 : 78
  }px)`;

  const pr = current ? prs.get(current.id) : undefined;
  /** Whether this is the lift the screen will open on next time. */
  const pinned = !!current && s.pinnedLiftId === current.id;
  const values = points.map((p) => p[metric]);
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const at = scrub != null && points[scrub] ? points[scrub] : null;
  const shown = at ? at[metric] : last;

  /*
   * The band reads whatever the figure above it is reading.
   *
   * With the curve scrubbed, the top of the card described one session and the
   * three boxes underneath described a career, so the card said two things at
   * once and the eye had no way to tell which. Touching a point now swaps all
   * three to that day, and letting go returns them to the records.
   *
   * The three boxes are the three metrics — estimate, heaviest set, volume —
   * so whichever one the curve is drawing, the other two are underneath it and
   * the day can be read whole without switching tabs to go and find them.
   */
  const band = at
    ? [
        { id: "progress:best", label: "Est. 1RM", value: num(at.e1rm, 1) },
        {
          id: "progress:heaviest",
          label: "Heaviest set",
          value: `${num(at.heaviest.weight)}×${at.heaviest.reps}`,
        },
        { id: "progress:volume", label: "Volume", value: num(at.volume, 0) },
      ]
    : pr
      ? [
          {
            id: "progress:best",
            label: "Best est. 1RM",
            value: num(pr.bestE1rm, 1),
          },
          {
            id: "progress:heaviest",
            label: "Heaviest set",
            value: `${num(pr.heaviest)}×${pr.heaviestReps}`,
          },
          {
            id: "progress:volume",
            label: "Best session",
            value: num(pr.bestVolume, 0),
          },
        ]
      : null;

  /*
   * The lift as a picture. Everything here is already on the screen — the same
   * series the curve draws, the same percentage the line under the figure
   * quotes, and the records the band rests on when nothing is selected — so a
   * card cannot disagree with the page it was sent from. It stays on the
   * records while the band follows a finger: a card is sent as the story of
   * the whole run, not of whichever point was being held when Share was hit.
   */
  const liftData = current && values.length > 0 && values.every(Number.isFinite)
    ? liftCard({
        currentStreak: streakSummary(s.sessions, now).current,
        metricId: metric,
        history: exerciseHistory(done, current.id).map((p) => p[metric]),
        name: current.name,
        values,
        metricLabel: metric === "e1rm" ? "Estimated 1RM" : metric === "volume" ? "Session volume" : "Heaviest set",
        unit: unitLabel,
        sinceLabel: points.length
          ? `Since ${shortDate(points[0].date)}`
          : RANGES.find((r) => r.id === range)!.label,
        // The ends of the range, and how finely this metric is written — the
        // two things the cards cannot work out from the series alone.
        dates: points.map((p) => localDate(parseKey(p.date), { day: "numeric", month: "short", year: "numeric" })),
        decimals: metric === "volume" ? 0 : 1,
        stats: pr
          ? [
              { label: "Best est. 1RM", value: num(pr.bestE1rm, 1) },
              {
                label: "Heaviest set",
                value: `${num(pr.heaviest)}×${pr.heaviestReps}`,
              },
              { label: "Best session", value: num(pr.bestVolume, 0) },
            ]
          : [
              {
                label: METRICS.find((x) => x.id === metric)!.label,
                value: num(shown, 0),
              },
            ],
      })
    : null;

  if (!done.length) {
    return (
      <div
        className="flex h-[100dvh] flex-col px-5 pt-[calc(env(safe-area-inset-top)+14px)]"
        style={{ paddingBottom: stackClearance }}
      >
        <Eyebrow>Progress</Eyebrow>
        <Empty
          eyebrow="No curve yet"
          title="Two finished workouts and a lift has a trend."
          body="Every number on this screen comes from your own logs — nothing is estimated from anyone else."
        />
      </div>
    );
  }

  async function saveEditedBw() {
    if (!editBw) return;
    const v = parseFloat(editBwText.replace(",", "."));
    // Nothing is written for a value that is not a weight. Silently, because
    // the field is already showing what it refuses to take.
    if (!isFinite(v) || v <= 0) return;
    await s.logBodyWeight(editBw.date, v);
    setEditBw(null);
  }

  async function removeEditedBw() {
    if (!editBw) return;
    const when = longDate(editBw.date);
    if (
      !(await ask({
        title: `Remove the weigh-in from ${when}?`,
        // Accurate about the blast radius: the strength screen scores every
        // region against the most recent weigh-in only, so removing an older
        // one moves this curve and nothing else.
        body: "The point comes off the curve. Strength scores are read against your most recent weigh-in, so an older one leaves them alone.",
        confirmLabel: "Remove",
        danger: true,
      }))
    )
      return;
    await s.deleteBodyWeight(editBw.date);
    // The series is a point shorter, so an index into the old one means
    // something else now.
    setBwScrub(null);
    setEditBw(null);
  }

  const bwValues = s.bodyweight.map((b) => b.weight);
  // Whichever reading the finger is on, else the most recent one.
  const bwAt = bwScrub != null ? (s.bodyweight[bwScrub] ?? null) : null;
  const bwShown = bwAt ? bwAt.weight : bwValues[bwValues.length - 1];


  return (
    /*
     * One screenful, and no scrolling.
     *
     * Progress is a page you read rather than one you travel down: a lift, its
     * curve, its records, and the body weight behind them. Scrolling it meant
     * the records and the weight curve were both below the fold on a phone
     * even though the content itself fits — the page was tall because
     * `pb-stack` reserves 184px for the floating bar, not because there was
     * anything down there.
     *
     * So it is a column exactly one viewport tall, and the lift chart is the
     * one part that gives: it takes the space the fixed rows do not want. The
     * overflow is `auto` rather than `hidden` on purpose — if a viewport is so
     * short that even the chart's floor will not fit, the page scrolls rather
     * than cutting something off. Nothing here is ever hidden; it is only ever
     * fitted.
     */
    <div
      className="flex h-[100dvh] flex-col overflow-y-auto"
      style={{ paddingBottom: stackClearance }}
    >
      {/* The screen's name. A flex row rather than a block, so the band is the
          height of the word itself and not of the 24px line box a paragraph of
          text would sit in — the title is worth a strip of the page, but only
          the strip it actually occupies. */}
      <div className="flex shrink-0 items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
        <Eyebrow>Progress</Eyebrow>
        {liftData && (
          <button
            onClick={guard(() => setSharing(true))}
            aria-label="Share this lift"
            className="-my-3 -mr-3 grid size-11 place-items-center text-muted active:text-fg"
          >
            <Share size={17} />
          </button>
        )}
      </div>

      {current && (
        <>
          {/* The lift is one object, so it is drawn as one: the name, the
              switches, the figure, the curve and the records share a panel
              rather than running down a black page as loose sections. */}
          <section
            /* `flex-1` to take the spare room, but deliberately *without*
               `min-h-0`: its automatic minimum is its own content, so the card
               can never be squeezed smaller than the rows inside it. With
               `min-h-0` it could, and on a short viewport the records band was
               pushed straight out through the bottom of the card and cut in
               half by the card below. Now the chart shrinks to its floor, the
               card stops there, and the page scrolls if it truly has to. */
            className={`mx-5 mt-3 flex flex-1 flex-col rounded-[28px] border border-rule bg-[#101010] px-[22px] pt-[18px] ${
              pr ? "pb-1.5" : "pb-[18px]"
            }`}
          >
            <div className="flex shrink-0 items-center justify-between gap-2">
              <button
                onClick={() => setPicker(true)}
                className="-my-1 flex min-h-11 min-w-0 items-center gap-2.5 py-1 text-left"
                aria-label="Choose exercise"
              >
                <span className="truncate text-[1.4375rem] font-bold tracking-[-0.024em]">
                  {current.name}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-muted)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {/* The screen has to open on something, and the last lift to
                  move is only a guess at which one that should be. Starring a
                  lift answers it: this is the one being chased, and it is
                  waiting here on the next visit. */}
              <IconButton
                label={
                  pinned
                    ? `Stop opening Progress on ${current.name}`
                    : `Open Progress on ${current.name}`
                }
                pressed={pinned}
                onClick={() => s.pinLift(pinned ? null : current.id)}
                className="-mr-2.5 -my-2.5"
              >
                <StarIcon on={pinned} />
              </IconButton>
            </div>

            {/* Wraps rather than overflows: at a large text size the metric
                names and the range names together are wider than the screen,
                and the range row drops beneath instead of pushing the page
                sideways. */}
            <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-6 pt-3">
              {/* Was a hand-rolled copy of TextTabs, which meant the shared
                  one could be given a workable hit area and this one silently
                  kept the old 17px-tall word. */}
              <TextTabs
                // Both rows are laid out at the height of the word and reach
                // for the finger past it: on this card they always wrap, and
                // two full-height rows spent 60px of a screen the body weight
                // card also has to fit on. The row gap is what the hit areas
                // need to stay off each other.
                dense
                options={METRICS}
                value={metric}
                /*
                 * The selection survives the switch.
                 *
                 * `points` is built from the lift and the window, not from the
                 * metric, so the index still names the same session — and
                 * clearing it meant a tap on Top set threw the day away and
                 * dropped the band back to all-time records. The curve and the
                 * figure change; the session being read does not.
                 */
                onChange={(m) => {
                  setMetric(m);
                  setSweeping(false);
                }}
              />
              <TextTabs
                dense
                gap="gap-4"
                // Anchored to the right edge whether or not it shares the row
                // with the metrics: inside the card the two sets of words no
                // longer fit on one line, and a wrapped row starting under the
                // metrics reads as a spilled continuation of them rather than
                // as the second switch.
                className="ml-auto"
                options={RANGES.map((r) => ({
                  id: r.id,
                  label: r.label,
                  locked: !!r.pro && !can("progress-windows"),
                }))}
                value={range}
                onChange={(r) => {
                  /*
                   * The long windows are Pro. Tapping one while free opens the
                   * invitation or the paywall rather than doing nothing, and
                   * returns *before* `setRange` — so dismissing whatever opens
                   * leaves the curve on the window that was already showing
                   * instead of on a blank Pro one.
                   */
                  const picked = RANGES.find((x) => x.id === r);
                  if (picked?.pro && !can("progress-windows")) {
                    onUnlock("progress-windows");
                    return;
                  }
                  setRange(r);
                  setScrub(null);
                  setSweeping(false);
                }}
              />
            </div>

            <div className="shrink-0 pt-3.5">
              <BigNumber
                // Scrambles when the series changes under it, but not while a
                // session is being read off the curve: mid-drag the figure has
                // to keep up with the finger, and a value resolving out of
                // noise cannot be read at the speed it is being changed.
                value={
                  <Numeral
                    id="progress:big"
                    text={num(shown, 1)}
                    animate={!sweeping}
                  />
                }
                unit={unitLabel}
                size={46}
              />
            </div>
            <p className="mt-2 shrink-0 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted">
              {at ? (
                <span className="text-fg">{longDate(at.date)}</span>
              ) : points.length > 1 ? (
                <>
                  {change >= 0 ? "+" : ""}
                  <Numeral id="progress:change" text={num(change, 1)} />% since{" "}
                  {shortDate(points[0].date)}
                </>
              ) : (
                `${points.length} session${points.length === 1 ? "" : "s"} in range`
              )}
            </p>

            <div
              ref={chartBox}
              className="relative min-h-[88px] flex-1"
              style={{ marginTop: 12 }}
            >
              <Sparkline
                className="absolute inset-x-0 top-0"
                height={chartH}
                values={values}
                selected={scrub}
                onSelect={(i, via) => {
                  setScrub(i);
                  setSweeping(via === "drag");
                }}
                labels={
                  points.length > 1
                    ? [
                        shortDate(points[0].date),
                        shortDate(points[points.length - 1].date),
                      ]
                    : undefined
                }
                // The viewBox is in the same units as the box the curve is
                // drawn in, so the card's gutters have to come off the width
                // it is laid out at — otherwise the whole chart scales down to
                // fit and takes its stroke and its captions with it.
                width={CHART_W}
              />
            </div>

            {band && (
              <div className="mt-3 shrink-0">
                <StatBand
                  size="sm"
                  frame="card"
                  stats={band.map((b) => ({
                    label: b.label,
                    value: (
                      // Mid-drag these change with every point the finger
                      // crosses, and a figure resolving out of noise cannot be
                      // read at that speed — the same reason the big number
                      // above stops scrambling while the curve is being swept.
                      <Numeral id={b.id} text={b.value} animate={!sweeping} />
                    ),
                  }))}
                />
              </div>
            )}
          </section>
        </>
      )}

      <Sheet
        open={picker}
        onClose={() => {
          setPicker(false);
          setPickQ("");
        }}
        title="Exercise"
      >
        {/* Sticks to the head of the scroller so a long list can be filtered
            without scrolling back up to the field. The negative gutters let it
            paint over the rows passing beneath it. */}
        <div className="sticky -top-4 z-10 -mx-5 -mt-4 bg-ink px-5 pb-3 pt-4">
          {/* Built as a card rather than a ruled field, so it belongs to the
              stack beneath it — but shorter, and rounded to the full height so
              its ends are semicircles with no straight edge between them. A
              field the same shape as the rows reads as one of them; a pill
              reads as the thing that filters them. The glyph does the rest. */}
          <label className="flex items-center gap-2.5 rounded-full border border-rule bg-[#101010] px-4 py-2 focus-within:border-faint">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-dim)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-fg outline-none placeholder:text-dim"
              placeholder="Search lifts…"
              value={pickQ}
              onChange={(e) => setPickQ(e.target.value)}
              aria-label="Search tracked lifts"
            />
          </label>
        </div>

        {ranked.length === 0 ? (
          <p className="py-6 text-[0.8125rem] text-muted">
            No tracked lift matches “{pickQ.trim()}”.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {ranked.map((e) => {
              const pr = prs.get(e.id);
              const on = current?.id === e.id;
              return (
                <button
                  key={e.id}
                  aria-current={on || undefined}
                  onClick={() => {
                    setExId(e.id);
                    setScrub(null);
                    setPicker(false);
                    setPickQ("");
                  }}
                  className={`press press-row flex w-full items-center gap-3 rounded-[18px] border px-4 py-3.5 text-left ${
                    on
                      ? "border-faint bg-[#161616]"
                      : "border-rule bg-[#101010]"
                  }`}
                >
                  {/* Holds its column whether or not it is drawn, so a name
                      does not shift sideways as the selection moves. */}
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: on ? "#f5f5f5" : "transparent" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[0.9375rem] font-medium ${
                        on ? "text-fg" : "text-[#c8c8cc]"
                      }`}
                    >
                      {e.name}
                    </span>
                    <span className="mt-1 block font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
                      {e.muscle}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-[0.9375rem] font-medium text-fg">
                      {pr ? num(pr.bestE1rm, 1) : "—"}
                    </span>
                    <span className="mt-0.5 block font-mono text-[0.625rem] uppercase tracking-[0.16em] text-dim">
                      {unitLabel} 1RM
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <p className="pt-4 text-[0.75rem] leading-relaxed text-muted">
          Every exercise you have logged a working set for, heaviest first. The
          figure beside each is its best estimated 1RM.
        </p>
      </Sheet>

      {/*
        Shown from the first weigh-in, not the second.

        This card used to require two readings before it appeared at all, on the
        reasonable ground that one point is not a trend. What that produced was
        a screen with a lift chart and then nothing — no card, no caption, no
        hint that a body weight chart is a thing this app has — so the honest
        question it prompted was "where is the body weight graph". A single
        reading still cannot be drawn as a line, but it can be shown as a
        number, and the card can say what it is waiting for.
      */}
      {s.bodyweight.length > 0 && (
        <section className="mx-5 mt-3 shrink-0 rounded-[28px] border border-rule bg-[#101010] px-[22px] pb-[14px] pt-[18px]">
          <div className="flex items-baseline justify-between">
            {/* The scrubbed weigh-in takes the card's own title while a finger
                is on the curve, the way the caption does on the lift card
                above. It used to have a line of its own under the chart, held
                open by a hard space whether or not anything was in it — a band
                of blank card, on a screen that has to hold both of them. What
                is being dragged is plain without the title, and the title is
                back the moment the finger lifts. */}
            <Eyebrow className="tracking-[0.18em]" tone={bwAt ? "fg" : "muted"}>
              {bwAt ? longDate(bwAt.date) : "Body weight"}
            </Eyebrow>
            <span className="font-mono text-[0.9375rem] font-medium">
              {/* Held steady mid-drag for the same reason as the figure above:
                  a value resolving out of noise cannot be read at the speed a
                  finger changes it. */}
              <Numeral
                id="progress:bw"
                text={num(bwShown)}
                animate={!bwSweeping}
              />{" "}
              <span className="text-[0.6875rem] uppercase tracking-[0.16em] text-muted">
                {unitLabel}
              </span>
            </span>
          </div>
          <div className="mt-2">
            {bwValues.length > 1 ? (
              <Sparkline
                values={bwValues}
                selected={bwScrub}
                onSelect={(i, via) => {
                  setBwScrub(i);
                  setBwSweeping(via === "drag");
                }}
                onHold={(i) => {
                  const rec = s.bodyweight[i];
                  if (!rec) return;
                  setEditBw(rec);
                  setEditBwText(num(rec.weight));
                }}
                labels={[
                  shortDate(s.bodyweight[0].date),
                  shortDate(s.bodyweight[s.bodyweight.length - 1].date),
                ]}
                width={CHART_W}
                // taller than it was: the captions now take a band at the foot of
                // it, and the curve keeps the height it had before them
                height={98}
                padT={6}
                padB={22}
                stroke="var(--color-muted)"
                strokeWidth={1.4}
                showBaseline={false}
                // Follows the curve above rather than racing it, so the page
                // settles top to bottom.
                enterDelay={240}
              />
            ) : (
              <p className="pb-1.5 pt-1 text-[0.75rem] leading-relaxed text-muted text-pretty">
                One weigh-in so far, on {longDate(s.bodyweight[0].date)}. Log
                another and the trend draws itself here.
              </p>
            )}
          </div>

          {/* The gesture has to be said out loud. A press-and-hold on a point
              is invisible until somebody tries it, and nobody tries it on a
              chart — every other chart they have ever used does nothing. */}
          {bwValues.length > 1 && (
            <p className="pt-0.5 text-[0.6875rem] leading-relaxed text-dim">
              Hold a point to correct or remove that weigh-in.
            </p>
          )}
        </section>
      )}

      <Sheet
        open={!!editBw}
        onClose={() => setEditBw(null)}
        title={editBw ? longDate(editBw.date) : "Weigh-in"}
        footer={
          <div className="flex flex-col gap-1">
            <Button onClick={() => void saveEditedBw()}>Save</Button>
            <Button variant="danger" onClick={() => void removeEditedBw()}>
              Remove this weigh-in
            </Button>
          </div>
        }
      >
        <input
          autoFocus
          inputMode="decimal"
          className={numInputCls}
          placeholder={`Weight in ${unitLabel}`}
          value={editBwText}
          onChange={(e) => setEditBwText(e.target.value)}
        />
        <p className="mt-2.5 text-[0.75rem] leading-relaxed text-muted">
          Corrects what was logged on this day. One entry per day, so saving
          replaces it rather than adding a second.
        </p>
      </Sheet>

      {sharing && liftData && (
        <ProgressSharePreview
          data={liftData}
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
