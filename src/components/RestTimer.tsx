import { mmss } from "../lib/util";
import { useStore } from "../store";

export function RestTimer() {
  const s = useStore();
  if (s.restUntil == null) return null;

  const left = s.restLeft;
  const done = left <= 0;
  const pct = s.restTotal > 0 ? Math.max(0, Math.min(1, left / s.restTotal)) : 0;

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-40 px-3">
      <div className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel2/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <div className="h-1 w-full bg-line">
          <div
            className={done ? "h-full bg-accent" : "h-full bg-accent transition-[width] duration-1000 ease-linear"}
            style={{ width: `${done ? 100 : pct * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-muted">
              {done ? "Rest complete" : "Resting"}
            </p>
            <p
              className={`text-2xl font-bold tabular-nums leading-tight ${done ? "text-accent" : ""}`}
            >
              {mmss(left)}
            </p>
          </div>
          <button
            onClick={() => s.addRest(-15)}
            className="h-10 rounded-lg bg-panel px-3 text-[13px] font-medium text-white/80 active:bg-line"
          >
            −15s
          </button>
          <button
            onClick={() => s.addRest(15)}
            className="h-10 rounded-lg bg-panel px-3 text-[13px] font-medium text-white/80 active:bg-line"
          >
            +15s
          </button>
          <button
            onClick={s.stopRest}
            className="h-10 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-ink active:bg-accentdim"
          >
            {done ? "Done" : "Skip"}
          </button>
        </div>
      </div>
    </div>
  );
}
