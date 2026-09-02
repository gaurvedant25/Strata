import { useEffect, useMemo, useRef, useState } from "react";
import { anatomy, groupForSlug, partPaths, type BodyView } from "../lib/anatomy";
import type { MuscleGroup, MuscleScore } from "../lib/strength";
import type { Gender } from "../types";

export type { BodyView };

const SKIN = "#26262c"; // body with no scored muscle behind it
const INERT = "#33333a"; // drawn muscle that has no benchmark lift (abs, obliques)
const EDGE = "rgba(0,0,0,.55)";

/** Half-thickness of the body, in px of the transformed space. */
const DEPTH = 18;
/** Silhouette copies stacked through the depth to give the figure volume. */
const LAYERS = 14;

function Figure({
  gender,
  view,
  scores,
  selected,
  onSelect,
}: {
  gender: Gender;
  view: BodyView;
  scores: Partial<Record<MuscleGroup, MuscleScore>>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup) => void;
}) {
  const { parts, viewBox } = anatomy(gender, view);
  return (
    <svg viewBox={viewBox} width="100%" height="100%" style={{ display: "block" }}>
      {parts.map((part) => {
        const group = groupForSlug(part.slug);
        const sc = group ? scores[group] : undefined;
        const isSel = !!selected && group === selected;
        const fill = sc ? sc.color : group ? SKIN : INERT;
        return (
          <g
            key={part.slug}
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
 * Anatomical body map with real depth.
 *
 * The artwork is two flat drawings, so thickness is built rather than drawn:
 * the silhouette is stacked through Z as a laminate, and the front and back
 * faces sit at either end of it. That way the figure orbits an axis with
 * parallax and shows a solid edge side-on, instead of a zero-width card flip.
 * Drag horizontally to spin; it settles on whichever face you release nearest.
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
  const base = view === "front" ? 0 : 180;
  const [drag, setDrag] = useState<number | null>(null);
  const startX = useRef(0);

  const front = anatomy(gender, "front");
  const [, , vbW, vbH] = front.viewBox.split(" ").map(Number);

  /**
   * The depth layers are the same silhouette repeated, so it's baked to one
   * data-URL image the browser decodes once and composites cheaply. Repeating
   * the ~89 live paths per layer instead costs about a thousand shapes a frame,
   * which measured at 1fps.
   */
  const silUrl = useMemo(() => {
    const d = front.parts
      .flatMap(partPaths)
      .map((p) => `<path d="${p}"/>`)
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${front.viewBox}"><g fill="#1d1d24">${d}</g></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }, [front]);

  useEffect(() => setDrag(null), [view]);

  const angle = base + (drag ?? 0);
  const rad = (angle * Math.PI) / 180;
  // faces dim as they rotate away from the viewer, which is what reads as volume
  const facing = Math.abs(Math.cos(rad));
  const shade = 0.55 + 0.45 * facing;

  function down(e: React.PointerEvent) {
    startX.current = e.clientX;
    setDrag(0);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (drag === null) return;
    setDrag((e.clientX - startX.current) * 0.85);
  }
  function up() {
    if (drag === null) return;
    const norm = ((angle % 360) + 360) % 360;
    const next: BodyView = norm > 90 && norm < 270 ? "back" : "front";
    setDrag(null);
    if (next !== view) onViewChange(next);
  }

  const face: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };
  const spin = drag === null ? "transform 430ms cubic-bezier(.22,.61,.36,1)" : "none";

  return (
    <div className="select-none">
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{
          perspective: 760,
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
            transform: `rotateY(${angle}deg)`,
            transition: spin,
          }}
        >
          {/* laminate: one cached silhouette bitmap repeated through the depth */}
          {Array.from({ length: LAYERS }).map((_, i) => {
            const t = i / (LAYERS - 1); // 0 at back, 1 at front
            const z = (-DEPTH + t * 2 * DEPTH) * 0.92;
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
                  transform: `translateZ(${z}px)`,
                  pointerEvents: "none",
                }}
              />
            );
          })}

          <div style={{ ...face, transform: `translateZ(${DEPTH}px)`, filter: `brightness(${shade})` }}>
            <Figure
              gender={gender}
              view="front"
              scores={scores}
              selected={selected}
              onSelect={onSelect}
            />
          </div>
          <div
            style={{
              ...face,
              transform: `rotateY(180deg) translateZ(${DEPTH}px)`,
              filter: `brightness(${shade})`,
            }}
          >
            <Figure
              gender={gender}
              view="back"
              scores={scores}
              selected={selected}
              onSelect={onSelect}
            />
          </div>
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
