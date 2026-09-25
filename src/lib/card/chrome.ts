import {
  measure,
  pill,
  rule,
  text,
  type Layout,
  type TextBox,
  type TextOpts,
} from "./draw";
import { CARDRULE, FG, INK, MUTED } from "./tokens";

/**
 * The furniture every share card is built out of.
 *
 * One card established the grammar — a mark and a date across the top, one
 * thing said large in the middle, and the session's figures ruled along the
 * foot — and this is that grammar as parts, so a new card is a choice of what
 * goes in the middle rather than a fresh page of coordinates. The point is
 * that twelve cards look like twelve views of one app and not like twelve
 * cards.
 */

/** Everything is set in from the edge by this much. */
export const MARGIN = 7.4;
/** The height of the band along the foot, in units. */
export const BAND_H = 25;
/**
 * Where the middle of the card's one idea sits, as a fraction of its height.
 *
 * Below the centre rather than on it. Set exactly halfway a figure reads as
 * floating; a little low it reads as standing on the band beneath it.
 */
export const CENTRE = 0.529;

/**
 * The mark, and the day this happened.
 *
 * The mark is reversed out into a patch because it is the only thing on a card
 * that is not about the workout — a white chip says "this came from an app" in
 * less room than any other treatment, and then gets out of the way.
 */
export function header(L: Layout, dateLabel: string) {
  const size = 3.3;
  const opts: TextOpts = { size, weight: 600, track: 0.22, caps: true };
  const w = measure(L, "Strata", opts).width;
  const padX = 4.1;
  const h = 8;
  pill(L, MARGIN, MARGIN, w + padX * 2, h, FG);
  text(L, "Strata", MARGIN + padX, MARGIN + 2.5, { ...opts, color: INK });
  text(L, dateLabel, 100 - MARGIN, MARGIN + 2.5, {
    size,
    weight: 600,
    track: 0.2,
    caps: true,
    color: MUTED,
    align: "right",
    maxW: 55,
  });
  return MARGIN + h;
}

/**
 * Three figures in a ruled band along the foot — the app's `StatBand`, drawn.
 *
 * Fixed height rather than a share of the card's, so it is the same band on a
 * square as on a story and only the amount of black above it changes.
 */
export function statBand(
  L: Layout,
  stats: { label: string; value: string }[],
) {
  const top = L.H - BAND_H;
  rule(L, 0, 100, top, CARDRULE);
  const col = 100 / stats.length;
  stats.forEach((s, i) => {
    const cx = col * i + col / 2;
    // A divider is the same hairline stood on its end.
    if (i) rule(L, col * i, col * i + 0.37, top, CARDRULE, BAND_H);
    const v = text(L, s.value, cx, top + 7.6, {
      size: 7.8,
      weight: 500,
      track: -0.02,
      color: FG,
      align: "center",
      // The design's band cells carry 12px of padding a side at 540 wide; with
      // the app's own stat labels, which run longer than the design's, that is
      // the difference between a figure inside a column and one touching the
      // card's edge.
      maxW: col - 4.4,
    });
    text(L, s.label, cx, v.bottom + 2.6, {
      size: 3.3,
      weight: 600,
      track: 0.2,
      caps: true,
      color: MUTED,
      align: "center",
      maxW: col - 4.4,
    });
  });
  return top;
}

/** The black between the header and whatever is at the foot. */
export function room(bottom: number) {
  const top = MARGIN + 8 + 4;
  return { top, bottom: bottom - 4, height: bottom - 4 - top };
}

/**
 * A line brought down to a width *before* it is drawn, and measured there.
 *
 * `text` already shrinks to fit, but it reports the height only afterwards —
 * which is no use to a card laid out from the bottom up, where the gap above a
 * figure has to be known before the figure is placed. So the shrink is done
 * here by arithmetic instead of by stepping, the box is measured at the size
 * that will actually be used, and the returned options carry `minScale: 1` so
 * `text` does not shrink it a second time: anything still too wide at the
 * floor is cut and marked rather than set smaller than the design allows.
 */
export function fit(
  L: Layout,
  s: string,
  o: TextOpts,
  maxW: number,
  minScale = 0.7,
): { opts: TextOpts; box: TextBox } {
  const opts = { ...o };
  const floor = o.size * minScale;
  let box = measure(L, s, opts);
  if (box.width > maxW) {
    // One proportional jump lands within a rounding error of the answer, and
    // the steps after it close that error. Both halves are needed: glyph
    // advances do not scale perfectly linearly, and a line that comes out a
    // twentieth of a unit too wide is still a line with an ellipsis on it.
    opts.size = Math.max(floor, opts.size * (maxW / box.width));
    box = measure(L, s, opts);
    while (box.width > maxW && opts.size > floor) {
      opts.size = Math.max(floor, opts.size - 0.25);
      box = measure(L, s, opts);
    }
  }
  return { opts: { ...opts, maxW, minScale: 1 }, box };
}

