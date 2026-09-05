import { useMemo, useState } from "react";
import { BodyMap, type BodyView } from "../components/BodyMap";
import { Tune } from "../components/icons";
import {
  BigNumber,
  Button,
  Empty,
  Eyebrow,
  Sheet,
  TextTabs,
  numInputCls,
} from "../components/ui";
import {
  BACK_GROUPS,
  CANONICAL_LIFT,
  FRONT_GROUPS,
  MUSCLE_LABEL,
  TIER_LEVEL,
  computeMuscleScores,
  type MuscleGroup,
  type MuscleScore,
} from "../lib/strength";
import { fmtRelative, num, todayKey } from "../lib/util";
import { useStore } from "../store";

const ALL_GROUPS: MuscleGroup[] = [...FRONT_GROUPS, ...BACK_GROUPS];

/** The tier dot. The only colour on the screen besides the figure itself. */
function Dot({ score, size = 7 }: { score?: MuscleScore; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: score ? score.color : "#3a3a41",
        boxShadow: score ? `0 0 ${size + 3}px ${score.color}` : undefined,
      }}
    />
  );
}

export function Home({ onSettings }: { onSettings: () => void }) {
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
    <div className="min-h-full px-5 pb-40 pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="flex items-center justify-between pb-3.5">
        <Eyebrow>Strength</Eyebrow>
        <button onClick={onSettings} aria-label="Settings" className="text-muted active:text-fg">
          <Tune />
        </button>
      </div>

      {!latestBw ? (
        <Empty
          eyebrow="Nothing scored yet"
          title="Every score here is a lift measured against your bodyweight."
          body="Nothing shows up until we know what you weigh."
          action={<Button onClick={() => setBwOpen(true)}>Log body weight</Button>}
        />
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-3">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[26px] font-medium leading-none tracking-[-0.01em]">
                {num(latestBw.weight)}
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                {unitLabel} · {fmtRelative(latestBw.at, s.now)}
              </span>
            </div>
            <Button variant="link" onClick={() => setBwOpen(true)}>
              Update
            </Button>
          </div>

          <div className="mt-0.5">
            <BodyMap
              gender={s.settings.gender}
              scores={scores}
              selected={active}
              onSelect={pick}
              view={view}
              onViewChange={setView}
              showToggle={false}
              maxWidth={268}
            />
          </div>

          <TextTabs
            className="justify-center pb-5"
            gap="gap-6"
            options={[
              { id: "front", label: "front" },
              { id: "back", label: "back" },
            ]}
            value={view}
            onChange={setView}
          />

          <div className="border-t border-rule pt-[18px]">
            <div className="flex items-center gap-2.5">
              <Dot score={detail} size={9} />
              <h2 className="text-[23px] font-bold leading-none tracking-[-0.02em]">
                {MUSCLE_LABEL[active]}
              </h2>
              {detail && (
                <Eyebrow className="tracking-[0.16em]">
                  {detail.tier} · {TIER_LEVEL[detail.tier]}
                </Eyebrow>
              )}
            </div>

            {detail ? (
              <>
                <div className="pt-3.5">
                  <BigNumber value={num(detail.best1rm)} unit={`${unitLabel} est. 1RM`} size={48} />
                </div>
                <p className="mt-2.5 text-[13px] text-muted">
                  {CANONICAL_LIFT[active]} ·{" "}
                  <span className="font-mono text-fg">{num(detail.ratio, 2)}×</span> bodyweight
                </p>
              </>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Log a {CANONICAL_LIFT[active]} set to score this region.
              </p>
            )}
          </div>

          <div className="mt-6 border-t border-rule">
            {ALL_GROUPS.map((m) => {
              const sc = scores[m];
              const on = active === m;
              return (
                <button
                  key={m}
                  onClick={() => pick(m)}
                  className={`flex w-full items-center gap-3 border-b border-subrule px-1 py-3 transition-colors ${
                    on ? "bg-[#0c0c0c] text-fg" : "text-[#8b8b90]"
                  }`}
                >
                  <Dot score={sc} />
                  <span className="flex-1 text-left text-[14px] font-medium">
                    {MUSCLE_LABEL[m]}
                  </span>
                  <span className="w-14 text-right font-mono text-[13px] text-muted">
                    {sc ? `${num(sc.ratio, 2)}×` : "—"}
                  </span>
                  <span className="w-[74px] text-right font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    {sc ? sc.tier : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <Sheet
        open={bwOpen}
        onClose={() => setBwOpen(false)}
        title="Log body weight"
        footer={<Button onClick={() => void saveBw()}>Save</Button>}
      >
        <input
          autoFocus
          inputMode="decimal"
          className={numInputCls}
          placeholder={`Weight in ${unitLabel}`}
          value={bw}
          onChange={(e) => setBw(e.target.value)}
        />
        <p className="mt-2.5 text-[12px] text-muted">Saved against today. One entry per day.</p>
      </Sheet>
    </div>
  );
}
