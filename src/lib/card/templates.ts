import { liftMoment, liftPoster, liftJourney } from "./liftTemplates";
import { WORKOUT_TEMPLATES } from "./workoutTemplates";
import { BODY_TEMPLATES } from "./bodyTemplates";
import {
  MARGIN,
  header,
  room,
  stack,
  statBand,
} from "./chrome";
import {
  glow,
  ground,
  pill,
  rule,
  text,
} from "./draw";
import {
  CARDRULE,
  EMBER,
  EMBER_RGB,
  FG,
  INK,
  MUTED,
} from "./tokens";
import type { CardSubject, CardTemplate } from "./types";

/**
 * Every card the app can send.
 *
 * All of them share the same grammar — a mark and a date across the top, one
 * thing said large, the figures ruled at the foot — and differ in what gets to
 * be the large thing. That is the whole answer to "so it doesn't get boring":
 * three ways of looking at each subject, rotated automatically, rather than
 * one card seen over and over.
 *
 * The warm tone belongs to the streak and appears on no other card. Tier
 * colours are the body chart's own language and appear only there.
 */

/** The card's one idea, said as large as the shape allows. */
const HERO = 50.4;

// ─── Streak ──────────────────────────────────────────────────────────────────

const streakFigure: CardTemplate<"streak"> = {
  id: "streak/figure",
  name: "Figure",
  subject: "streak",
  draw(L, d) {
    ground(L, INK);
    header(L, d.dateLabel);
    const space = room(statBand(L, d.stats));
    // The heat goes down before the number does: on a black ground this is
    // what keeps the figure from looking pasted on.
    glow(L, 50, L.H * 0.5, 52, EMBER_RGB, 0.2);
    stack(
      L,
      [
        { text: String(d.days), size: HERO, weight: 500, track: -0.06, color: EMBER },
        { text: "Day streak", size: 4.4, weight: 600, track: 0.34, caps: true, color: FG, gap: 6.7 },
        { text: d.subject, size: 3.3, weight: 600, track: 0.24, caps: true, color: MUTED, gap: 5.2 },
      ],
      space,
    );
  },
};

const streakBest: CardTemplate<"streak"> = {
  id: "streak/best",
  name: "Against your best",
  subject: "streak",
  // Nothing to measure against until there is a longer run behind you.
  fits: (d) => d.best > d.days,
  draw(L, d) {
    ground(L, INK);
    header(L, d.dateLabel);
    const bandTop = statBand(L, d.stats);
    const space = room(bandTop);
    // The bar hangs off the band rather than off the number, so it sits the
    // same distance up from the foot on every shape and the figure above it
    // gets whatever is left.
    const barY = bandTop - 13;
    glow(L, 50, (space.top + barY) / 2, 46, EMBER_RGB, 0.18);
    stack(
      L,
      [
        { text: String(d.days), size: HERO * 0.82, weight: 500, track: -0.06, color: EMBER },
        { text: "Day streak", size: 4, weight: 600, track: 0.34, caps: true, color: FG, gap: 6 },
      ],
      { top: space.top, bottom: barY - 8 },
    );

    // The run as a share of the best one, and what is left to beat it. A bar
    // rather than a ring: a card is read flat and at a glance, and a length is
    // the one comparison that survives being seen sideways.
    const w = 100 - MARGIN * 2;
    rule(L, MARGIN, MARGIN + w, barY, CARDRULE, 0.6);
    rule(L, MARGIN, MARGIN + w * Math.min(1, d.days / d.best), barY, EMBER, 0.6);
    text(L, `Best ${d.best}`, MARGIN, barY + 3.4, {
      size: 3.3, weight: 600, track: 0.16, caps: true, color: MUTED,
    });
    text(L, `${d.best - d.days + 1} to beat it`, 100 - MARGIN, barY + 3.4, {
      size: 3.3, weight: 600, track: 0.16, caps: true, color: MUTED, align: "right",
    });
  },
};

const streakGrid: CardTemplate<"streak"> = {
  id: "streak/grid",
  name: "Twelve weeks",
  subject: "streak",
  fits: (d) => d.recent.some(Boolean),
  draw(L, d) {
    ground(L, INK);
    header(L, d.dateLabel);
    const space = room(statBand(L, d.stats));

    // Twelve weeks as columns, one row per weekday: the shape of the habit
    // rather than the size of the streak. The run you are on is the block of
    // lit cells at the right-hand end, and it needs no highlighting to find.
    const cols = 12;
    const rows = 7;
    const gap = 1.1;
    const w = 100 - MARGIN * 2;
    const cell = (w - gap * (cols - 1)) / cols;
    const gridH = rows * cell + gap * (rows - 1);

    const capH = 10;
    const s = stack(
      L,
      [
        { text: `${d.days} day streak`, size: 7.4, weight: 600, track: 0.12, caps: true, color: FG },
      ],
      { top: space.top, bottom: space.bottom - gridH - capH - 8 },
      { at: 0.34 },
    );

    const top = Math.max(s.bottom + 9, space.bottom - gridH - capH);
    glow(L, 50, top + gridH / 2, 44, EMBER_RGB, 0.1);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const i = c * rows + r;
        const on = d.recent[d.recent.length - cols * rows + i] ?? false;
        pill(
          L,
          MARGIN + c * (cell + gap),
          top + r * (cell + gap),
          cell,
          cell,
          on ? EMBER : "#1c1c1c",
        );
      }
    }
    text(L, d.subject, 50, top + gridH + 5.5, {
      size: 3.3, weight: 600, track: 0.24, caps: true, color: MUTED, align: "center",
      maxW: w,
    });
  },
};


/**
 * The whole set, in the order they are rotated through.
 *
 * Adding a card is appending one object here. Nothing else in the app knows a
 * template id, so no screen, no picker and no stored preference has to learn
 * about it.
 */
export const TEMPLATES: CardTemplate[] = [
  streakFigure,
  streakBest,
  streakGrid,
  liftMoment,
  liftPoster,
  liftJourney,
  ...BODY_TEMPLATES,
  ...WORKOUT_TEMPLATES,
] as CardTemplate[];

/**
 * The templates that have something to say about this particular data.
 *
 * Untyped in the payload on purpose: the registry holds all four subjects in
 * one array, so a template's own data type is only knowable once its subject
 * is.  is the single place that ties the two back together.
 */
export function templatesFor(
  subject: CardSubject,
  data: unknown,
): CardTemplate[] {
  const all = TEMPLATES.filter((t) => t.subject === subject);
  const usable = all.filter((t) => !t.fits || t.fits(data as never));
  // Never nothing: the first card of every subject is written to work with
  // whatever the app can give it.
  return usable.length ? usable : all.slice(0, 1);
}
