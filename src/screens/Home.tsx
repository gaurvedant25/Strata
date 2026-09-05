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
  TIERS,
  TIER_COLOR,
  TIER_LEVEL,
  REGION_SECTIONS,
  computeMuscleScores,
  type MuscleGroup,
  type MuscleScore,
  type Tier,
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

/** The bar colour for a region with nothing logged against it yet. */
const UNSCORED = "#3a3a41";

/** Highest tier among a section's scored regions, or null if none are scored. */
function bestTier(
  groups: MuscleGroup[],
  scores: Partial<Record<MuscleGroup, MuscleScore>>,
): Tier | null {
  let best: Tier | null = null;
  for (const g of groups) {
    const t = scores[g]?.tier;
    if (t && (!best || TIERS.indexOf(t) > TIERS.indexOf(best))) best = t;
  }
  return best;
}

/**
 * One row of the muscle-group list.
 *
 * A card rather than a hairline row, carrying its tier as a bar down the
 * leading edge — which is what lets a closed section still show something of
 * what is inside it, and what makes a list this long scannable by colour
 * before it is read.
 */
function Row({
  name,
  sub,
  tierText,
  tierColor,
  nameSize,
  nameColor,
  background,
  minHeight,
  indent,
  chevron,
  onClick,
}: {
  name: string;
  sub?: string | null;
  tierText?: string;
  tierColor: string;
  nameSize: number;
  nameColor: string;
  background: string;
  minHeight: number;
  indent?: boolean;
  /** Present on a section; rotates when it is open. */
  chevron?: "closed" | "open";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{ minHeight, marginLeft: indent ? 22 : 0, background }}
      className="relative grid w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-2.5 overflow-hidden rounded-[9px] pl-4 pr-3 text-left"
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tierColor }} />
      <span className="flex min-w-0 flex-col gap-[5px] py-[11px]">
        <span
          className="truncate leading-[1.15]"
          style={{ fontSize: nameSize, color: nameColor }}
        >
          {name}
        </span>
        {sub && (
          <span className="font-mono text-[10.5px] uppercase leading-none tracking-[0.16em] text-[#969696]">
            {sub}
          </span>
        )}
      </span>
      <span
        className="whitespace-nowrap font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.16em]"
        style={{ color: tierColor }}
      >
        {tierText}
      </span>
      <span
        className="inline-block text-right font-mono text-[14px] leading-none text-[#8d8d8d] transition-transform duration-[180ms]"
        style={{ transform: chevron === "open" ? "rotate(90deg)" : "rotate(0deg)" }}
      >
        {chevron ? "›" : ""}
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
        {
          text: `${num(pr.heaviest)} × ${pr.heaviestReps}`,
          size: 14,
          weight: 500,
          tight: true,
          scramble: true,
        },
        {
          text: parseKey(pr.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
          size: 8,
          weight: 600,
          dim: true,
        },
      ],
      right: [
        {
          text: `Top ${percentile(detail.score)}%`,
          size: 14,
          weight: 600,
          tight: true,
          scramble: true,
        },
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
              <h2 className="text-[27px] leading-none tracking-[-0.015em]">
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
                    size={52}
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

          {/* Inset less than the header, so the cards read as the wider band */}
          <div className="-mx-1.5 mt-6 flex flex-col gap-1.5">
            <span className="px-2 pb-1.5 font-mono text-[10.5px] uppercase leading-none tracking-[0.18em] text-[#9a9a9a]">
              Muscle groups
            </span>

            {REGION_SECTIONS.map((section) => {
              if (section.kind === "single") {
                const sc = scores[section.group];
                const on = active === section.group;
                return (
                  <Row
                    key={section.group}
                    name={MUSCLE_LABEL[section.group]}
                    tierText={sc ? sc.tier : ""}
                    tierColor={sc ? sc.color : UNSCORED}
                    nameSize={16}
                    nameColor={on ? "#ffffff" : "#e4e4e4"}
                    background={on ? "#161616" : "#111111"}
                    minHeight={56}
                    onClick={() => pick(section.group)}
                  />
                );
              }

              const open = openIds.includes(section.id);
              const best = bestTier(section.children, scores);
              const holdsActive = section.children.includes(active);
              return (
                <div key={section.id} className="flex flex-col gap-1.5">
                  <Row
                    name={section.label}
                    sub={`${section.children.length} muscles`}
                    // "Best" rather than a tier of its own: a section is not
                    // scored, and naming the highest of its regions says where
                    // the colour on the bar came from instead of implying the
                    // group earned it.
                    tierText={best ? `Best ${best}` : ""}
                    tierColor={best ? TIER_COLOR[best] : UNSCORED}
                    nameSize={16}
                    nameColor={holdsActive ? "#ffffff" : "#e4e4e4"}
                    background={holdsActive ? "#161616" : "#111111"}
                    minHeight={56}
                    chevron={open ? "open" : "closed"}
                    onClick={() =>
                      setOpenIds((o) =>
                        o.includes(section.id)
                          ? o.filter((x) => x !== section.id)
                          : [...o, section.id],
                      )
                    }
                  />

                  {open &&
                    section.children.map((c) => {
                      const sc = scores[c];
                      return (
                        <Row
                          key={c}
                          name={MUSCLE_LABEL[c]}
                          tierText={sc ? sc.tier : ""}
                          tierColor={sc ? sc.color : UNSCORED}
                          nameSize={14}
                          nameColor={active === c ? "#ffffff" : "#a8a8a8"}
                          background={active === c ? "#161616" : "#0d0d0d"}
                          minHeight={44}
                          indent
                          onClick={() => pick(c)}
                        />
                      );
                    })}
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
