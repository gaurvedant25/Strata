import { useEffect, useMemo, useState } from "react";
import { Numeral, resetNumerals } from "../components/Numeral";
import { Button, EditableNumber, Eyebrow, inputCls } from "../components/ui";
import { PRESETS } from "../lib/presets";
import { e1rm } from "../lib/stats";
import {
  BODYWEIGHT_LOADED,
  MUSCLE_LABEL,
  REGION_ORDER,
  RANKING_LIFTS,
  REGION_SEED,
  regionHeading,
  setupLifts,
  type BenchmarkLifts,
  type MuscleGroup,
} from "../lib/strength";
import { cls, num, todayKey, uid } from "../lib/util";
import { useStore } from "../store";
import type { Gender, SetLog, Unit } from "../types";

/**
 * First run. Four questions about you, then one lift per region.
 *
 * The four basics were once scattered — unit and sex in Settings, bodyweight
 * behind an empty state on the Strength screen, the split behind the Routines
 * tab — and each of them gates something, so a new install opened on a screen
 * that could not show anything until you went and found them.
 *
 * The fourteen questions after them are the reason this screen grew. The body
 * map scores a region against the best set you have ever done on its benchmark
 * lift, which meant a fresh install showed a black figure for weeks: the app
 * knew nothing about a lifter who had been training for years, because none of
 * it had happened inside the app yet. Asking once, up front, is the difference
 * between a map that fills in over months and one that is already yours.
 *
 * Everything entered here is ordinary data afterwards. The sets land in the log
 * as a session dated today, so they appear in History and Progress and can be
 * edited or deleted like any other; every region is skippable, and a skipped
 * one simply stays dark until you log a set for it.
 */

const BASICS = 4;
const TOTAL = BASICS + REGION_ORDER.length;

/** Where the flow starts, one before the first question. */
const INTRO = -1;

type Pick = { lift: string; weight: number; reps: number };

/**
 * The split option that is not a preset.
 *
 * Cannot collide with a real preset key — those are the five in presets.ts —
 * and picking it builds an empty split under a name of your own rather than
 * seeding days. The days are added on the Routines screen afterwards, which is
 * where they are edited from then on anyway; setup would be a strange place to
 * design a training week from nothing.
 */
const CUSTOM_SPLIT = "custom";

const KG_TO_LB = 2.20462;

/** Plate-sized steps: 2.5 kg and 5 lb are the smallest pair most racks carry. */
const WEIGHT_STEPS: Record<Unit, number[]> = {
  kg: [-10, -2.5, 2.5, 10],
  lb: [-25, -5, 5, 25],
};

/**
 * A region's opening weight for the lift being answered, in whichever unit was
 * chosen a few steps ago.
 *
 * `REGION_SEED` is written in the region's benchmark, so it is put back through
 * the chosen lift's factor: the chest seed of 60 kg is a barbell bench, and
 * handed unconverted to a dumbbell press it opens the question at 60 kg in each
 * hand. Rounded to the step the nudge buttons use, so the first tap lands on a
 * round number.
 */
function seedWeight(muscle: MuscleGroup, lift: string, unit: Unit) {
  const factor =
    RANKING_LIFTS[muscle].find((l) => l.name === lift)?.factor ?? 1;
  const kg = REGION_SEED[muscle].kg * factor;
  const step = unit === "lb" ? 5 : 2.5;
  const v = unit === "lb" ? kg * KG_TO_LB : kg;
  return Math.max(step, Math.round(v / step) * step);
}

/** The heaviest single set entered anywhere in setup, for the closing summary. */
function heaviest(
  picks: Partial<Record<MuscleGroup, Pick>>,
  unitLabel: string,
) {
  let best: Pick | null = null;
  for (const p of Object.values(picks))
    if (p && (!best || p.weight > best.weight)) best = p;
  return best && best.weight > 0
    ? `${num(best.weight, 1)} ${unitLabel} × ${best.reps}`
    : "—";
}

