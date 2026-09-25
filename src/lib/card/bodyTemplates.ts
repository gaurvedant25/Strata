import { anchorsFor } from "../anatomy/anchors";
import { TIER_COLOR, TIER_LEVEL, tierInk } from "../strength";
import {
  beginOverlay,
  endOverlay,
  ground,
  measure,
  panel,
  pill,
  rule,
  text,
  type Layout,
  type TextOpts,
} from "./draw";
import { drawFigure } from "./figure";
import { photoGround } from "./liftTemplates";
import { CARD, CARDRULE, FG, INK, MUTED } from "./tokens";
import type { BodyData, CardTemplate } from "./types";

/**
 * The body chart's cards.
 *
 * Poster and Annotated are the Body Share Cards canvas's 1a and 1b, drawn from
 * its measurements: the canvas frame is 400px wide and a card is 100 units, so
 * every value below is the design's pixels divided by four. Both are two-layer
 * cards like the workout and lift ones — a photograph (or black) underneath and
 * everything else on the one layer the share editor lets you drag, pinch and
 * recolour. The chosen ink replaces the design's white; the greys, the rules
 * and the tier colours stay as drawn, because those are what the card means.
 */

const ink = (L: Layout) => L.overlayColor ?? FG;
const M = 7.5;

/** A photograph if there is one, otherwise the design's full-bleed black. */
function base(L: Layout) {
  if (L.photo) return photoGround(L);
  if (L.renderMode !== "overlay") ground(L, INK);
  return false;
}

/** How tall a line of capitals or figures stands, for centring and baselines. */
const capH = (L: Layout, o: TextOpts) => measure(L, "H", o).height;

/** The mark in its pill, and the date: shared by both designs. */
function header(L: Layout, date: string) {
  const o: TextOpts = { family: "sans", size: 3.25, weight: 600, track: 0.22, caps: true };
  const w = measure(L, "Strata", o).width;
  const h = 8;
  pill(L, M, M, w + 8, h, ink(L));
  const top = M + (h - capH(L, o)) / 2;
  text(L, "Strata", M + 4, top, { ...o, color: INK });
  text(L, date, 100 - M, top, {
    family: "sans", size: 3.25, weight: 600, track: 0.2, caps: true,
    color: MUTED, align: "right", maxW: 50,
  });
}

/** The three strongest regions along the foot, ruled — the Poster's band. */
function band(L: Layout, d: BodyData) {
  const H = 25;
  const top = L.H - H;
  rule(L, 0, 100, top, CARDRULE, 0.25);
  const stats = d.top.slice(0, 3);
  const col = 100 / Math.max(1, stats.length);
  const vo: TextOpts = { family: "sans", size: 7.75, weight: 500, track: -0.02, align: "center" };
  const lo: TextOpts = { family: "sans", size: 3.25, weight: 600, track: 0.2, caps: true, align: "center" };
  const gap = 1.5;
  const block = capH(L, vo) + gap + capH(L, lo);
  const vTop = top + (H - block) / 2;
  stats.forEach((s, i) => {
    const cx = col * i + col / 2;
    if (i) rule(L, col * i, col * i + 0.25, top, CARDRULE, H);
    text(L, s.value, cx, vTop, { ...vo, color: ink(L), maxW: col - 4 });
    text(L, s.label, cx, vTop + capH(L, vo) + gap, { ...lo, color: MUTED, maxW: col - 4 });
  });
  return top;
}

export const bodyPoster: CardTemplate<"body"> = {
  id: "body/poster",
  name: "Poster",
  subject: "body",
  fits: (d) => !!d.headline.tier,
  draw(L, d) {
    base(L);
    if (!beginOverlay(L)) return;
    const square = L.aspect === "square";
    header(L, d.dateLabel);
    const bandTop = band(L, d);

    // Figure to the right, standing on the band. On a square the figure is
    // shorter and so its shoulders ride up beside the tier, so it moves over
    // and the tier gets the room to its left.
    const figTop = square ? 20 : 28;
    const figX = square ? 58 : 37.5;
    drawFigure(L, { x: figX, y: figTop, w: 92.5 - figX, h: Math.min(126.5, bandTop - figTop - 3) }, d);

    // The tier is the headline: region, rung, and what the rung means.
    const tier = d.headline.tier!;
    const lo: TextOpts = { size: 3, weight: 600, track: 0.2, caps: true, color: MUTED };
    const label = text(L, d.headline.label, M, 24.5, lo);
    const big = text(L, tier, M, label.bottom + 3.2, {
      family: "sans", size: 19, weight: 700, track: -0.03, color: TIER_COLOR[tier],
      maxW: square ? figX - M - 2 : 60, minScale: 0.5,
    });
    text(L, TIER_LEVEL[tier], M, big.bottom + 3.4, {
      family: "sans", size: 4, weight: 500, color: ink(L), maxW: 40,
    });
    endOverlay(L);
  },
};

