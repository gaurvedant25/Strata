import { useMemo, useState } from "react";
import { useDialog, usePresence } from "../lib/useDialog";
import { bestSet, working } from "../lib/stats";
import { fmtClock, num } from "../lib/util";
import { useStore } from "../store";
import type { Exercise } from "../types";
import { Thumb } from "./ExercisePicker";
import { Check, Plus } from "./icons";
import { Scrim } from "./ui";

/** The filter row, in the order the library itself is laid out. */
const MUSCLES = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core"];
/** How the groups below the filter are ordered; anything else follows, A–Z. */
const GROUP_ORDER = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Legs",
  "Glutes",
  "Core",
  "Cardio",
  "Other",
];
/** How many lifts from your recent sessions are offered above the library. */
const RECENT = 6;
/** How many same-muscle lifts are offered first when replacing. */
const RECOMMENDED = 4;

type Mode =
  | { kind: "add" }
  | {
      kind: "replace";
      /** The exercise being swapped out, for the title and the suggestions. */
      exercise: Exercise;
    };

/**
 * Choosing what goes into a running workout.
 *
 * Two jobs in one sheet. Adding is a multi-select: tick as many as you like,
 * see them collect as chips at the foot, and put them in with one button —
 * because the common case is "add the two accessories I forgot", not one. Each
 * row says what you did with it last time, which is also what it will arrive
 * with. Replacing is a single tap: you have already said which lift is going,
 * so the ones that work the same muscle lead, and choosing one is the answer.
 *
 * Lifts already in the workout stay in the list, dimmed and marked, rather than
 * disappearing: a search that silently cannot find the bench press reads as a
 * missing exercise, not as one that is already there.
 */
