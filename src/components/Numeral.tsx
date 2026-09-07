import { useEffect, useState } from "react";
import { Scramble } from "./Callout";

/**
 * A figure that animates when it changes, and how it animates says what kind of
 * change it was.
 *
 * The first time a screen shows a number it scrambles: nothing preceded it, so
 * there is nothing to travel from, and the churn reads as the value arriving.
 * Every change after that rolls like an odometer — up when the figure rose,
 * down when it fell — because by then there *is* a previous value, and the
 * direction of travel is the most useful thing the motion can carry. Switching
 * lift and watching every number on the screen roll the same way tells you at a
 * glance that the new one is heavier throughout.
 *
 * Only the characters that actually differ move. A change from 180 to 188
 * rolls one column and leaves the rest still, so the eye goes to the digit that
 * changed rather than to the whole number rewriting itself.
 */

/**
 * The last value each figure showed, kept outside the tree.
 *
 * The callouts on the body map are deliberately remounted whenever the region
 * changes, so their boxes can re-arrive with the leader line. A component that
 * only knew its own history would treat every one of those as a first
 * appearance and scramble. Keyed by id, the value survives the remount and the
 * figure can roll from what the previous region showed.
 */
const lastSeen = new Map<string, string>();

/**
 * Forget a screen's figures, so the next visit scrambles rather than rolls.
 * Screens call this as they unmount — tabs unmount when you leave them, and
 * arriving at a screen should read as arriving, not as a change.
 */
export function resetNumerals(prefix: string) {
  for (const key of [...lastSeen.keys()])
    if (key.startsWith(prefix)) lastSeen.delete(key);
}

const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * How long a column takes to roll, and how far apart the columns start.
 *
 * A column that has further to travel takes longer, and enough longer to see:
 * a wheel carrying real momentum does not stop as readily as one nudged a
 * single place. So a seven-place spin visibly outlasts its neighbours and the
 * figure settles column by column rather than all at once, which is the part
 * that makes it read as mechanical rather than as a crossfade.
 *
 * Still well short of proportional — seven places takes about twice as long as
 * one, not seven times.
 */
const BASE_MS = 200;
const PER_STEP_MS = 45;
const STAGGER = 20;

const value = (s: string) => parseFloat(s.replace(/[^\d.-]/g, "")) || 0;

/**
 * The characters one column shows on its way from `was` to `ch`, top to bottom.
 *
 * Two digits are joined by every digit between them, wrapping through 9 to 0,
 * so the column actually spins: 2 to 9 passes 3,4,5,6,7,8 rather than cutting
 * straight across. Wrapping is what makes a carry look right — the units of
 * 25 → 90 run 5,6,7,8,9,0, exactly as the wheel would turn.
 *
 * The list always ascends. Which end it starts from is what differs: rolling up
 * the strip is dragged from the old character to the new, rolling down it
 * starts on the new and the old falls away past it.
 */
function strip(was: string, ch: string, up: boolean): string[] {
  const digits = /^[0-9]$/;
  // A separator or a blank has no run to travel through, so it just swaps.
  if (!digits.test(was) || !digits.test(ch)) return up ? [was, ch] : [ch, was];
  const from = Number(up ? was : ch);
  const to = Number(up ? ch : was);
  const steps = (to - from + 10) % 10;
  return Array.from({ length: steps + 1 }, (_, k) => String((from + k) % 10));
}

type Mode =
  { kind: "scramble" } | { kind: "plain" } | { kind: "roll"; from: string };

