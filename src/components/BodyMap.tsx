import { useEffect, useMemo, useRef, useState } from "react";
import {
  anatomy,
  groupForSlug,
  partPaths,
  type BodyView,
} from "../lib/anatomy";
import type { MuscleGroup, MuscleScore } from "../lib/strength";
import type { Gender } from "../types";
import {
  Callout,
  FIG_FRAC,
  STAGE_ASPECT,
  type Anchor,
  type CalloutLine,
} from "./Callout";

/**
 * Where each region's leader line lands, as a fraction of the figure's box.
 * A third entry marks a bilateral region, whose right-hand callout mirrors the
 * anchor so neither line has to cross the body.
 */
const ANCHOR: Record<BodyView, Partial<Record<MuscleGroup, Anchor>>> = {
  front: {
    chest: [0.5, 0.28],
    shoulders: [0.255, 0.235, true],
    biceps: [0.2, 0.35, true],
    forearms: [0.14, 0.45, true],
    abs: [0.5, 0.41],
    obliques: [0.34, 0.42, true],
    quadriceps: [0.385, 0.65, true],
    calves: [0.39, 0.83, true],
    traps: [0.5, 0.2],
    lats: [0.3, 0.36, true],
    lowerBack: [0.5, 0.46],
    triceps: [0.19, 0.35, true],
    hamstrings: [0.385, 0.68, true],
    glutes: [0.5, 0.52],
  },
  back: {
    traps: [0.5, 0.2],
    lats: [0.32, 0.33, true],
    lowerBack: [0.5, 0.45],
    glutes: [0.5, 0.52],
    triceps: [0.19, 0.35, true],
    forearms: [0.14, 0.45, true],
    hamstrings: [0.39, 0.66, true],
    calves: [0.39, 0.83, true],
    shoulders: [0.255, 0.235, true],
    biceps: [0.2, 0.35, true],
    chest: [0.5, 0.28],
    abs: [0.5, 0.41],
    obliques: [0.34, 0.42, true],
    quadriceps: [0.385, 0.65, true],
  },
};

export type Callouts = { left?: CalloutLine[]; right?: CalloutLine[] };

export type { BodyView };

/**
 * The two unlit tones.
 *
 * `SKIN` is a muscle that could be lit but has not been scored yet. `STRUCTURE`
 * is everything that never lights at all — head, neck, knees — and sits a shade
 * darker so a joint recedes instead of competing with the glow either side of
 * it. They used to be the other way round: the second tone was the *lighter* of
 * the two, because it was written for abs and obliques back when those were
 * drawn but unscorable. Those are scored regions now, so all it did was make
 * the knees the brightest thing on an unlit leg.
 */
const SKIN = "#3b3b45";
const STRUCTURE = "#34343d";
const EDGE = "rgba(0,0,0,.72)";

