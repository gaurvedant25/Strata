import { beginOverlay, endOverlay, ground, panel, text, type Layout } from "./draw";
import { drawCurve } from "./curve";
import { photoSize } from "./photo";
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

function cardGround(L: Layout) {
  if (L.renderMode === "overlay") return;
  ground(L, INK);
  panel(L, 4, 4, 92, L.H - 8, 2.4, {
    fill: CARD,
    stroke: CARD_RULE,
    lineWidth: 0.2,
  });
}

export function photoGround(L: Layout) {
  if (L.renderMode === "overlay") return !!L.photo;
  const { ctx, photo, w, h } = L;
  if (!photo) { cardGround(L); return false; }
  ground(L, INK);
  const { width: iw, height: ih } = photoSize(
    { width: photo.image.naturalWidth, height: photo.image.naturalHeight },
    { width: w, height: h }, photo.zoom,
  );
  ctx.save();
  ctx.translate(w * photo.x, h * photo.y);
  ctx.rotate((photo.rotation * Math.PI) / 180);
  ctx.drawImage(photo.image, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
  // Match the single fade used in the live photo preview exactly.
  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, "rgba(0,0,0,.42)");
  fade.addColorStop(0.2, "rgba(0,0,0,.04)");
  fade.addColorStop(0.62, "rgba(0,0,0,.04)");
  fade.addColorStop(1, "rgba(0,0,0,.68)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  return true;
}

function compactSignature(L: Layout, d: LiftData, y: number) {
  label(L, `Strata · ${d.currentStreak} day streak`, M, y, 72);
}

export const liftMoment: CardTemplate<"lift"> = {
  id: "lift/moment",
  name: "Lift snapshot",
  subject: "lift",
  draw(L, d) {
    const hasPhoto = photoGround(L);
    if (!beginOverlay(L)) return;
    const square = L.aspect === "square";
    const top = square ? 55 : 114;
    if (!hasPhoto) panel(L, 5, top - 4, 78, 38, 2, {
      fill: RAISED, stroke: CARD_RULE, lineWidth: 0.18,
    });
    headline(L, d.name, top, 4.8, 72);
    const value = headline(L, `${d.current} ${d.unit}`, top + 7, 14, 72);
    const metric = label(L, d.metricLabel, M, value.bottom + 2, 72);
    compactSignature(L, d, metric.bottom + 3.5);
    endOverlay(L);
  },
};

export const liftPoster: CardTemplate<"lift"> = {
  id: "lift/poster",
  name: "Record poster",
  subject: "lift",
  pro: true,
  draw(L, d) {
    const hasPhoto = photoGround(L);
    if (!beginOverlay(L)) return;
    const square = L.aspect === "square";
    const top = square ? 46 : 104;
    if (!hasPhoto) panel(L, 5, top - 4, 78, 44, 2, {
      fill: RAISED, stroke: CARD_RULE, lineWidth: 0.18,
    });
    label(L, d.record ? "Personal best" : "Latest lift", M, top, 72);
    const value = headline(L, `${d.current} ${d.unit}`, top + 6, 18, 72);
    const name = headline(L, d.name, value.bottom + 3, 4.8, 72);
    const metric = label(L, d.metricLabel, M, name.bottom + 2, 72);
    compactSignature(L, d, metric.bottom + 3.5);
    endOverlay(L);
  },
};

export const liftJourney: CardTemplate<"lift"> = {
  id: "lift/journey",
  name: "Then → Now",
  subject: "lift",
  pro: true,
  fits: (d) => d.values.length >= 2 && d.values.every(Number.isFinite),
  draw(L, d) {
    const hasPhoto = photoGround(L);
    if (!beginOverlay(L)) return;
    const square = L.aspect === "square";
    const top = square ? 15 : 80;
    if (!hasPhoto) panel(L, 5, top - 4, 90, square ? 74 : 80, 2, {
      fill: RAISED, stroke: CARD_RULE, lineWidth: 0.18,
    });
    headline(L, d.name, top, 5.5);
    label(L, `${d.metricLabel} / ${d.unit}`, M, top + 8);

    const chartTop = top + 16;
    const chartH = square ? 18 : 24;
    drawCurve(L, { x: M, y: chartTop, w: W, h: chartH }, d.values, {
      color: ink(L), lineWidth: 0.55, markers: "dots", head: { r: 1.05, color: ink(L) },
    });
    const y = chartTop + chartH + 4;
    label(L, d.fromLabel, M, y, 38);
    text(L, d.toLabel, 92, y, {
      size: 2.8, family: "sans", weight: 500, color: ink(L), align: "right", maxW: 38,
    });
    text(L, d.start, M, y + 6, {
      size: 7, family: "sans", weight: 700, color: ink(L), maxW: 37, minScale: 0.4,
    });
    text(L, d.current, 92, y + 6, {
      size: 7, family: "sans", weight: 700, color: ink(L), align: "right", maxW: 37, minScale: 0.4,
    });
    headline(L, `${d.delta} ${d.unit} change`, y + 17, 5);
    compactSignature(L, d, y + 25);
    endOverlay(L);
  },
};
