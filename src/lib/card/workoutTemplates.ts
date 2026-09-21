import { anatomy, groupForSlug, partPaths, type BodyView } from "../anatomy";
import { beginOverlay, endOverlay, panel, rule, text, type Layout } from "./draw";
import { photoGround } from "./liftTemplates";
import type { CardTemplate, WorkoutData } from "./types";

const ink = (L: Layout) => L.overlayColor ?? "#ffffff";
const type = (L: Layout, value: string, x: number, y: number, size = 3, width = 84) =>
  text(L, value, x, y, { family: "sans", weight: size >= 5 ? 700 : 500,
    size, color: ink(L), maxW: width, minScale: 0.4 });
const count = (d: WorkoutData) => d.records.length + Number(d.volumeRecord);
const prs = (d: WorkoutData) => `${count(d)} record${count(d) === 1 ? "" : "s"}`;

function start(L: Layout, height = 62, wild = false) {
  const photo = photoGround(L);
  if (!beginOverlay(L)) return null;
  const top = L.aspect === "square" ? (wild ? 8 : 22) : (wild ? 62 : 92);
  if (!photo) panel(L, 5, top - 4, 90, height + 8, 2.4, {
    fill: "#1a1a1a", stroke: "#262626", lineWidth: 0.18,
  });
  return top;
}

function footer(L: Layout, d: WorkoutData, y: number) {
  type(L, `Gym Log · ${d.dateLabel}`, 8, y, 2.6);
}

function summary(L: Layout, d: WorkoutData, y: number, lead: "streak" | "volume" | "records") {
  const items = lead === "streak" ? [`${d.volume} ${d.unit} volume`, d.duration, prs(d)]
    : lead === "volume" ? [`${d.currentStreak} day streak`, d.duration, prs(d)]
    : [`${d.currentStreak} day streak`, `${d.volume} ${d.unit} volume`, d.duration];
  type(L, items.join(" · "), 8, y, 3);
}

export const workoutStreak: CardTemplate<"workout"> = {
  id: "workout/streak", name: "Streak", subject: "workout",
  draw(L, d) {
    const y = start(L, 58); if (y == null) return;
    type(L, d.name, 8, y, 4.5);
    const figure = type(L, String(d.currentStreak), 8, y + 8, 40, 44);
    type(L, "DAY", 56, y + 14, 9, 36);
    type(L, "STREAK", 56, y + 25, 7.4, 36);
    const bottom = Math.max(y + 44, figure.bottom + 4);
    summary(L, d, bottom, "streak");
    footer(L, d, bottom + 7);
    endOverlay(L);
  },
};

export const workoutVolume: CardTemplate<"workout"> = {
  id: "workout/volume", pro: true, name: "Heavy work", subject: "workout",
  draw(L, d) {
    const y = start(L, 56); if (y == null) return;
    type(L, d.volumeRecord ? "SESSION VOLUME PB" : "TOTAL VOLUME", 8, y, 3.2);
    const value = type(L, d.volume, 8, y + 7, 27);
    type(L, `${d.unit} lifted · ${d.sets} completed sets`, 8, value.bottom + 2, 3.2);
    type(L, d.name, 8, y + 35, 5);
    summary(L, d, y + 45, "volume");
    footer(L, d, y + 52);
    endOverlay(L);
  },
};

export const workoutRecords: CardTemplate<"workout"> = {
  id: "workout/records", pro: true, name: "Record breaker", subject: "workout",
  draw(L, d) {
    const y = start(L, 68); if (y == null) return;
    type(L, count(d) ? "RECORDS BROKEN" : "SESSION COMPLETE", 8, y, 5.2);
    type(L, String(count(d)).padStart(2, "0"), 8, y + 8, 31, 37);
    type(L, count(d) ? "NEW" : "NO NEW", 49, y + 13, 7, 43);
    type(L, "RECORDS", 49, y + 22, 6, 43);
    // Each improvement is named by metric; multiple metrics on one lift count separately.
    const details = [
      ...(d.volumeRecord ? [`Session volume · ${d.volume} ${d.unit}`] : []),
      ...d.records.map(r => `${r.name} · ${r.metric}`),
    ];
    if (details.length) {
      details.slice(0, 2).forEach((value, i) => type(L, value, 8, y + 40 + i * 5, 3));
      if (details.length > 2) type(L, `+${details.length - 2} more metric records`, 8, y + 50, 2.7);
    } else {
      type(L, d.name, 8, y + 40, 4.5);
      type(L, "First entries and tied bests aren't broken records.", 8, y + 48, 2.7);
    }
    summary(L, d, y + 57, "records");
    footer(L, d, y + 64);
    endOverlay(L);
  },
};

