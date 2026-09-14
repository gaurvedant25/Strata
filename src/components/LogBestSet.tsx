import { useEffect, useState } from "react";
import { e1rm } from "../lib/stats";
import {
  BODYWEIGHT_LOADED,
  MUSCLE_LABEL,
  RANKING_LIFTS,
  REGION_SEED,
  type MuscleGroup,
} from "../lib/strength";
import { fmtClock, num, todayKey, uid } from "../lib/util";
import { useStore } from "../store";
import { Button, EditableNumber, Eyebrow, Sheet } from "./ui";
import { Numeral, resetNumerals } from "./Numeral";

/**
 * Score a region from one remembered set.
 *
 * The strength screen scores a region off the best set it can find in the log,
 * which leaves a new account staring at fourteen empty regions and a box saying
 * "log a lift" — an instruction that, until now, meant going away and training
 * before the screen would say anything at all. Almost everyone already knows
 * what their best bench is. This asks for it.
 *
 * Two questions, in the order they can be answered: which lift, then what you
 * did on it. The lift has to come first because it decides what the second
 * question means — added weight for a pull-up, absolute weight for a squat.
 *
 * What it writes is an ordinary finished session dated today, so nothing
 * downstream has to know these sets arrived through a shortcut: the same
 * personal-record maths that reads a real workout reads this one.
 */
