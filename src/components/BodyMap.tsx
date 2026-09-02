import { useEffect, useRef, useState } from "react";
import type { MuscleGroup, MuscleScore } from "../lib/strength";

export type BodyView = "front" | "back";

const SHELL = "#232329"; // silhouette behind the muscles — light enough to read as a body
const INERT = "#41414c"; // drawn muscle with nothing scored behind it
const EDGE = "rgba(0,0,0,.92)"; // seam between adjacent muscles

type Muscle = { d: string; group: MuscleGroup | null };

/* ---------------------------------------------------------------------------
 * Anatomy, authored for the RIGHT half of a 240x480 viewBox and mirrored across
 * x=120 so symmetry is exact and only half the paths need drawing.
 *
 * Grid: head 10-78 · shoulders y104 · armpit y158 · waist y246 (narrowest)
 *       hip y288 · crotch y292 · knee y382 · ankle y456 · foot y476
 * Arms hang clear of the torso (torso ends x=176, arm occupies 168-208).
 *
 * Muscles are drawn large enough to TILE their part of the body, leaving only
 * thin dark seams — small shapes floating on a grey shell read as a mannequin,
 * which is exactly what this is avoiding.
 * ------------------------------------------------------------------------- */

const FRONT: Muscle[] = [
  // upper trapezius — a band from the neck out to the shoulder
  { group: "back", d: "M126 90 C142 95 158 102 170 112 L163 126 C150 115 137 105 126 98 Z" },
  // deltoid — a cap over the joint only, it must not run the length of the arm
  { group: "shoulders", d: "M168 108 C188 114 200 130 200 152 C200 166 190 174 178 170 C170 156 165 124 168 108 Z" },
  // pectoral — starts inboard of centre so the mirrored pair reads as two, not one dome
  { group: "chest", d: "M127 114 C145 114 160 122 170 134 C168 150 156 163 137 166 L127 166 Z" },
  { group: null, d: "M143 180 C154 186 159 200 159 220 C159 236 154 247 147 251 C142 240 139 202 143 180 Z" },
  { group: "arms", d: "M180 180 C195 185 204 202 202 224 C200 242 192 251 185 249 C180 230 177 200 180 180 Z" },
  { group: "arms", d: "M185 256 C198 261 205 280 203 304 C201 326 196 339 190 343 C185 326 182 288 185 256 Z" },
  { group: "legs", d: "M150 306 C166 312 172 330 170 354 C168 372 160 382 152 384 C148 358 147 328 150 306 Z" },
  { group: "legs", d: "M129 306 C143 308 152 324 153 350 C154 370 148 383 140 385 C133 375 128 336 129 306 Z" },
  { group: "legs", d: "M127 346 C139 350 146 362 146 377 C146 386 140 390 133 388 C129 377 126 359 127 346 Z" },
  { group: "legs", d: "M131 398 C145 402 152 418 151 439 C150 454 145 461 139 461 C134 444 129 416 131 398 Z" },
];

const BACK: Muscle[] = [
  { group: "back", d: "M120 88 C140 94 160 104 174 118 C167 148 152 174 129 190 L120 190 Z" },
  { group: "shoulders", d: "M168 108 C188 114 200 130 200 152 C200 166 190 174 178 170 C170 156 165 124 168 108 Z" },
  { group: "back", d: "M122 152 C144 158 162 170 172 188 C165 208 150 224 129 234 L122 234 Z" },
  { group: "arms", d: "M180 180 C196 185 206 204 204 226 C202 244 194 253 187 251 C181 232 177 200 180 180 Z" },
  { group: "arms", d: "M185 256 C198 261 205 280 203 304 C201 326 196 339 190 343 C185 326 182 288 185 256 Z" },
  { group: "back", d: "M122 200 C133 206 141 220 141 244 C141 262 136 273 130 277 L122 277 Z" },
  { group: "glutes", d: "M122 258 C146 261 164 273 167 294 C164 313 150 324 129 326 L122 326 Z" },
  { group: "legs", d: "M129 332 C145 337 158 351 159 376 C159 399 151 414 142 418 C134 404 129 368 129 332 Z" },
  { group: "legs", d: "M131 396 C146 400 154 417 153 439 C152 455 146 462 140 462 C135 444 129 416 131 396 Z" },
];

