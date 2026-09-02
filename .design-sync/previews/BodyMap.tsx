import { BodyMap } from "gym";

/**
 * BodyMap lights each region in proportion to its 0-1 strength score and glows
 * brighter as the score rises, so the useful stories are different score
 * distributions rather than different props.
 */
type Group = "shoulders" | "chest" | "arms" | "legs";
type Score = {
  ratio: number;
  score: number;
  tier: "Beginner" | "Novice" | "Intermediate" | "Advanced" | "Elite";
  best1rm: number;
  lift: string;
};

const frame: React.CSSProperties = { background: "#000", padding: 16 };

const score = (s: number, ratio: number, tier: Score["tier"], best1rm: number, lift: string): Score => ({
  score: s,
  ratio,
  tier,
  best1rm,
  lift,
});

const balanced: Partial<Record<Group, Score>> = {
  shoulders: score(0.6, 0.7, "Intermediate", 52.5, "Overhead Press"),
  chest: score(0.72, 1.24, "Intermediate", 93.3, "Barbell Bench Press"),
  arms: score(0.5, 0.42, "Novice", 31.7, "Barbell Curl"),
  legs: score(0.81, 1.56, "Advanced", 116.7, "Back Squat"),
};

export const Balanced = () => (
  <div style={frame}>
    <BodyMap scores={balanced} selected={null} onSelect={() => {}} />
  </div>
);

export const RegionSelected = () => (
  <div style={frame}>
    <BodyMap scores={balanced} selected="legs" onSelect={() => {}} />
  </div>
);

export const UpperBodyBias = () => (
  <div style={frame}>
    <BodyMap
      scores={{
        shoulders: score(0.92, 1.1, "Elite", 82.5, "Overhead Press"),
        chest: score(0.95, 1.9, "Elite", 142.5, "Barbell Bench Press"),
        arms: score(0.78, 0.72, "Advanced", 54, "Barbell Curl"),
        legs: score(0.22, 0.8, "Beginner", 60, "Back Squat"),
      }}
      selected={null}
      onSelect={() => {}}
    />
  </div>
);

export const NoDataYet = () => (
  <div style={frame}>
    <BodyMap scores={{}} selected={null} onSelect={() => {}} />
  </div>
);