export type Cell = TextOpts & {
  text: string;
  /** Space to the left of this cell, in units. Ignored on the first. */
  gap?: number;
  /** How far this cell's foot sits above the row's. */
  lift?: number;
  /** Struck through — a record that has just been beaten. */
  strike?: boolean;
};

/**
 * Several strings side by side, sitting on one line.
 *
 * Two cards say a thing and then qualify it on the same line — `94 → 102.5 kg
 * est. 1RM`, `102.5 kg` — and CSS does that with `align-items:baseline` on a
 * flex row. Canvas has no rows, so the strings are measured, the group is
 * placed as a whole, and each one is dropped so its foot lands on the shared
 * line. Feet rather than baselines because none of these strings carries a
 * descender; for digits and caps the two are the same place, and a foot is
 * what `text` already reports.
 */
export function row(
  L: Layout,
  cells: Cell[],
  foot: number,
  x: number,
  align: "left" | "center" | "right" = "left",
) {
  const sized = cells.map((c) => ({ cell: c, box: measure(L, c.text, c) }));
  const total = sized.reduce(
    (t, s, i) => t + (i ? (s.cell.gap ?? 0) : 0) + s.box.width,
    0,
  );
  let cx =
    align === "left" ? x : align === "center" ? x - total / 2 : x - total;
  let top = foot;
  for (const [i, s] of sized.entries()) {
    if (i) cx += s.cell.gap ?? 0;
    const y = foot - (s.cell.lift ?? 0) - s.box.height;
    text(L, s.cell.text, cx, y, { ...s.cell, align: "left" });
    if (s.cell.strike)
      rule(
        L,
        cx,
        cx + s.box.width,
        y + s.box.height * 0.52,
        s.cell.color ?? FG,
        0.37,
      );
    cx += s.box.width;
    top = Math.min(top, y);
  }
  return { top, bottom: foot, width: total };
}

export type Line = TextOpts & {
  text: string;
  /** Space above this line, in units. Ignored on the first. */
  gap?: number;
};

/**
 * A stack of lines, measured as one object and centred in the space it is
 * given.
 *
 * Measuring first is what lets the whole group shrink together on a card too
 * short to take it: the alternative is each line fitting itself and the
 * proportions between them drifting per aspect. It also means a hero figure
 * three digits long comes down before it reaches the margins, rather than
 * being cut.
 */
export function stack(
  L: Layout,
  lines: Line[],
  space: { top: number; bottom: number },
  { at = CENTRE, align = 50 }: { at?: number; align?: number } = {},
) {
  const maxW = 100 - MARGIN * 2;
  const scaled = lines.map((l) => ({ ...l }));

  // The hero comes down to fit the card's width before anything else, so the
  // measurement below and the drawing agree on how tall it is.
  for (const l of scaled) {
    while (l.size > 2 && measure(L, l.text, l).width > maxW) l.size -= 0.5;
  }

  const total = () =>
    scaled.reduce(
      (t, l, i) => t + (i ? (l.gap ?? 4) : 0) + measure(L, l.text, l).height,
      0,
    );

  // Never more than seven eighths of the free height, so a short card keeps
  // air above and below rather than wedging the block between two rules.
  const fitTo = (space.bottom - space.top) * 0.87;
  let h = total();
  if (h > fitTo) {
    const k = fitTo / h;
    for (const l of scaled) l.size *= k;
    h = total();
  }

  let y = Math.max(
    space.top,
    Math.min(L.H * at - h / 2, space.bottom - h),
  );
  const first = y;
  const boxes = scaled.map((l, i) => {
    if (i) y += l.gap ?? 4;
    const b = text(L, l.text, align, y, { ...l, align: "center", maxW });
    y = b.bottom;
    return b;
  });
  return { top: first, bottom: y, boxes };
}

/**
 * A ruled list: a name on the left, a figure on the right, a hairline between
 * each pair.
 *
 * The receipt and the roster are the two cards that carry more than one fact,
 * and this is the app's own row vocabulary — the same one the session detail
 * and the muscle-group list are built from.
 */
export function ruledList(
  L: Layout,
  box: { x: number; y: number; w: number },
  rows: { left: string; right: string; mark?: boolean; color?: string }[],
  { size = 3.9, gap = 8.2 }: { size?: number; gap?: number } = {},
) {
  let y = box.y;
  rows.forEach((r, i) => {
    if (i) {
      rule(L, box.x, box.x + box.w, y, CARDRULE);
      y += gap * 0.42;
    }
    const right = text(L, r.right, box.x + box.w, y, {
      size,
      weight: 500,
      track: -0.01,
      color: r.color ?? FG,
      align: "right",
      maxW: box.w * 0.42,
    });
    text(L, r.left, box.x, y, {
      size,
      weight: 400,
      family: "sans",
      color: r.mark ? FG : MUTED,
      maxW: box.w * 0.55,
    });
    y = right.bottom + gap * 0.58;
  });
  return y;
}