export function Numeral({
  id,
  text,
  animate = true,
  delay = 0,
  hold = 83,
  perChar = 30,
}: {
  /** Identity across remounts, and the namespace `resetNumerals` clears. */
  id: string;
  text: string;
  /**
   * False while the value is being dragged out of a chart. Mid-sweep the figure
   * has to keep up with the finger, and an animation cannot start and finish
   * between two frames of a drag — so it is written straight, and the value is
   * still recorded so the next tap rolls from wherever the finger left it.
   */
  animate?: boolean;
  delay?: number;
  hold?: number;
  perChar?: number;
}) {
  // `from` is read once, at construction, before any effect has written this
  // render's value back — which is what lets a remounted callout still know
  // what the region before it showed.
  const [state, setState] = useState<{ text: string; mode: Mode; seq: number }>(
    () => {
      const seen = lastSeen.get(id);
      if (seen === undefined)
        return { text, mode: { kind: "scramble" }, seq: 0 };
      if (seen === text || !animate)
        return { text, mode: { kind: "plain" }, seq: 0 };
      return { text, mode: { kind: "roll", from: seen }, seq: 0 };
    },
  );

  // A changed value decides its own mode. Done in render rather than an effect
  // so the new figure never paints in its final position for a frame first.
  if (state.text !== text) {
    setState({
      text,
      mode: animate ? { kind: "roll", from: state.text } : { kind: "plain" },
      seq: state.seq + 1,
    });
  }

  // Written after paint, never during render: StrictMode renders twice, and a
  // value recorded during the first pass would make the second pass think it
  // had already been shown and skip the arrival.
  useEffect(() => {
    lastSeen.set(id, text);
  }, [id, text]);

  if (state.mode.kind === "scramble" && !reduced()) {
    return <Scramble text={text} delay={delay} hold={hold} perChar={perChar} />;
  }
  if (state.mode.kind === "roll" && !reduced()) {
    // Keyed on the change: a CSS animation only restarts when it is applied to
    // a fresh element, so two rolls the same direction in a row need this.
    return <Roll key={state.seq} from={state.mode.from} to={text} />;
  }
  return <>{text}</>;
}

function Roll({ from, to }: { from: string; to: string }) {
  const up = value(to) >= value(from);
  /*
   * Which column of the old figure sits under each column of the new one.
   *
   * Aligned on the decimal point when both have one, because trailing zeros are
   * trimmed for display and 4.08 → 4.3 is a shorter string as well as a bigger
   * number. Aligning those from the right would slide the point one place and
   * roll it against a digit, so the separator itself would appear to spin.
   * Otherwise aligned from the right, which is what makes 98 → 102 roll the
   * digits that correspond rather than every column at once.
   */
  const dot = (s: string) => s.indexOf(".");
  const shift =
    dot(from) >= 0 && dot(to) >= 0
      ? dot(from) - dot(to)
      : from.length - to.length;

  return (
    <span style={{ whiteSpace: "pre" }}>
      {[...to].map((ch, i) => {
        const was = from[i + shift] ?? " ";
        // The window is one line tall over a strip of one or two lines; the
        // animation slides the strip by exactly one line, so which line shows
        // swaps. Every character gets this same box, changed or not: an
        // inline-block sits on the line differently from a bare glyph, so
        // boxing only the moving columns would step the unchanged digits off
        // the baseline beside them.
        const rows = was === ch ? [ch] : strip(was, ch, up);
        // The wheel that turns furthest takes longest, so a column stepping one
        // place has settled while its neighbour is still spinning.
        const ms = BASE_MS + (rows.length - 2) * PER_STEP_MS;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              overflow: "hidden",
              height: "1em",
              lineHeight: "1em",
              // text-bottom, not bottom: `bottom` pins the window to the foot of
              // the whole line box, which only coincides with the text when the
              // line-height happens to be 1. Set inline in a normally-leaded
              // sentence it would drop the digits below the words beside them.
              // text-bottom aligns to the font's own descender line instead, so
              // the digits sit on the same baseline whatever the leading.
              verticalAlign: "text-bottom",
            }}
          >
            <span
              style={{
                display: "block",
                animation:
                  rows.length === 1
                    ? undefined
                    : `${up ? "roll-up" : "roll-down"} ${ms}ms var(--ease-settle) ${
                        i * STAGGER
                      }ms both`,
              }}
            >
              {rows.map((r, k) => (
                <span key={k} style={{ display: "block", height: "1em" }}>
                  {r}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