const paths = new Map<string, Path2D>();
/** Reuse the app's real anatomy, with flat ink and no strength tiers or shadows. */
function trainingFigure(L: Layout, d: WorkoutData, view: BodyView, x: number, y: number) {
  const { parts, viewBox } = anatomy(d.gender, view);
  const [vx, vy, vw, vh] = viewBox.split(" ").map(Number);
  const scale = Math.min(22 * L.u / vw, 49 * L.u / vh);
  L.ctx.save();
  // Compose with the user's overlay transform; never reset the canvas matrix.
  L.ctx.translate(x * L.u, y * L.u);
  L.ctx.scale(scale, scale);
  L.ctx.translate(-vx, -vy);
  L.ctx.fillStyle = ink(L);
  for (const part of parts) {
    const group = groupForSlug(part.slug);
    L.ctx.globalAlpha = group && d.muscles.includes(group) ? 1 : 0.17;
    for (const path of partPaths(part)) {
      if (!paths.has(path)) paths.set(path, new Path2D(path));
      L.ctx.fill(paths.get(path)!);
    }
  }
  L.ctx.restore();
}

export const workoutScan: CardTemplate<"workout"> = {
  id: "workout/scan", pro: true, name: "Training scan · Wild card", subject: "workout",
  draw(L, d) {
    const y = start(L, 78, true); if (y == null) return;
    type(L, "TRAINING SCAN", 8, y, 7.5);
    type(L, d.name, 8, y + 10, 3.3);
    trainingFigure(L, d, "front", 8, y + 18);
    trainingFigure(L, d, "back", 32, y + 18);
    type(L, String(d.currentStreak), 61, y + 19, 19, 31);
    type(L, "DAY STREAK", 61, y + 36, 2.8, 31);
    type(L, d.duration, 61, y + 43, 6.2, 31);
    type(L, `${d.volume} ${d.unit}`, 61, y + 53, 4, 31);
    type(L, `volume · ${prs(d)}`, 61, y + 59, 2.6, 31);
    type(L, d.muscles.length ? "Highlighted: logged muscle groups" : "No mapped muscle groups logged", 8, y + 68, 2.6);
    footer(L, d, y + 75);
    endOverlay(L);
  },
};

export const workoutReceipt: CardTemplate<"workout"> = {
  id: "workout/receipt", pro: true, name: "Session receipt · Wild card", subject: "workout",
  draw(L, d) {
    const y = start(L, 76, true); if (y == null) return;
    type(L, "SESSION / RECEIPT", 10, y, 4.6, 80);
    type(L, d.duration, 10, y + 9, 22, 80);
    type(L, "TIME LOGGED", 10, y + 29, 2.8, 80);
    rule(L, 10, 90, y + 36, ink(L), 0.25);
    type(L, `${d.volume} ${d.unit}`, 10, y + 40, 11, 80);
    type(L, `${d.volumeRecord ? "VOLUME PB" : "TOTAL VOLUME"} · ${prs(d)}`, 10, y + 52, 3, 80);
    type(L, `${d.currentStreak} DAY STREAK / ${d.sets} SETS`, 10, y + 59, 4, 80);
    // A tally, not a fake barcode or QR code. The printed count remains exact.
    for (let i = 0; i < Math.min(d.sets, 32); i++) {
      L.ctx.fillStyle = ink(L);
      L.ctx.fillRect((10 + i * 2.5) * L.u, (y + 67) * L.u, 0.75 * L.u, 3 * L.u);
    }
    type(L, `Gym Log · ${d.dateLabel}`, 10, y + 73, 2.6, 80);
    endOverlay(L);
  },
};

export const WORKOUT_TEMPLATES = [workoutStreak, workoutVolume, workoutRecords, workoutScan, workoutReceipt];
