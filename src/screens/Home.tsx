import { useEffect, useMemo, useState } from "react";
import { BodyMap, type BodyView, type Callouts } from "../components/BodyMap";
import { Scramble } from "../components/Callout";
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
  REGION_SECTIONS,
  computeMuscleScores,
  type MuscleGroup,
  type MuscleScore,
} from "../lib/strength";
import { personalRecords } from "../lib/stats";
import { fmtRelative, num, parseKey, todayKey } from "../lib/util";
import { useStore } from "../store";

const ALL_GROUPS: MuscleGroup[] = [...FRONT_GROUPS, ...BACK_GROUPS];

/**
 * Score to an approximate percentile.
 *
 * There is no population data in the app, so this is read off the same tier
 * thresholds that produce the score in the first place — it says where the
 * lift sits on our own ladder, not against real lifters, which is why the
 * callout labels it an estimate rather than stating it as fact.
 */
const PCT: [number, number][] = [
  [0, 90],
  [0.2, 60],
  [0.4, 35],
  [0.6, 15],
  [0.8, 5],
  [1, 1],
];

function percentile(score: number) {
  for (let i = 1; i < PCT.length; i++) {
    if (score <= PCT[i][0] || i === PCT.length - 1) {
      const [x0, y0] = PCT[i - 1];
      const [x1, y1] = PCT[i];
      const t = x1 === x0 ? 1 : (score - x0) / (x1 - x0);
      return Math.max(1, Math.round(y0 + t * (y1 - y0)));
    }
  }
  return 50;
}

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

/** One scored region. Identical whether it sits in a section or on its own. */
function RegionRow({
  group,
  score,
  active,
  onPick,
  indent,
}: {
  group: MuscleGroup;
  score?: MuscleScore;
  active: boolean;
  onPick: (m: MuscleGroup) => void;
  indent?: boolean;
}) {
  return (
    <button
      onClick={() => onPick(group)}
      className={`flex w-full items-center gap-3 border-b border-subrule py-3 transition-colors ${
        indent ? "pl-7 pr-1" : "px-1"
      } ${active ? "bg-[#0c0c0c] text-fg" : "text-[#8b8b90]"}`}
    >
      <Dot score={score} />
      <span className="flex-1 text-left text-[14px] font-medium">{MUSCLE_LABEL[group]}</span>
      <span className="w-14 text-right font-mono text-[13px] text-muted">
        {score ? `${num(score.ratio, 2)}×` : "—"}
      </span>
      <span className="w-[74px] text-right font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {score ? score.tier : ""}
      </span>
    </button>
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

  // Annotations on the figure: what the best set of the region's lift actually
  // was, and roughly where that sits. Absent until the region has been scored.
  const callouts: Callouts | null = useMemo(() => {
    if (!detail) return null;
    const lift = s.exercises.find((e) => e.name === CANONICAL_LIFT[active]);
    const pr = lift ? personalRecords(s.sessions.filter((x) => x.endedAt)).get(lift.id) : undefined;
    if (!pr) return null;
    return {
      left: [
        { text: CANONICAL_LIFT[active], size: 8, weight: 600, dim: true },
        { text: `${num(pr.heaviest)} × ${pr.heaviestReps}`, size: 14, weight: 500, tight: true },
        {
          text: parseKey(pr.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
          size: 8,
          weight: 600,
          dim: true,
        },
      ],
      right: [
        { text: `Top ${percentile(detail.score)}%`, size: 14, weight: 600, tight: true },
        { text: "estimated", size: 8, weight: 600, dim: true },
      ],
    };
  }, [detail, active, s.exercises, s.sessions]);

  // A section opens when it holds the selected region, so tapping a muscle on
  // the figure reveals it in the list rather than hiding it inside a heading.
  const activeSection = REGION_SECTIONS.find(
    (x) => x.kind === "group" && x.children.includes(active),
  );
  const [openIds, setOpenIds] = useState<string[]>(() =>
    activeSection && activeSection.kind === "group" ? [activeSection.id] : [],
  );
  const activeId = activeSection && activeSection.kind === "group" ? activeSection.id : null;
  useEffect(() => {
    if (activeId) setOpenIds((o) => (o.includes(activeId) ? o : [...o, activeId]));
  }, [activeId]);

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
              callouts={callouts}
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
                  <BigNumber
                    // keyed on the region so switching regions replays the reveal,
                    // in step with the callouts settling on the figure above
                    value={
                      <Scramble
                        key={active}
                        text={num(detail.best1rm)}
                        delay={30}
                        hold={98}
                        perChar={34}
                      />
                    }
                    unit={`${unitLabel} est. 1RM`}
                    size={48}
                  />
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
            {REGION_SECTIONS.map((section) => {
              if (section.kind === "single") {
                return (
                  <RegionRow
                    key={section.group}
                    group={section.group}
                    score={scores[section.group]}
                    active={active === section.group}
                    onPick={pick}
                  />
                );
              }
              const open = openIds.includes(section.id);
              const scored = section.children.filter((c) => scores[c]).length;
              return (
                <div key={section.id}>
                  <button
                    onClick={() =>
                      setOpenIds((o) =>
                        o.includes(section.id)
                          ? o.filter((x) => x !== section.id)
                          : [...o, section.id],
                      )
                    }
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 border-b border-subrule px-1 py-3 text-left transition-colors"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`shrink-0 text-muted transition-transform duration-150 ${
                        open ? "rotate-90" : ""
                      }`}
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    <span className="flex-1 text-[14px] font-medium text-fg">{section.label}</span>
                    {/* one dot per region inside, so the spread is visible without
                        inventing a score for the section as a whole */}
                    <span className="flex items-center gap-1.5">
                      {section.children.map((c) => (
                        <Dot key={c} score={scores[c]} size={6} />
                      ))}
                    </span>
                    <span className="w-[74px] text-right font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {scored}/{section.children.length}
                    </span>
                  </button>

                  {open &&
                    section.children.map((c) => (
                      <RegionRow
                        key={c}
                        group={c}
                        score={scores[c]}
                        active={active === c}
                        onPick={pick}
                        indent
                      />
                    ))}
                </div>
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
