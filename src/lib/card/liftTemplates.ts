import { beginOverlay, clipPanel, endOverlay, ground, panel, rule, text, type Layout } from "./draw";
import { drawCurve } from "./curve";
import { INK } from "./tokens";
import type { CardTemplate, LiftData } from "./types";

const WHITE = "#ffffff";
const CARD = "#121212";
const CARD_RULE = "#262626";
const RAISED = "#1a1a1a";
const M = 8;
const W = 84;

const ink = (L: Layout) => L.overlayColor ?? WHITE;

const label = (L: Layout, value: string, x: number, y: number, maxW = W) =>
  text(L, value, x, y, {
    size: 2.8,
    family: "sans",
    weight: 500,
    color: ink(L),
    maxW,
    minScale: 0.72,
  });

const headline = (L: Layout, value: string, y: number, size = 9, maxW = W) =>
  text(L, value, M, y, {
    size,
    family: "sans",
    weight: 700,
    color: ink(L),
    maxW,
    minScale: 0.45,
  });

function quietRule(L: Layout, y: number) {
  L.ctx.save();
  L.ctx.globalAlpha = 0.24;
  rule(L, M, 92, y, ink(L), 0.12);
  L.ctx.restore();
}

function cardGround(L: Layout) {
  if (L.renderMode === "overlay") return;
  ground(L, INK);
  panel(L, 4, 4, 92, L.H - 8, 2.4, {
    fill: CARD,
    stroke: CARD_RULE,
    lineWidth: 0.2,
  });
}

function photoGround(L: Layout) {
  if (L.renderMode === "overlay") return !!L.photo;
  cardGround(L);
  const { ctx, photo, u } = L;
  if (!photo) return false;
  const x = 4 * u;
  const y = 4 * u;
  const w = 92 * u;
  const h = (L.H - 8) * u;
  const scale = Math.max(w / photo.image.naturalWidth, h / photo.image.naturalHeight) * photo.zoom;
  const iw = photo.image.naturalWidth * scale;
  const ih = photo.image.naturalHeight * scale;

  clipPanel(L, 4, 4, 92, L.H - 8, 2.4, () => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, w, h);
    const left = x - (iw - w) * photo.x;
    const top = y - (ih - h) * photo.y;
    ctx.save();
    ctx.translate(left + iw / 2, top + ih / 2);
    ctx.rotate((photo.rotation * Math.PI) / 180);
    ctx.drawImage(photo.image, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,.04)";
    ctx.fillRect(x, y, w, h);
    const fade = ctx.createLinearGradient(0, y, 0, y + h);
    fade.addColorStop(0, "rgba(0,0,0,.42)");
    fade.addColorStop(0.2, "rgba(0,0,0,.04)");
    fade.addColorStop(0.62, "rgba(0,0,0,.04)");
    fade.addColorStop(1, "rgba(0,0,0,.68)");
    ctx.fillStyle = fade;
    ctx.fillRect(x, y, w, h);
  });
  panel(L, 4, 4, 92, L.H - 8, 2.4, { stroke: CARD_RULE, lineWidth: 0.2 });
  return true;
}

function meta(L: Layout, d: LiftData, name: string, y: number) {
  label(L, `${name} · ${d.currentStreak} day streak`, M, y);
}

function signature(L: Layout, d: LiftData, y: number) {
  label(L, `Gym Log · ${d.toLabel}`, M, y);
}

function changeLine(d: LiftData) {
  return d.values.length > 1
    ? `${d.delta} ${d.unit} · ${d.sinceLabel}`
    : `${d.dateLabel} · First reading`;
}