/** Silhouette. Filled only — a stroke on the centre edge would seam the figure. */
const SHELL_PATHS = [
  // torso: neck -> trap -> shoulder -> ribcage -> waist -> hip
  "M120 84 L138 90 C158 98 174 110 178 126 C180 146 174 162 168 176 C162 200 157 226 154 250 C152 268 153 282 160 294 L120 300 Z",
  // arm, hanging clear of the torso
  "M172 108 C198 118 210 140 210 170 C210 214 204 258 200 298 C198 326 194 342 190 350 L170 350 C172 326 176 298 178 266 C180 218 168 140 172 108 Z",
  // leg: hip -> knee -> calf -> ankle
  "M122 296 C142 296 162 298 170 302 C173 334 168 362 162 386 C160 412 156 436 152 458 C150 470 148 474 146 478 L126 478 C126 446 127 412 128 386 C128 350 122 322 122 296 Z",
];

const STATIC_PATHS = [
  "M120 12 C140 12 152 30 152 48 C152 68 140 80 120 80 Z", // head
  "M120 70 L136 74 C138 82 140 88 142 92 L120 96 Z", // neck, overlapping the torso so they join
  "M190 349 C201 354 205 369 201 383 C197 394 188 398 181 393 C177 378 184 359 190 349 Z", // hand
  "M126 474 C142 474 157 479 160 486 C161 492 155 494 145 494 L126 494 Z", // foot
];

function Half({
  muscles,
  scores,
  selected,
  onSelect,
}: {
  muscles: Muscle[];
  scores: Partial<Record<MuscleGroup, MuscleScore>>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup) => void;
}) {
  return (
    <>
      {[...SHELL_PATHS, ...STATIC_PATHS].map((d, i) => (
        <path key={`s${i}`} d={d} fill={SHELL} />
      ))}
      {muscles.map((m, i) => {
        const sc = m.group ? scores[m.group] : undefined;
        const isSel = !!selected && m.group === selected;
        return (
          <path
            key={`m${i}`}
            d={m.d}
            fill={sc ? sc.color : INERT}
            fillOpacity={sc ? 0.6 + sc.score * 0.4 : 1}
            stroke={isSel ? "#fff" : EDGE}
            strokeWidth={isSel ? 2.2 : 1.6}
            strokeLinejoin="round"
            style={{
              cursor: m.group ? "pointer" : "default",
              filter: sc && sc.score > 0.05 ? `drop-shadow(0 0 ${1 + sc.score * 3}px ${sc.color})` : undefined,
              transition: "fill 220ms ease, fill-opacity 220ms ease",
            }}
            onClick={m.group ? () => onSelect(m.group!) : undefined}
          />
        );
      })}
    </>
  );
}

function Figure({
  muscles,
  scores,
  selected,
  onSelect,
}: {
  muscles: Muscle[];
  scores: Partial<Record<MuscleGroup, MuscleScore>>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup) => void;
}) {
  const half = <Half muscles={muscles} scores={scores} selected={selected} onSelect={onSelect} />;
  return (
    <svg viewBox="0 0 240 480" width="100%" height="100%" style={{ display: "block" }}>
      <g>{half}</g>
      <g transform="translate(240,0) scale(-1,1)">{half}</g>
      {muscles === FRONT &&
        [0, 1, 2].map((r) => (
          <g key={r}>
            {[102, 122].map((x) => (
              <rect
                key={x}
                x={x}
                y={176 + r * 26}
                width={16}
                height={20}
                rx={5}
                fill={INERT}
                stroke={EDGE}
                strokeWidth="1.6"
              />
            ))}
          </g>
        ))}
    </svg>
  );
}

/**
 * Front/back anatomical body map. Drag horizontally to spin the figure — the
 * rotation follows your finger and settles on whichever side you release nearest.
 */
export function BodyMap({
  scores,
  selected,
  onSelect,
  view,
  onViewChange,
}: {
  scores: Partial<Record<MuscleGroup, MuscleScore>>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup) => void;
  view: BodyView;
  onViewChange: (v: BodyView) => void;
}) {
  const base = view === "front" ? 0 : 180;
  const [drag, setDrag] = useState<number | null>(null);
  const startX = useRef(0);

  useEffect(() => setDrag(null), [view]);

  const angle = base + (drag ?? 0);

  function down(e: React.PointerEvent) {
    startX.current = e.clientX;
    setDrag(0);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (drag === null) return;
    setDrag((e.clientX - startX.current) * 0.8);
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
          perspective: 1100,
          touchAction: "pan-y",
          cursor: "grab",
          margin: "0 auto",
          maxWidth: 260,
          aspectRatio: "240 / 480",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            transform: `rotateY(${angle}deg)`,
            transition: drag === null ? "transform 420ms cubic-bezier(.22,.61,.36,1)" : "none",
          }}
        >
          <div style={face}>
            <Figure muscles={FRONT} scores={scores} selected={selected} onSelect={onSelect} />
          </div>
          <div style={{ ...face, transform: "rotateY(180deg)" }}>
            <Figure muscles={BACK} scores={scores} selected={selected} onSelect={onSelect} />
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
