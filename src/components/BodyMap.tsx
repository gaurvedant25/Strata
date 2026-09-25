import { useEffect, useMemo, useRef, type RefObject } from "react";
import { animate } from "motion";
import { FLICK, rubberband, velocityOf } from "../lib/gesture";
import {
  anatomy,
  groupForSlug,
  partPaths,
  type BodyView,
} from "../lib/anatomy";
import { anchorsFor } from "../lib/anatomy/anchors";
import type { MuscleGroup, MuscleScore } from "../lib/strength";
import type { Gender } from "../types";
import {
  Callout,
  FIG_FRAC,
  STAGE_ASPECT,
  type CalloutLine,
} from "./Callout";

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
export const SKIN = "#3b3b45";
export const STRUCTURE = "#34343d";
export const EDGE = "rgba(0,0,0,.72)";

/** Mixes a hex colour toward white (positive) or black (negative) for the sheen. */
export function shift(hex: string, amount: number) {
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

/**
 * Same check the scramble, the odometer and the chart's draw make. The global
 * reduced-motion rule in the stylesheet only reaches CSS transitions, and the
 * settle is a spring driven from script, so it has to ask for itself.
 */
const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Pointer travel, in px, that counts as a full turn. */
const TRAVEL = 150;

function Figure({
  gender,
  view,
  scores,
  selected,
  onSelect,
  opacity,
  svgRef,
}: {
  gender: Gender;
  view: BodyView;
  scores: Partial<Record<MuscleGroup, MuscleScore>>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup) => void;
  opacity: number;
  /** Lets the drag write this figure's opacity without a render. */
  svgRef?: RefObject<SVGSVGElement | null>;
}) {
  const { parts, viewBox } = anatomy(gender, view);
  // one sheen gradient per tier colour actually in play
  const lit = [...new Set(Object.values(scores).map((s) => s.color))];
  return (
    <svg
      ref={svgRef}
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
              // Almost no glow: one faint, tight rim in the tier's colour at a
              // quarter strength, so a lit muscle keeps a soft edge against the
              // black without the halo spilling across the figure. (It used to
              // be a tight rim plus a wide halo, both at full strength.)
              filter: sc
                ? `drop-shadow(0 0 4px ${sc.color}40)`
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
  onCalloutClick,
  onCalloutLabel,
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
  /** Makes the callout box a control — see `Callout`. */
  onCalloutClick?: () => void;
  onCalloutLabel?: string;
}) {
  /**
   * Drag progress, -1..1 — a ref, not state.
   *
   * It used to be `useState`, so every pointermove re-rendered this component
   * and both figures inside it to move one number. The whole surface it drives
   * is three inline styles, so it is written straight to those elements now and
   * React never hears about the drag at all.
   */
  const p = useRef(0);
  const startX = useRef(0);
  const dragging = useRef(false);
  /** Which finger owns the drag; later ones are ignored. */
  const pointer = useRef<number | null>(null);
  /** Recent positions, for measuring the speed of the release. */
  const track = useRef<{ x: number; t: number }[]>([]);
  /** The settle currently running, so a new gesture can cut it short. */
  const settling = useRef<{ stop: () => void } | null>(null);

  const stage = useRef<HTMLDivElement>(null);
  const frontSvg = useRef<SVGSVGElement>(null);
  const backSvg = useRef<SVGSVGElement>(null);

  /**
   * Writes the turn to the DOM.
   *
   * The single place `p` becomes visible: the tilt on the stage, and the
   * cross-fade between the two drawings. `live` is on while a finger is down,
   * which suppresses the figures' own opacity transition — a 225ms ease on a
   * value being written every frame lags the finger by a quarter second.
   */
  const paint = (v: number, live: boolean) => {
    p.current = v;
    const k = Math.min(1, Math.abs(v));
    const out = Math.max(0, 1 - k * 2);
    const inc = Math.max(0, k * 2 - 1);
    if (stage.current) {
      stage.current.style.transform = `rotateY(${v * MAX_TILT}deg)`;
    }
    const near = view === "front" ? frontSvg.current : backSvg.current;
    const far = view === "front" ? backSvg.current : frontSvg.current;
    for (const [el, o] of [
      [near, out],
      [far, inc],
    ] as const) {
      if (!el) continue;
      el.style.opacity = String(o);
      el.style.pointerEvents = o > 0.5 ? "auto" : "none";
      el.style.transition = live ? "none" : "opacity 225ms var(--ease-settle)";
    }
  };

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
    settling.current?.stop();
    settling.current = null;
    paint(0, false);
    // `paint` is recreated every render but only ever reads `view`, which is
    // this effect's own dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const other: BodyView = view === "front" ? "back" : "front";

  function down(e: React.PointerEvent) {
    // A second finger arriving mid-drag is ignored rather than allowed to take
    // over — without this, switching fingers jumps the figure to the new one.
    if (dragging.current) return;
    // Grabbing a figure still settling stops it where it is, so the drag picks
    // up from what the eye can see rather than from where it was headed.
    settling.current?.stop();
    settling.current = null;
    startX.current = e.clientX;
    dragging.current = true;
    pointer.current = e.pointerId;
    track.current = [{ x: e.clientX, t: performance.now() }];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent) {
    if (!dragging.current || e.pointerId !== pointer.current) return;
    const dx = e.clientX - startX.current;
    const raw = dx / TRAVEL;
    // Past a full turn the figure keeps following, but less and less. A hard
    // clamp here read as the drag having died under the finger.
    const over = Math.abs(raw) - 1;
    const next = over > 0 ? Math.sign(raw) * (1 + rubberband(over, 1)) : raw;
    track.current.push({ x: e.clientX, t: performance.now() });
    if (track.current.length > 8) track.current.shift();
    paint(next, true);
  }

  function up(e: React.PointerEvent) {
    if (!dragging.current || e.pointerId !== pointer.current) return;
    dragging.current = false;
    pointer.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);

    const v = velocityOf(track.current); // px/ms, signed
    const travelled = p.current;
    // A flick counts on its own. Requiring it to also cross half the travel is
    // what made this gesture feel heavy: you threw the figure, nothing moved,
    // and you learned to drag it instead.
    const flicked =
      Math.abs(v) > FLICK && Math.sign(v) === Math.sign(travelled);
    if (Math.abs(travelled) > 0.45 || flicked) onViewChange(other);

    if (reduced()) {
      paint(0, false);
      return;
    }
    // Back to rest on a spring rather than a fixed curve, handed the speed the
    // finger had at release — so there is no seam between letting go and the
    // figure carrying on. `p` is a plain number, so the spring drives it and
    // `paint` puts it on screen.
    const controls = animate(travelled, 0, {
      type: "spring",
      duration: 0.5,
      bounce: 0.2,
      velocity: -v / TRAVEL, // px/ms of finger -> units of `p` per ms
      onUpdate: (value) => paint(value, false),
    });
    settling.current = { stop: () => controls.stop() };
    void controls.finished.then(() => {
      settling.current = null;
    });
  }

  /**
   * Where this region's two lines leave the body, measured per figure and per
   * side. Absent when the region is not drawn on the side being shown — the
   * back of the figure has no chest to point at — and the callouts stay down.
   */
  const anchors = selected ? anchorsFor(gender, view, selected) : undefined;
  /*
   * Callouts need room either side, so the figure gives up the outer 60% of
   * the frame and the boxes live in it.
   *
   * Geometry, not content: a screen that annotates the figure gives those
   * gutters up for good, whether or not the region in view has anything to say
   * in them. This used to follow the callouts themselves, so selecting a
   * muscle with nothing logged against it handed the gutters back and the
   * figure grew to fill the card — a tap on an unscored muscle looked like the
   * whole chart zooming in, and tapping a scored one snapped it back.
   */
  const framed = callouts !== null;
  const showCallouts = framed && !!anchors;

  return (
    <div className="select-none">
      <div
        style={
          framed
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
            position: framed ? "absolute" : "relative",
            ...(framed
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
            ref={stage}
            style={{
              position: "absolute",
              inset: 0,
              transformStyle: "preserve-3d",
              // The turn is written straight to this node by `paint`; React
              // renders it at rest and never touches it again.
              transform: "rotateY(0deg)",
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
              svgRef={frontSvg}
              opacity={view === "front" ? 1 : 0}
            />
            <Figure
              gender={gender}
              view="back"
              scores={scores}
              selected={selected}
              onSelect={onSelect}
              svgRef={backSvg}
              opacity={view === "back" ? 1 : 0}
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
                anchor={anchors!.left}
              />
            )}
            {callouts!.right && (
              <Callout
                key={`r-${view}-${selected}`}
                side="right"
                lines={callouts!.right}
                anchor={anchors!.right}
                onClick={onCalloutClick}
                label={onCalloutLabel}
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
