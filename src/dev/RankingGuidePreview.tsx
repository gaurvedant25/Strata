import { useState } from "react";
import { RankingGuide } from "../components/RankingGuide";
import {
  computeMuscleScores,
  type MuscleGroup,
  benchmarkLift,
} from "../lib/strength";
import type { Exercise, Session, SetLog } from "../types";

/**
 * The ranking explanation in every state it has, side by side.
 *
 * Reached at `?ranking-preview`. The card branches on things that are awkward
 * to arrange by hand in the real app — a region won by a lift that carries you,
 * one won by a hold, one at the top of the ladder with no rung above it, an
 * empty region, an account with no body weight at all — and each of those
 * renders different sentences and a different set of rows.
 *
 * Every figure shown comes out of `computeMuscleScores`, the same function the
 * strength screen calls. The harness fabricates *sets*, not scores: it decides
 * what was lifted and lets the model say what that is worth, so a state that
 * looks right here looks right because the model produced it.
 */
const EXERCISES: Exercise[] = [
  { id: "x-bench", name: "Barbell Bench Press", muscle: "Chest", createdAt: 0 },
  {
    id: "x-pullup",
    name: "Pull-up",
    muscle: "Back",
    bodyweight: true,
    createdAt: 0,
  },
  {
    id: "x-plank",
    name: "Plank",
    muscle: "Core",
    bodyweight: true,
    tracks: "time",
    createdAt: 0,
  },
  { id: "x-squat", name: "Back Squat", muscle: "Legs", createdAt: 0 },
  {
    id: "x-raise",
    name: "Dumbbell Lateral Raise",
    muscle: "Shoulders",
    createdAt: 0,
  },
];

function session(exerciseId: string, sets: Partial<SetLog>[]): Session {
  return {
    id: `s-${exerciseId}`,
    name: "Workout",
    date: "2026-01-01",
    startedAt: 1,
    endedAt: 2,
    entries: [
      {
        id: `e-${exerciseId}`,
        exerciseId,
        sets: sets.map((set, i) => ({
          id: `set-${i}`,
          reps: set.reps ?? 0,
          seconds: set.seconds,
          weight: set.weight ?? 0,
          done: true,
        })),
      },
    ],
  };
}

const BW = 80;

type Case = {
  id: string;
  label: string;
  muscle: MuscleGroup;
  sessions: Session[];
  bodyweight: number | null;
};

const CASES: Case[] = [
  {
    id: "mid",
    label: "Scored, mid-ladder (barbell)",
    muscle: "chest",
    sessions: [session("x-bench", [{ weight: 100, reps: 5 }])],
    bodyweight: BW,
  },
  {
    id: "top",
    label: "Scored, top rank",
    muscle: "quadriceps",
    sessions: [session("x-squat", [{ weight: 400, reps: 5 }])],
    bodyweight: BW,
  },
  {
    id: "carries",
    label: "Won by a lift that carries you (pull-up)",
    muscle: "lats",
    sessions: [session("x-pullup", [{ weight: 20, reps: 3 }])],
    bodyweight: BW,
  },
  {
    id: "converted",
    label: "Won by a converted lift (lateral raise)",
    muscle: "shoulders",
    sessions: [session("x-raise", [{ weight: 18, reps: 10 }])],
    bodyweight: BW,
  },
  {
    id: "hold",
    label: "Won by a timed hold (plank)",
    muscle: "abs",
    sessions: [session("x-plank", [{ seconds: 90, weight: 0 }])],
    bodyweight: BW,
  },
  {
    id: "empty",
    label: "Unscored region, body weight on file",
    muscle: "hamstrings",
    sessions: [session("x-bench", [{ weight: 100, reps: 5 }])],
    bodyweight: BW,
  },
  {
    id: "nobw",
    label: "No body weight logged at all",
    muscle: "chest",
    sessions: [session("x-bench", [{ weight: 100, reps: 5 }])],
    bodyweight: null,
  },
];

export default function RankingGuidePreview() {
  const [i, setI] = useState(0);
  const c = CASES[i];
  const scores = computeMuscleScores(
    c.sessions,
    EXERCISES,
    c.bodyweight,
    "male",
  );

  return (
    <div className="min-h-full bg-ink p-4">
      {/* Above the dialog, which is fixed over the whole viewport. */}
      <div className="relative z-[70] mx-auto flex max-w-lg flex-wrap gap-1.5">
        {CASES.map((x, n) => (
          <button
            key={x.id}
            onClick={() => setI(n)}
            className={`rounded-full border px-3 py-2 text-left text-[0.6875rem] ${
              n === i
                ? "border-fg bg-fg text-black"
                : "border-cardrule text-muted"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <RankingGuide
        open
        onClose={() => {}}
        muscle={c.muscle}
        score={scores[c.muscle]}
        bodyweight={c.bodyweight}
        benchmark={benchmarkLift(c.muscle)}
        unitLabel="kg"
      />
    </div>
  );
}