export function AddExerciseSheet({
  open,
  mode,
  inSession,
  onClose,
  onAdd,
  onReplace,
  onCreate,
}: {
  open: boolean;
  mode: Mode;
  /** Exercise ids already in the workout. */
  inSession: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
  onReplace: (exercise: Exercise) => void;
  /** Nothing matched the search, and the typed name is to become an exercise. */
  onCreate: (name: string) => void;
}) {
  const s = useStore();
  const panel = useDialog(open, onClose);
  const { present, closing } = usePresence(open);
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("All");
  const [picks, setPicks] = useState<string[]>([]);
  // Reset on each opening rather than on close, so the sheet does not visibly
  // empty itself while it animates away.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQ("");
      setMuscle("All");
      setPicks([]);
    }
  }

  const replacing = mode.kind === "replace" ? mode.exercise : null;
  const needle = q.trim().toLowerCase();

  /** The last session that trained each lift: how many sets, and the best one. */
  const last = useMemo(() => {
    const map = new Map<string, { sets: number; best: ReturnType<typeof bestSet> }>();
    const ordered = s.sessions
      .filter((x) => x.endedAt && x.id !== s.activeSessionId)
      .sort((a, b) => b.startedAt - a.startedAt);
    for (const x of ordered)
      for (const e of x.entries) {
        if (map.has(e.exerciseId)) continue;
        const sets = working(e.sets);
        if (sets.length) map.set(e.exerciseId, { sets: sets.length, best: bestSet(sets) });
      }
    return map;
  }, [s.sessions, s.activeSessionId]);

  /** Lifts from your most recent workouts, newest first. */
  const recentIds = useMemo(() => {
    const ids: string[] = [];
    const ordered = s.sessions
      .filter((x) => x.endedAt && x.id !== s.activeSessionId)
      .sort((a, b) => b.startedAt - a.startedAt);
    for (const x of ordered)
      for (const e of x.entries)
        if (!ids.includes(e.exerciseId) && working(e.sets).length) ids.push(e.exerciseId);
    return ids;
  }, [s.sessions, s.activeSessionId]);

  const unit = s.settings.unit === "lb" ? "lbs" : "kg";
  function lastText(e: Exercise) {
    const l = last.get(e.id);
    if (!l || !l.best) return "Never logged";
    const b = l.best;
    const each =
      e.tracks === "time" ? fmtClock(b.seconds ?? 0) : String(b.reps);
    return `Last · ${l.sets} × ${each}${b.weight ? ` · ${num(b.weight)} ${unit}` : ""}`;
  }

  const library = s.exercises.filter((e) => !e.archived);
  const pool = library.filter(
    (e) =>
      (muscle === "All" || e.muscle === muscle) &&
      (!needle ||
        e.name.toLowerCase().includes(needle) ||
        e.muscle.toLowerCase().includes(needle)),
  );

  const sections: { label: string; lead: boolean; items: Exercise[]; showMuscle: boolean }[] = [];
  if (!needle && muscle === "All") {
    if (replacing) {
      const rec = library
        .filter((e) => e.muscle === replacing.muscle && e.id !== replacing.id && !inSession.has(e.id))
        .sort((a, b) => (last.has(b.id) ? 1 : 0) - (last.has(a.id) ? 1 : 0))
        .slice(0, RECOMMENDED);
      if (rec.length)
        sections.push({ label: "Recommended", lead: true, items: rec, showMuscle: true });
    } else {
      const rec = recentIds
        .filter((id) => !inSession.has(id))
        .map((id) => s.exerciseById.get(id))
        .filter((e): e is Exercise => !!e && !e.archived)
        .slice(0, RECENT);
      if (rec.length)
        sections.push({ label: "Recent", lead: true, items: rec, showMuscle: true });
    }
  }
  const groups = new Map<string, Exercise[]>();
  for (const e of pool) groups.set(e.muscle, [...(groups.get(e.muscle) ?? []), e]);
  const rank = (m: string) => {
    const i = GROUP_ORDER.indexOf(m);
    return i < 0 ? GROUP_ORDER.length : i;
  };
  [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .forEach(([m, list]) =>
      sections.push({
        label: m,
        lead: false,
        items: list.sort((a, b) => a.name.localeCompare(b.name)),
        showMuscle: false,
      }),
    );

  if (!present) return null;
  const title = replacing ? `Replace ${replacing.name}` : "Add exercise";
  const n = picks.length;

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-lg flex-col justify-end">
      <Scrim onClose={onClose} closing={closing} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-closing={closing || undefined}
        className="animate-rise leave-panel relative flex h-[88%] flex-col rounded-t-[20px] border-t border-rule bg-ink outline-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-rule px-5 py-3.5">
          <span className="min-w-0 flex-1 truncate font-mono text-label font-semibold uppercase tracking-[0.2em] text-muted">
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="-my-3 -mr-3 grid size-11 place-items-center font-mono text-[0.9375rem] text-muted active:text-fg"
          >
            ✕
          </button>
        </div>

        <div className="shrink-0 px-5 pt-3.5">
          <label className="flex h-11 items-center gap-2.5 rounded-full border border-rule bg-[#101010] px-4">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-dim)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search exercises…"
              aria-label="Search exercises"
              className="min-w-0 flex-1 bg-transparent text-[1rem] text-fg outline-none placeholder:text-dim"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                aria-label="Clear search"
                className="font-mono text-[0.8125rem] text-dim"
              >
                ✕
              </button>
            )}
          </label>
          <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 py-3">
            {MUSCLES.map((m) => {
              const on = muscle === m;
              return (
                <button
                  key={m}
                  onClick={() => setMuscle(m)}
                  aria-pressed={on}
                  className="press h-[34px] shrink-0 whitespace-nowrap rounded-full border px-3.5 font-mono text-label font-semibold uppercase tracking-[0.12em]"
                  style={{
                    borderColor: on ? "var(--color-fg)" : "var(--color-cardrule)",
                    background: on ? "var(--color-fg)" : "transparent",
                    color: on ? "#000" : "var(--color-muted)",
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto border-t border-subrule px-5 pb-6 pt-1">
          {sections.map((sec) => (
            <div key={sec.label} className="pt-3.5">
              <p
                className="mb-2 whitespace-nowrap font-mono text-label font-semibold uppercase tracking-[0.18em]"
                style={{ color: sec.lead ? "var(--color-fg)" : "var(--color-muted)" }}
              >
                {sec.label}
              </p>
              <div className="flex flex-col gap-1.5">
                {sec.items.map((e) => {
                  const taken = inSession.has(e.id);
                  const on = picks.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => {
                        if (taken) return;
                        if (replacing) onReplace(e);
                        else
                          setPicks((p) =>
                            p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id],
                          );
                      }}
                      aria-disabled={taken || undefined}
                      aria-pressed={replacing ? undefined : on}
                      className="press press-row flex items-center gap-3.5 rounded-xl py-1.5 pr-2 text-left"
                      style={{ opacity: taken ? 0.45 : 1 }}
                    >
                      <Thumb exercise={e} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-[0.9375rem] leading-[1.3]">{e.name}</span>
                        <span
                          className="whitespace-nowrap font-mono text-label font-medium"
                          style={{ color: taken ? "var(--color-faint)" : "var(--color-dim)" }}
                        >
                          {taken
                            ? "In this workout"
                            : (sec.showMuscle ? `${e.muscle} · ` : "") + lastText(e)}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="grid size-7 shrink-0 place-items-center rounded-full border transition-colors duration-[112ms]"
                        style={{
                          borderColor: on
                            ? "var(--color-fg)"
                            : taken || replacing
                              ? "transparent"
                              : "var(--color-faint)",
                          background: on ? "var(--color-fg)" : "transparent",
                          color: on ? "#000" : "var(--color-fg)",
                        }}
                      >
                        {on ? <Check size={14} /> : !taken && !replacing ? <Plus size={14} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {sections.length === 0 && (
            <div className="pt-7">
              <p className="text-[0.8125rem] text-muted">
                Nothing matches “{q.trim()}”.
              </p>
              {needle && (
                <button
                  onClick={() => onCreate(q.trim())}
                  className="press mt-4 h-13 w-full whitespace-nowrap rounded-full border border-rule font-mono text-[0.75rem] font-semibold uppercase tracking-[0.14em]"
                >
                  Create “{q.trim()}”
                </button>
              )}
            </div>
          )}
        </div>

        {!replacing && (
          <div className="flex shrink-0 flex-col gap-2.5 border-t border-rule px-5 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3.5">
            {n > 0 && (
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {picks.map((id) => (
                  <button
                    key={id}
                    onClick={() => setPicks((p) => p.filter((x) => x !== id))}
                    aria-label={`Remove ${s.exerciseById.get(id)?.name ?? "exercise"} from selection`}
                    className="press flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-cardrule bg-card pl-3 pr-2.5 text-[0.75rem]"
                  >
                    {s.exerciseById.get(id)?.name}
                    <span className="text-dim">✕</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => n && onAdd(picks)}
              disabled={!n}
              className="press h-13 whitespace-nowrap rounded-full font-mono text-[0.75rem] font-semibold uppercase tracking-[0.14em]"
              style={{
                background: n ? "var(--color-fg)" : "var(--color-rule)",
                color: n ? "#000" : "var(--color-dim)",
              }}
            >
              {n ? `Add ${n} exercise${n > 1 ? "s" : ""}` : "Select exercises"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
