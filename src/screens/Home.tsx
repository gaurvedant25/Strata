import { useMemo, useState } from "react";
import { BodyMap, type BodyView } from "../components/BodyMap";
import { Tune } from "../components/icons";
import { Button, Card, IconButton, Sheet, inputCls } from "../components/ui";
import {
  BACK_GROUPS,
  CANONICAL_LIFT,
  FRONT_GROUPS,
  MUSCLE_LABEL,
  computeMuscleScores,
  type MuscleGroup,
} from "../lib/strength";
import { fmtRelative, num, todayKey } from "../lib/util";
import { useStore } from "../store";
import type { Tab } from "../App";

const ALL_GROUPS: MuscleGroup[] = [...FRONT_GROUPS, ...BACK_GROUPS];

export function Home({ go }: { go: (t: Tab) => void }) {
  const s = useStore();
  const [bwOpen, setBwOpen] = useState(false);
  const [bw, setBw] = useState("");
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const [view, setView] = useState<BodyView>("front");
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";

  const latestBw = s.bodyweight[s.bodyweight.length - 1];

  const scores = useMemo(
    () => computeMuscleScores(s.sessions, s.exercises, latestBw?.weight ?? null, s.settings.gender),
    [s.sessions, s.exercises, latestBw?.weight, s.settings.gender],
  );

  const active = selected ?? ALL_GROUPS.find((m) => scores[m]) ?? "chest";
  const detail = scores[active];

  /** Selecting a region also spins the figure to the side that region is on. */
  function pick(m: MuscleGroup) {
    setSelected(m);
    setView(BACK_GROUPS.includes(m) ? "back" : "front");
  }

  async function saveBw() {
    const v = parseFloat(bw.replace(",", "."));
    if (!isFinite(v) || v <= 0) return;
    await s.logBodyWeight(todayKey(), v);
    setBw("");
    setBwOpen(false);
  }

  return (
    <div className="min-h-full px-4 pb-40 pt-[calc(env(safe-area-inset-top)+18px)]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[32px] font-bold leading-none tracking-tight">Strength</h1>
          <p className="mt-1.5 text-[13px] text-muted">Relative to your bodyweight</p>
        </div>
        <IconButton onClick={() => go("settings")}>
          <Tune />
        </IconButton>
      </div>

      {!latestBw ? (
        <Card className="mt-6 px-5 py-8 text-center">
          <p className="text-[15px] font-semibold">Log your bodyweight to begin</p>
          <p className="mx-auto mt-1.5 max-w-[240px] text-[13px] text-muted">
            Every score here is your lift weight measured against your bodyweight — nothing shows
            up until we know it.
          </p>
          <Button className="mt-4" onClick={() => setBwOpen(true)}>
            Log body weight
          </Button>
        </Card>
      ) : (
        <>
          <button
            onClick={() => setBwOpen(true)}
            className="mt-5 flex w-full items-center justify-between rounded-2xl bg-panel px-4 py-3"
          >
            <span className="text-[13px] text-muted">
              Logged <span className="font-semibold text-white">{num(latestBw.weight)}</span>{" "}
              {unitLabel} · {fmtRelative(latestBw.at, s.now)}
            </span>
            <span className="text-[13px] font-medium text-white">Update</span>
          </button>

          <div className="mt-4">
            <BodyMap
              scores={scores}
              selected={active}
              onSelect={pick}
              view={view}
              onViewChange={setView}
            />
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {ALL_GROUPS.map((m) => {
              const sc = scores[m];
              return (
                <button
                  key={m}
                  onClick={() => pick(m)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    active === m ? "bg-white text-ink" : "bg-panel text-muted"
                  }`}
                >
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: sc ? sc.color : "#3a3a41" }}
                  />
                  {MUSCLE_LABEL[m]}
                </button>
              );
            })}
          </div>

          <Card className="mt-4 px-5 py-4">
            {detail ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[17px] font-semibold">{MUSCLE_LABEL[active]}</p>
                  <span
                    className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
                    style={{ background: detail.color, color: "#0a0a0b" }}
                  >
                    {detail.tier}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-muted">
                  Best {CANONICAL_LIFT[active]}:{" "}
                  <span className="text-white">
                    {num(detail.best1rm)} {unitLabel}
                  </span>{" "}
                  est. 1RM · {num(detail.ratio, 2)}× bodyweight
                </p>
              </>
            ) : (
              <>
                <p className="text-[17px] font-semibold">{MUSCLE_LABEL[active]}</p>
                <p className="mt-1 text-[13px] text-muted">
                  Log a {CANONICAL_LIFT[active]} set to score this region.
                </p>
              </>
            )}
          </Card>
        </>
      )}

      <Sheet
        open={bwOpen}
        onClose={() => setBwOpen(false)}
        title="Log body weight"
        footer={
          <Button className="w-full" size="lg" onClick={() => void saveBw()}>
            Save
          </Button>
        }
      >
        <input
          autoFocus
          inputMode="decimal"
          className={inputCls}
          placeholder={`Weight in ${unitLabel}`}
          value={bw}
          onChange={(e) => setBw(e.target.value)}
        />
        <p className="mt-2 text-[12px] text-muted">Saved against today. One entry per day.</p>
      </Sheet>
    </div>
  );
}