export function LogBestSet({
  open,
  muscle,
  onClose,
}: {
  open: boolean;
  muscle: MuscleGroup | null;
  onClose: () => void;
}) {
  const s = useStore();
  const unit = s.settings.unit;
  const unitLabel = unit === "lb" ? "lbs" : "kg";

  const [lift, setLift] = useState<string | null>(null);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(8);
  const [seconds, setSeconds] = useState(60);
  const [saving, setSaving] = useState(false);

  // Every open is a fresh answer: reopening on another region must not inherit
  // the last one's lift, and reopening on the same one should still start from
  // the question rather than from a half-filled form.
  useEffect(() => {
    if (!open) return;
    setLift(null);
    setSaving(false);
    resetNumerals("best:");
  }, [open, muscle]);

  if (!muscle) return null;
  // Bound once so the closures below carry the narrowed type with them.
  const m: MuscleGroup = muscle;

  const exercises = s.exercises.filter((e) => !e.archived);
  const byName = new Map(exercises.map((e) => [e.name, e]));

  /*
   * Only lifts that can actually rank the region are offered.
   *
   * This used to add "everything else in the library filed under the same
   * muscle", which read as generosity and worked as a trap: a region is ranked
   * on its own set of lifts, so answering this question with anything outside
   * that set logged a real set and left the region grey — the one outcome the
   * question exists to prevent.
   *
   * The lifts that can be answered as they stand lead — which includes the
   * pull-up and the dip, since those are scored on the body doing them. The ones
   * that follow are scored on the plate alone, and rank only once there is one.
   */
  const region = MUSCLE_LABEL[m];
  const inLibrary = (n: string) => byName.has(n);
  const preferred = RANKING_LIFTS[m]
    .filter((l) => (!l.added || l.carriesBodyweight) && inLibrary(l.name))
    .map((l) => l.name);
  const rest = RANKING_LIFTS[m]
    .filter((l) => l.added && !l.carriesBodyweight && inLibrary(l.name))
    .map((l) => l.name);

  const ex = lift ? byName.get(lift) : undefined;
  const added = !!ex?.bodyweight;
  /** A bodyweight lift whose score already counts the lifter, so zero is an answer. */
  const carries = !!ex && BODYWEIGHT_LOADED.has(ex.name);
  /** Held against a clock rather than counted out: a plank. */
  const holds =
    !!lift && RANKING_LIFTS[m].some((l) => l.name === lift && l.hold);
  const step = unit === "lb" ? 5 : 2.5;

  function choose(name: string) {
    const picked = byName.get(name);
    const factor = RANKING_LIFTS[m].find((l) => l.name === name)?.factor ?? 1;
    setLift(name);
    // A bodyweight movement is scored on what you hung off it, which starts at
    // nothing; everything else opens near the middle of the region's own band,
    // converted into the lift being answered, so the common answer is a nudge
    // away rather than twenty taps.
    setWeight(picked?.bodyweight ? 0 : seed(m, unit, factor));
    setReps(REGION_SEED[m].reps);
    setSeconds(60);
  }

  // Read on what the lift is scored on: a pull-up counts you, so the estimate
  // has to as well, or the sheet quotes 17 kg and the strength screen says 79.
  const bw = s.bodyweight[s.bodyweight.length - 1]?.weight ?? 0;
  const est = e1rm(carries ? bw + weight : weight, reps);

  async function save() {
    if (!ex || saving) return;
    setSaving(true);
    const at = Date.now();
    await s.saveSession({
      id: uid(),
      name: `${region} best`,
      date: todayKey(),
      startedAt: at,
      endedAt: at,
      note: "Best set, entered from the strength screen.",
      entries: [
        {
          id: uid(),
          exerciseId: ex.id,
          // A held set carries the clock and leaves reps at zero, which is
          // the shape everything downstream already knows how to read.
          sets: [
            holds
              ? { id: uid(), reps: 0, weight, seconds, done: true }
              : { id: uid(), reps, weight, done: true },
          ],
        },
      ],
    });
    // Only a lift that can produce a ratio becomes the region's benchmark —
    // which rules out the movements scored on the plate alone, since a plate of
    // nothing has no ratio, but not a pull-up, which is scored on you.
    if (!ex.bodyweight || carries) {
      await s.saveSettings({
        benchmarks: { ...s.settings.benchmarks, [m]: lift },
      });
    }
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={lift ? `Your best ${lift}` : `Best ${region.toLowerCase()} lift`}
      footer={
        lift ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setLift(null)}
            >
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={
                saving || (holds ? seconds <= 0 : !added && weight <= 0)
              }
              onClick={() => void save()}
            >
              {saving ? "Scoring…" : `Score ${region.toLowerCase()}`}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!lift ? (
        <>
          <p className="mb-4 text-[0.8125rem] leading-relaxed text-muted text-pretty">
            Pick the lift you want {region.toLowerCase()} scored on. Your best
            ever set is the right answer — this is a ceiling, not today's
            session.
          </p>
          <Group title="Suggested" names={preferred} onPick={choose} />
          {rest.length > 0 && (
            <Group
              title="Scored on added weight"
              names={rest}
              onPick={choose}
            />
          )}
        </>
      ) : (
        <div className="space-y-6">
          <div>
            <Eyebrow>{added ? "Added weight" : "Weight"}</Eyebrow>
            <div className="pt-2">
              <EditableNumber
                value={weight}
                display={<Numeral id="best:weight" text={num(weight, 1)} />}
                unit={unitLabel}
                label={added ? "Added weight" : "Weight"}
                max={2000}
                onChange={setWeight}
              />
            </div>
            <Steps
              steps={[-step * 2, -step, step, step * 2]}
              onStep={(d) => setWeight((w) => Math.max(0, +(w + d).toFixed(1)))}
            />
          </div>

          {holds ? (
            <div>
              <Eyebrow>How long you held it</Eyebrow>
              <div className="pt-2">
                <EditableNumber
                  value={seconds}
                  display={<Numeral id="best:hold" text={String(seconds)} />}
                  unit="sec"
                  label="How long you held it"
                  decimals={0}
                  min={1}
                  max={3600}
                  onChange={setSeconds}
                />
              </div>
              <Steps
                steps={[-30, -10, 10, 30]}
                onStep={(d) => setSeconds((x) => Math.max(1, x + d))}
              />
            </div>
          ) : (
            <div>
              <Eyebrow>Reps in that set</Eyebrow>
              <div className="pt-2">
                <EditableNumber
                  value={reps}
                  display={<Numeral id="best:reps" text={String(reps)} />}
                  unit="reps"
                  label="Reps in that set"
                  decimals={0}
                  min={1}
                  max={100}
                  onChange={setReps}
                />
              </div>
              <Steps
                steps={[-5, -1, 1, 5]}
                onStep={(d) => setReps((r) => Math.max(1, r + d))}
              />
            </div>
          )}

          {/* Seconds are the easy thing to type and the hard thing to read, so
              the entry takes them and this line hands them back as a clock. */}
          <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-3.5">
            <Eyebrow tone="dim">
              {holds ? "That hold" : "Estimated 1RM"}
            </Eyebrow>
            <span className="font-mono text-[0.9375rem]">
              {holds ? fmtClock(seconds) : `${num(est)} ${unitLabel}`}
            </span>
          </div>

          {added && (
            <p className="text-[0.75rem] leading-relaxed text-dim text-pretty">
              {holds ? (
                <>
                  A plank holds up most of your bodyweight, and that is what it
                  is scored on — leave this at zero unless you had a plate on
                  your back.
                </>
              ) : carries ? (
                <>
                  Your bodyweight counts as part of this lift, so leave it at
                  zero for a clean set — {region.toLowerCase()} still scores.
                </>
              ) : (
                <>
                  A bodyweight lift ranks on what you hung off it, so leave this
                  at zero and {region.toLowerCase()} stays unscored — a rank is
                  a ratio, and added weight of nothing has none.
                </>
              )}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Group({
  title,
  names,
  onPick,
}: {
  title: string;
  names: string[];
  onPick: (n: string) => void;
}) {
  if (!names.length) return null;
  return (
    <div className="mb-5">
      <p className="mb-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted">
        {title}
      </p>
      <div className="border-t border-rule">
        {names.map((n) => (
          <button
            key={n}
            onClick={() => onPick(n)}
            className="flex w-full items-center justify-between border-b border-subrule py-3 text-left active:bg-[#0b0b0b]"
          >
            <span className="text-[0.9375rem]">{n}</span>
            <span className="text-muted">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A row of four nudges under a figure. */
function Steps({
  steps,
  onStep,
}: {
  steps: number[];
  onStep: (d: number) => void;
}) {
  return (
    <div className="flex gap-2 pt-3.5">
      {steps.map((d) => (
        <button
          key={d}
          onClick={() => onStep(d)}
          className="press h-11 flex-1 rounded-full border border-rule font-mono text-[0.75rem] font-medium active:border-faint"
        >
          {d > 0 ? "+" : ""}
          {num(d, 1)}
        </button>
      ))}
    </div>
  );
}

/** Roughly the middle of the region's Silver band, in the reader's unit. */
/**
 * Where the weight field opens for a given lift.
 *
 * `REGION_SEED` is written in the region's benchmark, so it has to be put back
 * through the chosen lift's factor before it means anything: the chest seed of
 * 60 kg is a barbell bench, and offered unconverted as the starting weight for
 * a dumbbell press it read as 60 kg in each hand — an entry that opens at a
 * world record is worse than one that opens at zero.
 *
 * Rounded to the same step the nudge buttons use, so the first tap lands on a
 * round number rather than correcting a decimal.
 */
function seed(m: MuscleGroup, unit: "kg" | "lb", factor: number) {
  const kg = REGION_SEED[m].kg * factor;
  const v = unit === "lb" ? kg * 2.20462 : kg;
  const step = unit === "lb" ? 5 : 2.5;
  return Math.max(step, Math.round(v / step) * step);
}