/** A callout's size, in units: the design's 84px box. */
const BOX_W = 21;
const BOX_H = 18.75;

type Callout = {
  label: string;
  value: string;
  tier: BodyData["top"][number]["tier"];
  color: string;
  /** The point on the muscle, in card units. */
  at: [number, number];
  side: "left" | "right";
  mid: number;
};

/**
 * Where each box sits beside the figure.
 *
 * The strongest region takes the left, a little above its muscle as the design
 * has it; the next two share the right, spread apart around their muscles so
 * the boxes never touch. Every box is held inside the figure's own height, so
 * none of them drifts into the header or the footer.
 */
function place(list: Callout[], lo: number, hi: number) {
  const clamp = (v: number) => Math.max(lo, Math.min(hi, v));
  const left = list.filter((c) => c.side === "left");
  const right = list.filter((c) => c.side === "right").sort((a, b) => a.at[1] - b.at[1]);
  for (const c of left) c.mid = clamp(c.at[1] - 6);
  if (right.length === 1) right[0].mid = clamp(right[0].at[1] - 6);
  if (right.length === 2) {
    const centre = (right[0].at[1] + right[1].at[1]) / 2 + 3;
    const spread = Math.min(39.5, hi - lo);
    right[0].mid = clamp(centre - spread / 2);
    right[1].mid = clamp(right[0].mid + spread);
    right[0].mid = Math.min(right[0].mid, right[1].mid - spread);
  }
}