/** Mixes a hex colour toward white (positive) or black (negative) for the sheen. */
function shift(hex: string, amount: number) {
  const v = parseInt(hex.slice(1), 16);
  const mix = (c: number) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${mix((v >> 16) & 255)},${mix((v >> 8) & 255)},${mix(v & 255)})`;
}

const gradId = (hex: string) => `ds-${hex.slice(1)}`;

/** Half-thickness of the body, in px of the transformed space. */
const DEPTH = 16;
/** Silhouette copies stacked through the depth to give the figure volume. */
const LAYERS = 10;
/**
 * How far the figure is allowed to turn. There is no side-view artwork, so it
 * deliberately never approaches 90 degrees: past about 30 the flat faces would
 * foreshorten to nothing and the depth laminate would show its edges as a comb.
 * The far side arrives by cross-fade instead of by swinging through a profile
 * that does not exist.
 */
const MAX_TILT = 26;
/** Pointer travel, in px, that counts as a full turn. */
const TRAVEL = 150;

function Figure({
  gender,
  view,
  scores,
  selected,
  onSelect,
  opacity,
}: {
  gender: Gender;
  view: BodyView;
  scores: Partial<Record<MuscleGroup, MuscleScore>>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup) => void;
  opacity: number;
}) {
  const { parts, viewBox } = anatomy(gender, view);
  // one sheen gradient per tier colour actually in play
  const lit = [...new Set(Object.values(scores).map((s) => s.color))];
  return (
    <svg
      viewBox={viewBox}
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        display: "block",
        opacity,
        transform: `translateZ(${DEPTH}px)`,
        pointerEvents: opacity > 0.5 ? "auto" : "none",
        transition: "opacity 225ms var(--ease-settle)",
      }}
    >
      <defs>
        {lit.map((c) => (
          <linearGradient key={c} id={gradId(c)} x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0%" stopColor={shift(c, 0.5)} />
            <stop offset="55%" stopColor={c} />
            <stop offset="100%" stopColor={shift(c, -0.28)} />
          </linearGradient>
        ))}
      </defs>
      {parts.map((part) => {
        const group = groupForSlug(part.slug);
        const sc = group ? scores[group] : undefined;
        const isSel = !!selected && group === selected;
        const fill = sc
          ? `url(#${gradId(sc.color)})`
          : group
            ? SKIN
            : STRUCTURE;
        return (
          <g
            key={part.slug}
            data-slug={part.slug}
            transform={part.transform}
            onClick={group ? () => onSelect(group) : undefined}
            style={{
              cursor: group ? "pointer" : "default",
              // two stacked shadows: a tight rim plus a wide halo, which is what
              // makes a lit muscle glow rather than just sit on a coloured shape
              filter: sc
                ? `drop-shadow(0 0 ${3 + sc.score * 7}px ${sc.color}) drop-shadow(0 0 ${9 + sc.score * 20}px ${sc.color})`
                : undefined,
              transition: "filter 165ms var(--ease-settle)",
            }}
          >
            {partPaths(part).map((d, i) => (
              <path
                key={i}
                d={d}
                fill={fill}
                fillOpacity={sc ? 0.8 + sc.score * 0.2 : 1}
                stroke={isSel ? "#fff" : EDGE}
                strokeWidth={isSel ? 4 : 1.5}
                style={{
                  transition:
                    "fill 165ms var(--ease-settle), fill-opacity 165ms var(--ease-settle)",
                }}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Anatomical body map with depth.
 *
 * The artwork is two flat drawings with no side view, so the figure turns only
 * as far as flat art can honestly carry (see MAX_TILT) and the far side arrives
 * by cross-fade. Thickness is real: the silhouette is stacked through Z behind
 * the faces, which reads as volume at the shallow angles actually used.
 */
export function BodyMap({
  gender,
  scores,
  selected,
  onSelect,
  view,
  onViewChange,
  showToggle = true,
  maxWidth = 250,
  callouts = null,
}: {
  gender: Gender;
  scores: Partial<Record<MuscleGroup, MuscleScore>>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup) => void;
  view: BodyView;
  onViewChange: (v: BodyView) => void;
  /** Off when the screen supplies its own view switch. */
  showToggle?: boolean;
  maxWidth?: number;
  /** Annotations drawn onto the figure for the selected region. */
  callouts?: Callouts | null;
}) {
  const [p, setP] = useState(0); // drag progress, -1..1
  const startX = useRef(0);
  const dragging = useRef(false);

  const front = anatomy(gender, "front");
  const [, , vbW, vbH] = front.viewBox.split(" ").map(Number);

  /**
   * Depth layers are the same silhouette repeated, so it is baked to one
   * data-URL image the browser decodes once and composites, rather than
   * re-rasterising ~89 live paths per layer.
   *
   * It tracks the visible side rather than always using the front: the two
   * figures don't share an outline (the back has no feet), so a front-built
   * silhouette showed its toes poking out under the back view's ankles.
   */
  const shown = anatomy(gender, view);
  const silUrl = useMemo(() => {
    const d = shown.parts
      .flatMap(partPaths)
      .map((s) => `<path d="${s}"/>`)
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shown.viewBox}"><g fill="#1d1d24">${d}</g></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }, [shown]);

  useEffect(() => {
    setP(0);
  }, [view]);

  const k = Math.min(1, Math.abs(p));
  const other: BodyView = view === "front" ? "back" : "front";

  /**
   * The two drawings never overlap: the current one is gone by the halfway
   * point and the next only starts arriving after it, so mid-turn you see the
   * bare silhouette rather than a double exposure of front and back at once.
   */
  const outgoing = Math.max(0, 1 - k * 2);
  const incoming = Math.max(0, k * 2 - 1);

  function down(e: React.PointerEvent) {
    startX.current = e.clientX;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    setP(Math.max(-1, Math.min(1, dx / TRAVEL)));
  }
  function up() {
    if (!dragging.current) return;
    dragging.current = false;
    if (Math.abs(p) > 0.45) onViewChange(other);
    setP(0);
  }

  const settle = dragging.current
    ? "none"
    : "transform 240ms var(--ease-settle)";

  const anchor = (selected && ANCHOR[view][selected]) || ANCHOR[view].chest!;
  // Callouts need room either side, so the figure gives up the outer 60% of the
  // frame and the boxes live in it. Without them the figure keeps the width.
  const showCallouts = !!callouts && !!selected && !!ANCHOR[view][selected];

  return (
    <div className="select-none">
      <div
        style={
          showCallouts
            ? {
                position: "relative",
                width: "100%",
                aspectRatio: `${STAGE_ASPECT}`,
              }
            : undefined
        }
      >
        <div
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{
            perspective: 900,
            touchAction: "pan-y",
            cursor: "grab",
            position: showCallouts ? "absolute" : "relative",
            ...(showCallouts
              ? {
                  left: `${(0.5 - FIG_FRAC / 2) * 100}%`,
                  width: `${FIG_FRAC * 100}%`,
                  top: 0,
                  height: "100%",
                }
              : { margin: "0 auto", maxWidth, aspectRatio: `${vbW} / ${vbH}` }),
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              transformStyle: "preserve-3d",
              transform: `rotateY(${p * MAX_TILT}deg)`,
              transition: settle,
            }}
          >
            {/* laminate: one cached silhouette bitmap repeated through the depth */}
            {Array.from({ length: LAYERS }).map((_, i) => {
              const t = i / (LAYERS - 1);
              return (
                <img
                  key={i}
                  src={silUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    transform: `translateZ(${(-DEPTH + t * 2 * DEPTH) * 0.9}px)`,
                    pointerEvents: "none",
                  }}
                />
              );
            })}

            {/* both drawings sit at the same place and cross-fade as you turn */}
            <Figure
              gender={gender}
              view="front"
              scores={scores}
              selected={selected}
              onSelect={onSelect}
              opacity={view === "front" ? outgoing : incoming}
            />
            <Figure
              gender={gender}
              view="back"
              scores={scores}
              selected={selected}
              onSelect={onSelect}
              opacity={view === "back" ? outgoing : incoming}
            />
          </div>
        </div>

        {showCallouts && (
          <>
            {callouts!.left && (
              <Callout
                key={`l-${view}-${selected}`}
                side="left"
                lines={callouts!.left}
                anchor={anchor}
              />
            )}
            {callouts!.right && (
              <Callout
                key={`r-${view}-${selected}`}
                side="right"
                lines={callouts!.right}
                anchor={anchor}
              />
            )}
          </>
        )}
      </div>

      {showToggle && (
        <div className="mt-1 flex items-center justify-center gap-1">
          {(["front", "back"] as BodyView[]).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`rounded-full px-3 py-1 text-[0.6875rem] font-medium capitalize transition-colors ${
                view === v ? "bg-rule text-fg" : "text-muted"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
