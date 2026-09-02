import { useEffect, useRef, useState } from "react";
import { anatomy, groupForSlug, partPaths, type BodyView } from "../lib/anatomy";
import type { MuscleGroup, MuscleScore } from "../lib/strength";
import type { Gender } from "../types";

export type { BodyView };

const SKIN = "#26262c"; // body with no scored muscle behind it
const INERT = "#33333a"; // drawn muscle that has no benchmark lift (abs, obliques)
const EDGE = "rgba(0,0,0,.55)";

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
 * Anatomical body map. Drag horizontally to spin between front and back — the
 * rotation follows your finger and settles on whichever face you release nearest.
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
  const movedRef = useRef(false);

  // both faces share one box, so size it from the taller (front) figure and let
  // the other letterbox rather than crop
  const [, , vbW, vbH] = anatomy(gender, "front").viewBox.split(" ").map(Number);

  useEffect(() => setDrag(null), [view]);

  const angle = base + (drag ?? 0);

  function down(e: React.PointerEvent) {
    startX.current = e.clientX;
    movedRef.current = false;
    setDrag(0);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (drag === null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 5) movedRef.current = true;
    setDrag(dx * 0.8);
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

  return (
    <div className="select-none">
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{
          perspective: 1200,
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
            transition: drag === null ? "transform 430ms cubic-bezier(.22,.61,.36,1)" : "none",
          }}
        >
          <div style={face}>
            <Figure
              gender={gender}
              view="front"
              scores={scores}
              selected={selected}
              onSelect={onSelect}
            />
          </div>
          <div style={{ ...face, transform: "rotateY(180deg)" }}>
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