/** The leader line: out from the muscle, across, and into the box's edge. */
function leader(L: Layout, c: Callout) {
  const { ctx, u } = L;
  const [ax, ay] = c.at;
  const toLeft = c.side === "left";
  const edge = toLeft ? 3 + BOX_W : 97 - BOX_W;
  const out = toLeft ? 7 : 5.5;
  const into = toLeft ? 7.5 : 3.5;
  const x1 = toLeft ? ax - out : ax + out;
  const x2 = toLeft ? edge + into : edge - into;
  ctx.save();
  ctx.strokeStyle = ink(L);
  ctx.lineWidth = 0.25 * u;
  ctx.beginPath();
  ctx.moveTo(ax * u, ay * u);
  ctx.lineTo(x1 * u, ay * u);
  ctx.lineTo(x2 * u, c.mid * u);
  ctx.lineTo(edge * u, c.mid * u);
  ctx.stroke();
  ctx.fillStyle = ink(L);
  ctx.beginPath();
  ctx.arc(ax * u, ay * u, 0.75 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function box(L: Layout, c: Callout) {
  const x = c.side === "left" ? 3 : 97 - BOX_W;
  const y = c.mid - BOX_H / 2;
  panel(L, x, y, BOX_W, BOX_H, 2.5, { fill: CARD, stroke: CARDRULE, lineWidth: 0.25 });
  const mono: TextOpts = { size: 2.75, weight: 600, track: 0.08, caps: true, maxW: BOX_W - 5, minScale: 0.6 };
  const tx = x + 2.5;
  const l = text(L, c.label, tx, y + 2.6, { ...mono, color: MUTED });
  const v = text(L, c.value, tx, l.bottom + 2, {
    family: "sans", size: 6, weight: 500, track: -0.02, color: ink(L), maxW: BOX_W - 5, minScale: 0.5,
  });
  text(L, c.tier, tx, v.bottom + 2, { ...mono, color: c.color });
}

export const bodyAnnotated: CardTemplate<"body"> = {
  id: "body/annotated",
  name: "Annotated",
  subject: "body",
  // Needs at least one strong region drawn on the side being shown.
  fits: (d) => d.top.some((t) => anchorsFor(d.gender, d.view, t.group)),
  draw(L, d) {
    base(L);
    if (!beginOverlay(L)) return;
    const square = L.aspect === "square";
    header(L, d.dateLabel);

    // Footer first, so the figure knows how far down it may go.
    const ruleY = L.H - 19.25;
    const figTop = square ? 20 : 25;
    const fig = drawFigure(
      L,
      { x: 23.75, y: figTop, w: 52.75, h: Math.min(120, ruleY - figTop - 4) },
      d,
    );

    // The three strongest regions this side of the figure actually draws.
    const shown = d.top
      .map((t) => ({ t, a: anchorsFor(d.gender, d.view, t.group) }))
      .filter((x) => !!x.a)
      .slice(0, 3);
    const callouts: Callout[] = shown.map(({ t, a }, i) => {
      const side = i === 0 ? "left" : "right";
      const [fx, fy] = a![side];
      return {
        label: t.label,
        value: t.value,
        tier: t.tier,
        color: t.color,
        at: [fig.x + fx * fig.w, fig.y + fy * fig.h],
        side,
        mid: 0,
      };
    });
    place(callouts, figTop + BOX_H / 2, ruleY - 4 - BOX_H / 2);
    callouts.forEach((c) => leader(L, c));
    callouts.forEach((c) => box(L, c));

    // The foot: the headline region and its rung, and what the rung means.
    rule(L, M, 100 - M, ruleY, CARDRULE, 0.25);
    const big: TextOpts = { family: "sans", size: 6.5, weight: 600, track: -0.01 };
    const small: TextOpts = { size: 3, weight: 600, track: 0.2, caps: true };
    const top = ruleY + 5;
    const name = `${d.headline.label} `;
    text(L, name, M, top, { ...big, color: ink(L) });
    if (d.headline.tier) {
      text(L, d.headline.tier, M + measure(L, name, big).width, top, {
        ...big, color: TIER_COLOR[d.headline.tier],
      });
      text(L, `${TIER_LEVEL[d.headline.tier]} tier`, 100 - M, top + capH(L, big) - capH(L, small), {
        ...small, color: MUTED, align: "right",
      });
    }
    endOverlay(L);
  },
};

export const bodyRoster: CardTemplate<"body"> = {
  id: "body/roster",
  name: "The roster",
  subject: "body",
  fits: (d) => d.top.length >= 3,
  draw(L, d) {
    const square = L.aspect === "square";
    const rows = d.top.slice(0, 6);
    const h = square ? 76 : 96;
    const y = start(L, 40, 10, h);
    if (y == null) return;
    // Figure down the left, the ladder down the right: the one card that says
    // how the whole body is doing rather than picking a winner.
    const figW = 34;
    drawFigure(L, { x: 8, y, w: figW, h: h - 10 }, d);
    const x = 8 + figW + 5;
    const w = 92 - x;
    type(L, "STRONGEST", x, y + 2, 3.2, w);
    const gap = square ? 9.5 : 11.5;
    rows.forEach((t, i) => {
      const ry = y + 11 + i * gap;
      pill(L, x, ry + 0.6, 1.6, 1.6, t.color);
      type(L, t.label, x + 3.6, ry, 3.4, w - 18);
      type(L, t.value, 92, ry, 3.4, 16, "right");
      if (i < rows.length - 1)
        rule(L, x, 92, ry + gap - 3.4, ink(L), 0.12);
    });
    footer(L, d, y + h - 4);
    endOverlay(L);
  },
};

export const bodyTier: CardTemplate<"body"> = {
  id: "body/tier",
  name: "The tier",
  subject: "body",
  fits: (d) => !!d.headline.tier,
  draw(L, d) {
    const square = L.aspect === "square";
    const figH = square ? 36 : 70;
    const y = start(L, 30, 8, figH + 50);
    if (y == null) return;
    const tier = d.headline.tier!;
    const colour = TIER_COLOR[tier];
    // A solid patch of the rung's own colour, with its ink picked off it by
    // luminance the same way the app does.
    const patchW = 40;
    pill(L, 8, y, patchW, 11, colour);
    text(L, tier.toUpperCase(), 8 + patchW / 2, y + 3.2, {
      family: "sans",
      size: 5,
      weight: 700,
      track: 0.14,
      color: tierInk(colour),
      align: "center",
      maxW: patchW - 4,
      minScale: 0.5,
    });
    type(L, TIER_LEVEL[tier].toUpperCase(), 8, y + 15, 4.2);
    type(L, `${d.headline.label} · ${d.headline.value} ${d.headline.unit}`, 8, y + 22, 3);
    drawFigure(L, { x: 8, y: y + 29, w: 84, h: figH }, d);
    footer(L, d, y + figH + 36);
    endOverlay(L);
  },
};

// ─── Shared by The roster and The tier ──────────────────────────────────────

const type = (L: Layout, value: string, x: number, y: number, size = 3, width = 84, align?: "right") =>
  text(L, value, x, y, {
    family: "sans",
    weight: size >= 5 ? 700 : 500,
    size,
    color: L.overlayColor ?? "#ffffff",
    maxW: width,
    minScale: 0.4,
    align,
  });

/** The photo or the panel, then the moveable layer. Null in the photo-only pass. */
function start(L: Layout, story: number, square: number, height: number) {
  const photo = photoGround(L);
  if (!beginOverlay(L)) return null;
  const top = L.aspect === "square" ? square : story;
  if (!photo)
    panel(L, 5, top - 4, 90, height + 8, 2.4, {
      fill: "#1a1a1a",
      stroke: "#262626",
      lineWidth: 0.18,
    });
  return top;
}

function footer(L: Layout, d: BodyData, y: number) {
  type(L, `Strata · ${d.dateLabel}`, 8, y, 2.6);
}

export const BODY_TEMPLATES = [bodyPoster, bodyAnnotated, bodyRoster, bodyTier];