export const liftMoment: CardTemplate<"lift"> = {
  id: "lift/moment",
  name: "Lift snapshot",
  subject: "lift",
  draw(L, d) {
    const hasPhoto = photoGround(L);
    if (!beginOverlay(L)) return;
    const square = L.aspect === "square";
    const top = square ? (hasPhoto ? 19 : 19) : (hasPhoto ? 54 : 27);
    if (!hasPhoto) panel(L, 6, square ? 13 : 21, 88, square ? 78 : 132, 2, {
      fill: RAISED, stroke: CARD_RULE, lineWidth: 0.18,
    });
    meta(L, d, "Lift snapshot", top);
    label(L, d.record ? "Personal best" : "Current progress", M, top + 7);
    headline(L, d.name, top + 14, square ? 6.2 : 8);
    const value = headline(L, d.current, top + (square ? 25 : 29), square ? 20 : 27);
    label(L, `${d.unit} / ${d.metricLabel}`, M, value.bottom + 2);
    quietRule(L, top + (square ? 51 : 70));
    headline(L, `${d.delta} ${d.unit}`, top + (square ? 57 : 78), square ? 8 : 11);
    label(L, d.values.length > 1 ? d.sinceLabel : "First reading", M, top + (square ? 68 : 92));
    signature(L, d, top + (square ? 74 : 112));
    endOverlay(L);
  },
};

export const liftPoster: CardTemplate<"lift"> = {
  id: "lift/poster",
  name: "Record poster",
  subject: "lift",
  draw(L, d) {
    const hasPhoto = photoGround(L);
    if (!beginOverlay(L)) return;
    const square = L.aspect === "square";
    const top = square ? 22 : (hasPhoto ? 70 : 38);
    meta(L, d, d.record ? "Personal best" : "Latest lift", top);
    headline(L, d.name, top + 9, square ? 6.4 : 8.2);
    const value = headline(L, d.current, top + (square ? 21 : 24), square ? 25 : 34);
    label(L, `${d.unit} / ${d.metricLabel}`, M, value.bottom + 2);
    label(L, d.record
      ? `${d.record.gain} ${d.unit} beyond previous best`
      : changeLine(d), M, top + (square ? 55 : 70));
    signature(L, d, top + (square ? 64 : 91));
    endOverlay(L);
  },
};

export const liftJourney: CardTemplate<"lift"> = {
  id: "lift/journey",
  name: "Then → Now",
  subject: "lift",
  fits: (d) => d.values.length >= 2 && d.values.every(Number.isFinite),
  draw(L, d) {
    const hasPhoto = photoGround(L);
    if (!beginOverlay(L)) return;
    const square = L.aspect === "square";
    const top = square ? 9 : 23;
    if (!hasPhoto) panel(L, 6, square ? 7 : 18, 88, square ? 88 : 140, 2, {
      fill: RAISED, stroke: CARD_RULE, lineWidth: 0.18,
    });
    meta(L, d, "Progress", top);
    headline(L, d.name, top + 8, square ? 5.8 : 7.4);
    label(L, `${d.metricLabel} / ${d.unit}`, M, top + (square ? 15 : 19));

    const chartTop = top + (square ? 22 : 31);
    const chartH = square ? 18 : 46;
    drawCurve(L, { x: M, y: chartTop, w: W, h: chartH }, d.values, {
      color: ink(L), lineWidth: 0.55, markers: "dots", head: { r: 1.05, color: ink(L) },
    });
    const y = chartTop + chartH + 4;
    label(L, d.fromLabel, M, y, 38);
    text(L, d.toLabel, 92, y, {
      size: 2.8, family: "sans", weight: 500, color: ink(L), align: "right", maxW: 38,
    });
    text(L, d.start, M, y + 6, {
      size: square ? 7 : 11, family: "sans", weight: 700, color: ink(L), maxW: 37, minScale: 0.4,
    });
    text(L, d.current, 92, y + 6, {
      size: square ? 7 : 11, family: "sans", weight: 700, color: ink(L), align: "right", maxW: 37, minScale: 0.4,
    });
    quietRule(L, y + (square ? 14 : 20));
    headline(L, `${d.delta} ${d.unit}`, y + (square ? 18 : 27), square ? 8 : 10);
    label(L, "Change over this period", M, y + (square ? 27 : 40));
    signature(L, d, y + (square ? 33 : 48));
    endOverlay(L);
  },
};
