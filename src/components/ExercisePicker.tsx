import { useMemo, useState } from "react";
import { exerciseArt } from "../lib/exerciseArt";
import { useStore } from "../store";
import type { Exercise } from "../types";
import { Dumbbell } from "./icons";
import { Eyebrow, Sheet, inputCls } from "./ui";

/**
 * The picture beside a name.
 *
 * Square and 56px: at that size an image cannot teach how a lift is
 * performed, and it is not trying to. It is there to be recognised — the shape
 * of a figure on a bench, at a cable stack, under a bar — which is faster to
 * scan than a column of similar names, and it is what separates one row from
 * the next now that the hairlines between them are gone.
 *
 * They are illustrations of the movement with the muscle it works picked out in
 * red — the one place in the app where a second colour is allowed, because that
 * red is what the picture is for. Each one is laid on the same card grey as the
 * tile, so the image has no edge of its own inside it, and nothing is done to
 * them here: `scripts/exercise-art.py` settles the ground and the tone, since a
 * filter applied at render would lift the image's grey off the tile's and draw
 * a square nobody asked for.
 *
 * `loading="lazy"` matters more here than it usually does: the library is
 * ninety-seven rows, and fetching every thumbnail to fill a sheet that opens
 * showing eight of them would be most of the work for none of the benefit.
 *
 * A row whose picture is missing or fails to load falls back to a mark rather
 * than a gap, so the column of images stays a column.
 */
function Thumb({ exercise }: { exercise: Exercise }) {
  const src = exerciseArt(exercise);
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-cardrule bg-card">
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          /*
           * The picture is not something to open.
           *
           * It is drawn at the one size it is meant to be seen at, and every
           * route out of that size shows it worse: a long press on iOS offers
           * Save Image and Open, a right click offers the same, and a drag
           * pulls the file onto the desktop. `pointer-events: none` takes the
           * image out of hit testing altogether, so all three of those land on
           * the row instead and offer what the row offers, which is to pick
           * the exercise. The tap still works, because the tap was always the
           * button's.
           *
           * This removes the affordance, not the file — a web app serves its
           * own images, and anyone who wants the URL can read it.
           */
          draggable={false}
          className="no-callout pointer-events-none size-full select-none object-cover"
        />
      ) : (
        <Dumbbell size={17} className="text-faint" />
      )}
    </span>
  );
}

export function ExercisePicker({
  open,
  onClose,
  onPick,
  title = "Add exercise",
  suggested,
  exclude,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  title?: string;
  /**
   * A few lifts to put above the library, best first.
   *
   * What the sheet is for decides whether this is worth anything. Adding an
   * exercise to a workout has no particular answer to lead with, so the picker
   * opens on the whole library. Replacing one does: you have just told the app
   * which lift you are trying to get out of, and the four nearest substitutes
   * are almost always among them, so putting them first turns a search into a
   * tap.
   */
  suggested?: Exercise[];
  /**
   * Lifts to leave out of the sheet entirely.
   *
   * Used for the ones already in the workout when replacing: offering them
   * would be offering to put a second copy of an exercise into a session that
   * already has it, which is never what the swipe meant.
   */
  exclude?: ReadonlySet<string>;
}) {
  const s = useStore();
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();

  const groups = useMemo(() => {
    const list = s.exercises
      .filter((e) => !e.archived)
      .filter((e) => !exclude?.has(e.id))
      .filter(
        (e) =>
          !needle ||
          e.name.toLowerCase().includes(needle) ||
          e.muscle.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    const m = new Map<string, Exercise[]>();
    for (const e of list) m.set(e.muscle, [...(m.get(e.muscle) ?? []), e]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [s.exercises, needle, exclude]);

  /*
   * A search replaces the recommendations rather than filtering them. Somebody
   * typing has a lift in mind and is no longer choosing from what was offered,
   * and leaving a shortened version of the list above their results would put
   * the same names on screen twice.
   */
  const recommended = needle ? [] : (suggested ?? []);

  /*
   * One row: a picture, a name, and — above the library, where there is no
   * heading to sit under — the group it belongs to.
   *
   * No rule between rows. The list used to be a hairline under every name,
   * which at ninety-seven entries is ninety-seven lines: the separation now
   * comes from the space around each row and from the column of images, and
   * the only rules left in the sheet are the ones that divide the groups.
   */
  const row = (e: Exercise, muscle?: string) => (
    <button
      key={e.id}
      onClick={() => onPick(e)}
      className="press press-row flex w-full items-center gap-3.5 rounded-xl py-1.5 pr-2 text-left active:bg-[#0e0e0e]"
    >
      <Thumb exercise={e} />
      <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug">
        {e.name}
      </span>
      {muscle && (
        <span className="shrink-0 font-mono text-label font-medium text-dim">
          {muscle}
        </span>
      )}
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <input
        className={`${inputCls} mb-5`}
        placeholder="Search exercises…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {recommended.length > 0 && (
        <div className="mb-8">
          <Eyebrow tone="fg" className="mb-2.5 block">
            Recommended
          </Eyebrow>
          {/*
            The group each one belongs to travels with it here. In the library
            below, a row's muscle is the heading it sits under; up here there is
            no heading, and four names with nothing beside them read as an
            arbitrary list rather than as a set of substitutes.
          */}
          <div className="space-y-1.5">
            {recommended.map((e) => row(e, e.muscle))}
          </div>
        </div>
      )}
      {groups.length === 0 && (
        <p className="py-6 text-[0.8125rem] text-muted">
          Nothing matches that.
        </p>
      )}
      {recommended.length > 0 && groups.length > 0 && (
        /* White, like Recommended above it: the two section labels have to
           read as a level above the muscle headings inside this one, which are
           the same shape in muted. */
        <Eyebrow tone="fg" className="mb-3 block">
          All exercises
        </Eyebrow>
      )}
      <div className="space-y-7">
        {groups.map(([m, list]) => (
          <div key={m}>
            {/* The one rule per group, above its name rather than under it: it
                is there to close the group before it, not to underline this
                one. */}
            <p className="mb-2.5 border-t border-rule pt-4 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted">
              {m}
            </p>
            <div className="space-y-1.5">{list.map((e) => row(e))}</div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