export function Onboarding({
  onDone,
  onSignIn,
}: {
  onDone: () => void;
  /**
   * Opens the sign-in screen, for somebody who already has an account.
   *
   * Offered on the intro step only. This screen builds a profile from scratch,
   * and a returning lifter should not have to answer fourteen questions whose
   * answers are already on the server — but once they have started answering,
   * they have chosen that path, and every step after the first has the counter
   * in this corner anyway.
   */
  onSignIn?: () => void;
}) {
  const s = useStore();
  const [i, setI] = useState(INTRO);
  /** Which way the last move went, so the next step arrives from that side. */
  const [dir, setDir] = useState(1);

  const [unit, setUnit] = useState<Unit>(s.settings.unit);
  const [gender, setGender] = useState<Gender>(s.settings.gender);
  const [splitKey, setSplitKey] = useState(PRESETS[1].key);
  const [splitName, setSplitName] = useState("");
  const custom = splitKey === CUSTOM_SPLIT;
  /** What the summary and the store call the split, whichever kind was picked. */
  const splitLabel = custom
    ? splitName.trim()
    : (PRESETS.find((p) => p.key === splitKey)?.name ?? "");
  // Until it is touched, bodyweight follows the unit rather than sitting on a
  // number that is only plausible in one of them.
  const [typedBw, setTypedBw] = useState<number | null>(null);
  const bw = typedBw ?? (unit === "lb" ? 180 : 80);

  const [picks, setPicks] = useState<Partial<Record<MuscleGroup, Pick>>>({});

  const unitLabel = unit === "lb" ? "lbs" : "kg";

  // Leaving setup must not leave its figures behind for the next screen to roll
  // from — see Numeral.
  useEffect(() => () => resetNumerals("onb:"), []);

  /**
   * The library by name, first copy wins.
   *
   * A restore or a re-seed can leave two exercises sharing a name; setup only
   * needs one of them to hang a set on, and `bestNamed` is what reconciles the
   * rest afterwards.
   */
  const byName = useMemo(() => {
    const m = new Map<string, (typeof s.exercises)[number]>();
    for (const e of s.exercises) if (!m.has(e.name)) m.set(e.name, e);
    return m;
  }, [s.exercises]);

  const muscle: MuscleGroup | null =
    i >= BASICS && i < TOTAL ? REGION_ORDER[i - BASICS] : null;
  const pick = muscle ? (picks[muscle] ?? null) : null;
  const isIntro = i === INTRO;
  const isDone = i === TOTAL;
  const answered = Object.keys(picks).length;

  function go(delta: 1 | -1) {
    setDir(delta);
    setI((n) => Math.max(INTRO, Math.min(TOTAL, n + delta)));
  }

  function choose(m: MuscleGroup, lift: string) {
    const bodyweight = byName.get(lift)?.bodyweight ?? false;
    setPicks((p) => ({
      ...p,
      // A bodyweight movement logs *added* weight, which starts at nothing.
      [m]: {
        lift,
        weight: bodyweight ? 0 : seedWeight(m, lift, unit),
        reps: REGION_SEED[m].reps,
      },
    }));
  }

  function amend(m: MuscleGroup, patch: Partial<Pick>) {
    setPicks((p) => (p[m] ? { ...p, [m]: { ...p[m], ...patch } } : p));
  }

  function drop(m: MuscleGroup) {
    setPicks((p) => {
      const next = { ...p };
      delete next[m];
      return next;
    });
  }

  async function finish() {
    const benchmarks: BenchmarkLifts = {};
    // Keyed by exercise rather than by region: one lift can answer two regions
    // — a deadlift is the lower back's benchmark and a hamstring answer both —
    // and two entries for one exercise in one session would read as having done
    // it twice.
    const sets = new Map<string, SetLog[]>();

    for (const m of REGION_ORDER) {
      const p = picks[m];
      const ex = p && byName.get(p.lift);
      if (!p || !ex) continue;
      // Only a lift that can produce a ratio becomes a benchmark, which rules
      // out the movements scored on the plate alone: a plate of nothing has no
      // ratio. A pull-up is scored on the body doing it, so it qualifies. The
      // set is logged either way — a lift that cannot be one just leaves the
      // region on its built-in benchmark.
      if (!ex.bodyweight || BODYWEIGHT_LOADED.has(ex.name))
        benchmarks[m] = p.lift;
      const list = sets.get(ex.id) ?? [];
      list.push({ id: uid(), reps: p.reps, weight: p.weight, done: true });
      sets.set(ex.id, list);
    }

    await s.saveSettings({ unit, gender, benchmarks });
    await s.logBodyWeight(todayKey(), bw);
    if (custom) await s.createSplit(splitName);
    else {
      const preset = PRESETS.find((p) => p.key === splitKey);
      if (preset) await s.useSplit(preset);
    }

    if (sets.size) {
      const at = Date.now();
      await s.saveSession({
        id: uid(),
        name: "Baseline",
        date: todayKey(),
        startedAt: at,
        endedAt: at,
        note: "Best sets as entered during setup.",
        entries: [...sets].map(([exerciseId, list]) => ({
          id: uid(),
          exerciseId,
          sets: list,
        })),
      });
    }
    onDone();
  }

  const step = (() => {
    if (isIntro)
      return {
        eyebrow: "Welcome",
        title: "Set up your strength profile.",
        body: "Four questions about you, then your best ever set on one lift per muscle. Nothing here is guessed — the app scores every region against what you enter.",
        cta: "Begin",
      };
    if (isDone)
      return {
        eyebrow: "Setup complete",
        title: "Your profile is built.",
        body:
          answered === REGION_ORDER.length
            ? "Every region now has a number behind it. Beat any of these in a session and the app records the PR against it."
            : `${answered} of ${REGION_ORDER.length} regions have a number behind them. The rest fill in as you log sets for them.`,
        cta: "Enter Gym Log",
      };
    if (muscle)
      return {
        eyebrow: regionHeading(muscle),
        title: pick
          ? "Your best set ever."
          : `Strongest ${MUSCLE_LABEL[muscle].toLowerCase()} lift?`,
        body: pick
          ? `The heaviest set you have ever completed on ${pick.lift}. One set, not a session.`
          : // Not "the lift this region is scored on" any more: a region is
            // ranked on the strongest of its whole set, and this answer is
            // logged as a real set that joins that pool. All it does is give
            // the region a rank on day one instead of a grey silhouette.
            "Pick the one you train heaviest. It gives this region a rank to start from.",
        cta: i === TOTAL - 1 ? "Finish setup" : "Continue",
      };
    return [
      {
        eyebrow: "Basics",
        title: "Kilos or pounds?",
        body: "Every weight in the app is shown in this unit. You can change it later in Settings.",
        cta: "Continue",
      },
      {
        eyebrow: "Basics",
        title: "What do you weigh?",
        body: "Strength is scored against your bodyweight, so the body map stays blank until this is set.",
        cta: "Continue",
      },
      {
        eyebrow: "Basics",
        title: "Which body map?",
        body: "This picks the figure you tap on and the strength standards each region is scored against.",
        cta: "Continue",
      },
      {
        eyebrow: "Basics",
        title: "Pick a starting split.",
        body: "Just a starting point — every day inside it is yours to edit, add to or delete.",
        cta: "Continue",
      },
    ][i];
  })();

  // Nothing to continue to: a region with no lift named yet, or a split of
  // your own with no name on it.
  const blocked = (!!muscle && !pick) || (custom && i === 3 && !splitLabel);

  const pct = isIntro ? 0 : Math.min(1, i / TOTAL) * 100;
  const enter = dir >= 0 ? "animate-step-forward" : "animate-step-back";

  return (
    <div className="flex h-dvh flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="flex-none">
        <div className="relative h-0.5 bg-rule">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-fg transition-[width] duration-[520ms]"
            style={{ width: `${pct}%` }}
          />
          {!isIntro && (
            <span
              aria-hidden="true"
              className="animate-head-pulse absolute -top-0.5 size-1.5 rounded-full bg-fg transition-[left] duration-[520ms]"
              style={{ left: `calc(${pct}% - 3px)` }}
            />
          )}
        </div>
        <div className="flex items-baseline justify-between gap-3 pt-4.5">
          <Eyebrow>{step.eyebrow}</Eyebrow>
          {isIntro && onSignIn && (
            /* The negative margin is the same trick the header buttons
               elsewhere use: the padding grows what a thumb can hit without
               moving the baseline this sits on. */
            <button
              onClick={onSignIn}
              aria-label="Sign in to an existing account"
              className="-my-2.5 shrink-0 py-2.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted underline decoration-[1.5px] underline-offset-[4px] active:text-fg"
            >
              Sign in
            </button>
          )}
          {!isIntro && !isDone && (
            <span className="font-mono text-label font-medium tracking-[0.14em] text-faint">
              {i + 1} / {TOTAL}
            </span>
          )}
        </div>
      </div>

      <div key={`head-${i}`} className={cls("flex-none", enter)}>
        <h1 className="mt-3 text-[1.875rem] font-bold leading-[1.08] tracking-[-0.028em] text-pretty">
          {step.title}
        </h1>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-muted text-pretty">
          {step.body}
        </p>
      </div>

      <div
        key={`body-${i}`}
        className={cls(
          "no-scrollbar min-h-0 flex-1 overflow-y-auto pt-6.5",
          enter,
        )}
        style={{ animationDelay: "70ms" }}
      >
        {isIntro && <Intro />}

        {i === 0 && (
          <Choices
            value={unit}
            onChange={setUnit}
            options={[
              {
                key: "kg" as Unit,
                title: "Kilograms",
                sub: "Plates in 2.5 kg steps. The default outside the US.",
              },
              {
                key: "lb" as Unit,
                title: "Pounds",
                sub: "Plates in 5 lb steps.",
              },
            ]}
          />
        )}

        {i === 1 && (
          <div>
            <div className="border-b border-fg pb-3.5">
              <EditableNumber
                size={56}
                value={bw}
                display={<Numeral id="onb:bw" text={num(bw, 1)} />}
                unit={unitLabel}
                label="Bodyweight"
                min={30}
                max={400}
                onChange={setTypedBw}
              />
            </div>
            <Steps
              steps={[-1, -0.1, 0.1, 1]}
              onStep={(d) => setTypedBw(Math.max(30, +(bw + d).toFixed(1)))}
            />
            <p className="mt-5 text-[0.8125rem] leading-relaxed text-muted">
              Saved against today. Every strength score in the app is a multiple
              of this number.
            </p>
          </div>
        )}

        {i === 2 && (
          <Choices
            value={gender}
            onChange={setGender}
            options={[
              {
                key: "male" as Gender,
                title: "Male",
                sub: "Male standards for all fourteen regions.",
              },
              {
                key: "female" as Gender,
                title: "Female",
                sub: "Female standards for all fourteen regions.",
              },
            ]}
          />
        )}

        {i === 3 && (
          <div>
            <Choices
              value={splitKey}
              onChange={setSplitKey}
              options={[
                ...PRESETS.map((p) => ({
                  key: p.key,
                  title: p.name,
                  sub: p.blurb,
                })),
                {
                  key: CUSTOM_SPLIT,
                  title: "Build your own",
                  sub: "Start empty under a name of your choosing, and add the days yourself.",
                },
              ]}
            />
            {custom && (
              <div
                className="animate-step-item pt-6"
                style={{ animationDelay: "0ms" }}
              >
                <Eyebrow className="mb-2 block">Split name</Eyebrow>
                <input
                  className={inputCls}
                  placeholder="e.g. My Split"
                  value={splitName}
                  enterKeyHint="done"
                  onChange={(e) => setSplitName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
                <p className="mt-3.5 text-[0.8125rem] leading-relaxed text-muted">
                  You'll add its days and their exercises on the Routines
                  screen, once setup is done.
                </p>
              </div>
            )}
          </div>
        )}

        {muscle && !pick && (
          <div className="flex flex-col gap-2.5">
            {setupLifts(muscle).map((name, n) => (
              <button
                key={name}
                onClick={() => choose(muscle, name)}
                className="press press-row animate-step-item flex w-full items-center justify-between gap-3 rounded-2xl border border-cardrule bg-card p-4 text-left active:border-faint"
                style={{ animationDelay: `${90 + n * 38}ms` }}
              >
                <span className="text-[1rem] font-medium">{name}</span>
                {byName.get(name)?.bodyweight && (
                  <span className="shrink-0 font-mono text-label uppercase tracking-[0.12em] text-faint">
                    bodyweight
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {muscle && pick && (
          <SetEntry
            pick={pick}
            unit={unit}
            unitLabel={unitLabel}
            added={byName.get(pick.lift)?.bodyweight ?? false}
            carried={BODYWEIGHT_LOADED.has(pick.lift) ? bw : 0}
            onChange={(patch) => amend(muscle, patch)}
            onClear={() => drop(muscle)}
          />
        )}

        {isDone && (
          <Summary
            rows={[
              { label: "Bodyweight", value: `${num(bw, 1)} ${unitLabel}` },
              {
                label: "Split",
                value: splitLabel || "—",
              },
              {
                label: "Regions scored",
                value: `${answered} / ${REGION_ORDER.length}`,
              },
              { label: "Heaviest entry", value: heaviest(picks, unitLabel) },
            ]}
          />
        )}
      </div>

      <div
        key={`foot-${i}`}
        className={cls("flex flex-none flex-col gap-1.5 pt-4", enter)}
        style={{ animationDelay: "120ms" }}
      >
        <Button
          disabled={blocked}
          onClick={() => (isDone ? void finish() : go(1))}
        >
          {step.cta}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="quiet"
            className={cls(isIntro && "invisible")}
            onClick={() => go(-1)}
          >
            Back
          </Button>
          {muscle && (
            <Button
              variant="quiet"
              onClick={() => {
                drop(muscle);
                go(1);
              }}
            >
              {i === TOTAL - 1 ? "Skip · finish" : "Skip this lift"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** What the next few minutes hold, numbered, so the length is not a surprise. */
function Intro() {
  const rows = [
    {
      n: "01",
      title: "Units, bodyweight, sex, split",
      sub: "Four taps. The split seeds your routines; the rest calibrate scoring.",
    },
    {
      n: "02",
      title: "One best lift per region",
      sub: "Fourteen regions, chest first. Pick the exercise, then the heaviest set you have ever done on it.",
    },
    {
      n: "03",
      title: "Skip any you don't train",
      sub: "A skipped region just stays dark on the body map until you log a set for it later.",
    },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, n) => (
        <div
          key={r.n}
          className="animate-step-item flex gap-3.5 rounded-2xl border border-cardrule bg-card p-4"
          style={{ animationDelay: `${90 + n * 38}ms` }}
        >
          <span className="w-[22px] shrink-0 font-mono text-label font-medium tracking-[0.16em]">
            {r.n}
          </span>
          <span className="flex-1">
            <span className="block text-[1rem] font-medium">{r.title}</span>
            <span className="mt-1.5 block text-[0.75rem] leading-relaxed text-muted text-pretty">
              {r.sub}
            </span>
          </span>
        </div>
      ))}
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
          {d}
        </button>
      ))}
    </div>
  );
}

/**
 * The lift, then the set.
 *
 * The exercise is named first and then settles into a row of its own with a way
 * back out, because the two figures under it only mean anything once you know
 * what they are figures for.
 */
function SetEntry({
  pick,
  unit,
  unitLabel,
  added,
  carried,
  onChange,
  onClear,
}: {
  pick: Pick;
  unit: Unit;
  unitLabel: string;
  /** A bodyweight movement: the figure is what you hang off yourself, not the load. */
  added: boolean;
  /** Bodyweight, when the lift is scored on it too — zero when it is not. */
  carried: number;
  onChange: (patch: Partial<Pick>) => void;
  onClear: () => void;
}) {
  const est = e1rm(carried + pick.weight, pick.reps);
  return (
    <div>
      <div className="animate-step-item flex items-center justify-between gap-3 rounded-2xl border border-cardrule bg-card py-2 pl-4 pr-2">
        <span className="text-[0.9375rem] font-medium">{pick.lift}</span>
        <Button variant="link" className="shrink-0" onClick={onClear}>
          Change
        </Button>
      </div>

      <div className="flex flex-col gap-5.5 pt-5.5">
        <div className="animate-step-item" style={{ animationDelay: "60ms" }}>
          <Eyebrow>{added ? "Added weight" : "Weight"}</Eyebrow>
          <div className="pt-2">
            <EditableNumber
              value={pick.weight}
              display={<Numeral id="onb:weight" text={num(pick.weight, 1)} />}
              unit={unitLabel}
              label={added ? "Added weight" : "Weight"}
              max={2000}
              onChange={(weight) => onChange({ weight })}
            />
          </div>
          <Steps
            steps={WEIGHT_STEPS[unit]}
            onStep={(d) =>
              onChange({ weight: Math.max(0, +(pick.weight + d).toFixed(1)) })
            }
          />
        </div>

        <div className="animate-step-item" style={{ animationDelay: "120ms" }}>
          <Eyebrow>Reps in that set</Eyebrow>
          <div className="pt-2">
            <EditableNumber
              value={pick.reps}
              display={<Numeral id="onb:reps" text={String(pick.reps)} />}
              unit="reps"
              label="Reps in that set"
              decimals={0}
              min={1}
              max={100}
              onChange={(reps) => onChange({ reps })}
            />
          </div>
          <Steps
            steps={[-5, -1, 1, 5]}
            onStep={(d) => onChange({ reps: Math.max(1, pick.reps + d) })}
          />
        </div>
      </div>

      <div
        className="animate-step-item mt-5.5 flex items-baseline justify-between gap-3 border-t border-rule pt-3.5"
        style={{ animationDelay: "180ms" }}
      >
        <Eyebrow tone="dim">Estimated 1RM</Eyebrow>
        <span className="font-mono text-[0.9375rem] font-medium tracking-[-0.015em]">
          {est > 0 ? `${num(est, 1)} ${unitLabel}` : "—"}
        </span>
      </div>
    </div>
  );
}

/**
 * The end of setup, borrowing the workout celebration's mark.
 *
 * The same stamp and ring the end of a session gets, because this is the other
 * moment in the app where something is finished rather than merely saved.
 */
function Summary({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div>
      <div className="relative mb-6 grid size-16 place-items-center">
        <span className="animate-cb-ring absolute inset-0 rounded-full border border-fg" />
        <span className="animate-cb-check absolute inset-0 rounded-full bg-fg" />
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#000"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-cb-check relative"
          style={{ animationDelay: "220ms" }}
        >
          <path d="M4.5 12.5 9.5 17.5 19.5 7" />
        </svg>
      </div>
      <div className="border-t border-rule">
        {rows.map((r, n) => (
          <div
            key={r.label}
            className="animate-cb-stat flex items-baseline justify-between gap-3 border-b border-subrule py-3.5"
            style={{ animationDelay: `${340 + n * 80}ms` }}
          >
            <Eyebrow>{r.label}</Eyebrow>
            <span className="text-right font-mono text-[0.9375rem] font-medium tracking-[-0.015em]">
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Choices<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; title: string; sub: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {options.map((o, n) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={cls(
              "press press-row animate-step-item flex w-full items-start gap-3.5 rounded-2xl border border-cardrule p-4 text-left",
              on ? "bg-[#0c0c0c]" : "bg-transparent",
            )}
            style={{ animationDelay: `${90 + n * 38}ms` }}
          >
            <span className="flex-1">
              <span
                className={cls(
                  "block text-[1rem] font-medium",
                  on ? "text-fg" : "text-[#8b8b90]",
                )}
              >
                {o.title}
              </span>
              <span className="mt-1.5 block text-[0.75rem] leading-relaxed text-muted text-pretty">
                {o.sub}
              </span>
            </span>
            <span
              // `transition-all` animated every property this element has,
              // including ones that are not on the GPU. Only the three that
              // actually change are named.
              className="mt-1.5 size-4 shrink-0 rounded-full border transition-[border-color,background-color,box-shadow]"
              style={{
                borderColor: on ? "var(--color-fg)" : "var(--color-faint)",
                background: on ? "#f5f5f5" : "transparent",
                boxShadow: on ? "inset 0 0 0 4px #000" : "none",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
