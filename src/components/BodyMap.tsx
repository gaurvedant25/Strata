import { useEffect, useMemo, useRef, useState } from "react";
import { anatomy, groupForSlug, partPaths, type BodyView } from "../lib/anatomy";
import type { MuscleGroup, MuscleScore } from "../lib/strength";
import type { Gender } from "../types";

export type { BodyView };

const SKIN = "#26262c"; // body with no scored muscle behind it
const INERT = "#33333a"; // drawn muscle that has no benchmark lift (abs, obliques)
const EDGE = "rgba(0,0,0,.55)";

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
        transition: "opacity 300ms ease",
      }}
    >
      {parts.map((part) => {
        const group = groupForSlug(part.slug);
        const sc = group ? scores[group] : undefined;
        const isSel = !!selected && group === selected;
        const fill = sc ? sc.color : group ? SKIN : INERT;
        return (
          <g
            key={part.slug}
            data-slug={part.slug}
            transform={part.transform}
            onClick={group ? () => onSelect(group) : undefined}
            style={{
              cursor: group ? "pointer" : "default",
              filter: sc && sc.score > 0.05 ? `drop-shadow(0 0 ${3 + sc.score * 9}px ${sc.color})` : undefined,
              transition: "filter 220ms ease",
            }}
          >
            {partPaths(part).map((d, i) => (
              <path
                key={i}
                d={d}
                fill={fill}
                fillOpacity={sc ? 0.55 + sc.score * 0.45 : 1}
                stroke={isSel ? "#fff" : EDGE}
                strokeWidth={isSel ? 4 : 1.5}
                style={{ transition: "fill 220ms ease, fill-opacity 220ms ease" }}
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
}: {
  gender: Gender;
  scores: Partial<Record<MuscleGroup, MuscleScore>>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup) => void;
  view: BodyView;
  onViewChange: (v: BodyView) => void;
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

  useEffect(() => setP(0), [view]);

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

  const settle = dragging.current ? "none" : "transform 320ms cubic-bezier(.22,.61,.36,1)";

  return (
    <div className="select-none">
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{
          perspective: 900,
          touchAction: "pan-y",
          cursor: "grab",
          margin: "0 auto",
          maxWidth: 250,
          aspectRatio: `${vbW} / ${vbH}`,
          position: "relative",
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

      <div className="mt-1 flex items-center justify-center gap-1">
        {(["front", "back"] as BodyView[]).map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize transition-colors ${
              view === v ? "bg-panel2 text-white" : "text-muted"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
