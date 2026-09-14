import { useEffect, useMemo, useState } from "react";
import { bodyCard } from "../lib/card/select";
import { useShareCard } from "../lib/card/useShareCard";
import { BodyMap, type BodyView, type Callouts } from "../components/BodyMap";
import { drawnInView, groupsInView } from "../lib/anatomy/anchors";
import { LogBestSet } from "../components/LogBestSet";
import { Numeral, resetNumerals } from "../components/Numeral";
import { Share, Tune } from "../components/icons";
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
  benchmarkLift,
  MUSCLE_LABEL,
  TIERS,
  TIER_COLOR,
  TIER_LEVEL,
  REGION_SECTIONS,
  bestNamed,
  computeMuscleScores,
  type MuscleGroup,
  type MuscleScore,
  type Tier,
} from "../lib/strength";
import { personalRecords } from "../lib/stats";
import { fmtClock, num, parseKey, todayKey } from "../lib/util";
import { useStore } from "../store";

/**
 * What the figure says about a region nothing has been logged against.
 *
 * A region with no scored lift has no numbers to annotate, but the figure
 * still has to answer the tap: one box, in the same frame the real callouts
 * use, saying why it is empty. Short lines because the box is a quarter of the
 * stage wide — the sentence naming the lift to log lives in the panel below,
 * where there is room for it.
 */
const NO_DATA: Callouts = {
  right: [
    { text: "No data", size: 11, weight: 600, dim: true },
    { text: "Log a lift", size: 11, weight: 600 },
  ],
};

const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

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

/**
 * The tier dot. The only colour on the screen besides the figure itself.
 *
 * Colour is all it has, so on its own it says nothing to anyone who cannot
 * separate these hues or cannot see it at all. It carries its tier as text for
 * assistive technology; sighted readers get the same word spelled out in the
 * eyebrow beside it.
 */
function Dot({ score, size = 7 }: { score?: MuscleScore; size?: number }) {
  return (
    <span
      role="img"
      aria-label={score ? `${score.tier} tier` : "Not yet scored"}
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: score ? score.color : "var(--color-faint)",
        boxShadow: score ? `0 0 ${size + 3}px ${score.color}` : undefined,
      }}
    />
  );
}

/** The bar colour for a region with nothing logged against it yet. */
const UNSCORED = "var(--color-faint)";

/**
 * A section's own tier: the average of the regions inside it.
 *
 * Averaging rather than taking the best, because a section is meant to say how
 * the whole of it is doing — one strong region should not speak for two weak
 * ones sitting next to it.
 *
 * Only scored regions are counted. An unscored one means nothing has been
 * logged for it, not that it is weak, and folding it in as the bottom rung
 * would let an untrained lift quietly drag down a section that is going fine.
 * This is a label on a list; the body map still colours every region by its
 * own score and is untouched by any of it.
 */
function averageTier(
  groups: MuscleGroup[],
  scores: Partial<Record<MuscleGroup, MuscleScore>>,
): Tier | null {
  const ranks = groups
    .map((g) => scores[g]?.tier)
    .filter((t): t is Tier => !!t);
  if (!ranks.length) return null;
  const mean = ranks.reduce((t, r) => t + TIERS.indexOf(r), 0) / ranks.length;
  return TIERS[Math.round(mean)];
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
      // A child is inset from the leading edge only, but it still has to end
      // where its parent ends — the card behind it has a padding, and a row
      // running past it reads as a mistake rather than as a nesting.
      style={{
        minHeight,
        marginLeft: indent ? 22 : 0,
        width: indent ? "calc(100% - 22px)" : "100%",
        background,
      }}
      aria-expanded={chevron ? chevron === "open" : undefined}
      className="press press-row relative grid grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-2.5 overflow-hidden rounded-[9px] pl-4 pr-3 text-left"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: tierColor }}
      />
      <span className="flex min-w-0 flex-col gap-[5px] py-[11px]">
        <span
          className="truncate leading-[1.15]"
          style={{ fontSize: `${nameSize / 16}rem`, color: nameColor }}
        >
          {name}
        </span>
        {sub && (
          <span className="font-mono text-[0.6875rem] uppercase leading-none tracking-[0.16em] text-muted">
            {sub}
          </span>
        )}
      </span>
      <span
        className="whitespace-nowrap font-mono text-[0.6875rem] font-medium uppercase leading-none tracking-[0.16em]"
        style={{ color: tierColor }}
      >
        {tierText}
      </span>
      <span
        className="inline-block text-right font-mono text-[0.875rem] leading-none text-muted transition-transform duration-[180ms]"
        style={{
          transform: chevron === "open" ? "rotate(90deg)" : "rotate(0deg)",
        }}
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
  /**
   * The region being read, kept per side of the figure.
   *
   * One selection shared by both sides meant turning the figure round left the
   * chest selected while you were looking at a back: the panel went on
   * reporting a bench press, and the callout pointed its line at the spine.
   * Each side remembers what you last asked it, and answers with a region it
   * actually draws.
   */
  const [selected, setSelected] = useState<
    Record<BodyView, MuscleGroup | null>
  >({ front: null, back: null });
  const [view, setView] = useState<BodyView>("front");
  /** The region whose "no data" box was tapped, and so the one being scored. */
  const [logging, setLogging] = useState<MuscleGroup | null>(null);
  const unitLabel = s.settings.unit === "lb" ? "lbs" : "kg";

  const latestBw = s.bodyweight[s.bodyweight.length - 1];

  const scores = useMemo(
    () =>
      computeMuscleScores(
        s.sessions,
        s.exercises,
        latestBw?.weight ?? null,
        s.settings.gender,
      ),
    [s.sessions, s.exercises, latestBw?.weight, s.settings.gender],
  );

  /*
   * The body chart as a picture, drawn before the button is pressed.
   *
   * `scores` is already memoised above, so building this costs a few strings
   * rather than a second pass over every session — and the drawing itself
   * happens off in the hook, once, when the numbers change.
   */
  const bodyData = useMemo(
    () =>
      Object.keys(scores).length
        ? bodyCard(s.settings.gender, view, scores, unitLabel)
        : null,
    [scores, s.settings.gender, view, unitLabel],
  );
  const shareCard = useShareCard(
    bodyData && "body",
    bodyData,
    `gym-log-body-${todayKey()}.png`,
  );

  // Leaving the tab unmounts this screen; forgetting its figures means coming
  // back scrambles rather than rolling from the region shown last time.
  useEffect(() => () => resetNumerals("home:"), []);

  // What this side of the figure opens on, before anything is picked: its own
  // first scored region, or its first region at all.
  const shown = useMemo(
    () => groupsInView(s.settings.gender, view),
    [s.settings.gender, view],
  );
  const active =
    selected[view] ?? shown.find((m) => scores[m]) ?? shown[0] ?? "chest";
  const detail = scores[active];

  // Annotations on the figure: what the best set of the region's lift actually
  // was, and roughly where that sits. Absent until the region has been scored.
  //
  // Their values churn rather than roll, unlike the figures in the panel below.
  // A change of region tears these boxes down and draws them again with the
  // leader line, so there is nothing on screen for a value to travel from; a
  // roll also ran its whole course behind a box that was still opening, which
  // is why switching region looked like it animated nothing at all.
  const callouts: Callouts = useMemo(() => {
    if (!detail) return NO_DATA;
    const prs = personalRecords(s.sessions.filter((x) => x.endedAt));
    const pr = bestNamed(s.exercises, prs, detail.lift);
    if (!pr) return NO_DATA;
    return {
      left: [
        { text: detail.lift, size: 8, weight: 600, dim: true },
        {
          text: `${num(pr.heaviest)} × ${pr.heaviestReps}`,
          size: 14,
          weight: 500,
          tight: true,
          scramble: true,
        },
        {
          text: parseKey(pr.date).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          }),
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
  }, [detail, s.exercises, s.sessions]);

  // A section opens when it holds the selected region, so tapping a muscle on
  // the figure reveals it in the list rather than hiding it inside a heading.
  const activeSection = REGION_SECTIONS.find(
    (x) => x.kind === "group" && x.children.includes(active),
  );
  const [openIds, setOpenIds] = useState<string[]>(() =>
    activeSection && activeSection.kind === "group" ? [activeSection.id] : [],
  );
  const activeId =
    activeSection && activeSection.kind === "group" ? activeSection.id : null;
  useEffect(() => {
    if (activeId)
      setOpenIds((o) => (o.includes(activeId) ? o : [...o, activeId]));
  }, [activeId]);

  /** Selecting a region from the figure keeps the side you are looking at. */
  function pickOnFigure(m: MuscleGroup) {
    setSelected((o) => ({ ...o, [view]: m }));
  }

  /** Selecting a region from the list also spins the figure to the side that
   *  region is on — unless the side already showing draws it. */
  function pick(m: MuscleGroup) {
    const to: BodyView = drawnInView(s.settings.gender, view, m)
      ? view
      : BACK_GROUPS.includes(m)
        ? "back"
        : "front";
    setSelected((o) => ({ ...o, [to]: m }));
    setView(to);
    /*
     * And carries you back up to it.
     *
     * Everything a selection changes — the figure turning and relighting, the
     * callouts redrawing, the score and the lift behind it — is above the list
     * you pick it from, and the list is long enough that picking a leg muscle
     * happens with all of it off the top of the screen. Without this the tap
     * appeared to do nothing but tint one row.
     *
     * Smoothly, because the point is to show that the screen moved rather than
     * to teleport: a figure that is suddenly there does not read as the same
     * figure you were just looking at. Someone who has asked for less motion
     * gets it immediately instead.
     */
    window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
  }

  async function saveBw() {
    const v = parseFloat(bw.replace(",", "."));
    if (!isFinite(v) || v <= 0) return;
    await s.logBodyWeight(todayKey(), v);
    setBw("");
    setBwOpen(false);
  }

  return (
    <div className="min-h-full px-5 pb-stack pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="flex items-center justify-between pb-3.5">
        <Eyebrow>Strength</Eyebrow>
        <div className="-my-3 -mr-3 flex items-center">
          {/* Only offered once there is something lit to send. An unscored
              figure is a picture of nothing. */}
          {shareCard.ready && (
            <button
              onClick={shareCard.share}
              aria-label="Share body chart"
              className="grid size-11 place-items-center text-muted active:text-fg"
            >
              <Share size={17} />
            </button>
          )}
          <button
            onClick={onSettings}
            aria-label="Settings"
            className="grid size-11 place-items-center text-muted active:text-fg"
          >
            <Tune />
          </button>
        </div>
      </div>

      {!latestBw ? (
        <Empty
          eyebrow="Nothing scored yet"
          title="Every score here is a lift measured against your bodyweight."
          body="Nothing shows up until we know what you weigh."
          action={
            <Button onClick={() => setBwOpen(true)}>Log body weight</Button>
          }
        />
      ) : (
        <>
          {/*
            The figure and the numbers read off it are two things, so they sit
            on two cards. A card is the quietest way to say "this belongs
            together" — one flat grey, no border, no shadow — and it lets the
            body map own a panel of its own instead of bleeding into the list
            underneath it.
          */}
          <section className="rounded-[26px] bg-card px-1.5 pb-1.5 pt-2.5">
            <div className="mt-0.5">
              <BodyMap
                gender={s.settings.gender}
                scores={scores}
                selected={active}
                onSelect={pickOnFigure}
                view={view}
                onViewChange={setView}
                showToggle={false}
                maxWidth={268}
                callouts={callouts}
                onCalloutClick={detail ? undefined : () => setLogging(active)}
                onCalloutLabel={`Score ${MUSCLE_LABEL[active]} from your best set`}
              />
            </div>

            {/*
            Bodyweight sits under the figure rather than above it, in the same
            boxed style as the callouts on either side of the body: everything
            on this screen is a lift measured against this number, so it reads
            as one more annotation on the figure instead of a headline of its
            own. Tapping it is still how you update it.
          */}
            <div className="-mt-2 flex justify-end">
              <button
                onClick={() => setBwOpen(true)}
                aria-label={`Body weight ${num(latestBw.weight)} ${unitLabel}, tap to update`}
                // No box, so the figure aligns to the content edge like everything
                // else on the screen. `min-w-11` keeps the target at 44px now that
                // the border is not holding it open.
                //
                // The `pr-2` is what puts this number in the same right-hand
                // column as the score, the lift and the rows in the panel
                // below. The card the figure sits on is padded 6px so the
                // figure can be as wide as the card allows; the panel below is
                // padded 14px. Left flush with its own card, this number would
                // be the only thing on the screen standing 8px further right
                // than everything under it, so it gives that 8px back.
                className="press min-w-11 py-2.5 pl-3 pr-2 text-right"
              >
                <span className="block font-mono text-[1.375rem] font-medium leading-none tracking-[-0.02em]">
                  <Numeral id="home:bw" text={num(latestBw.weight)} />
                </span>
                <span className="mt-1.5 block font-mono text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.16em] text-muted">
                  {unitLabel}
                </span>
              </button>
            </div>

            <TextTabs
              className="justify-center pb-3.5"
              gap="gap-6"
              options={[
                { id: "front", label: "front" },
                { id: "back", label: "back" },
              ]}
              value={view}
              onChange={setView}
            />
          </section>

          {/* Card two: the selected region, and the list you select from. */}
          <section className="mt-2.5 rounded-[26px] bg-card px-3.5 pb-3.5 pt-4">
            <div>
              <div className="flex items-center gap-2.5">
                <Dot score={detail} size={9} />
                <h2 className="text-[1.6875rem] leading-none tracking-[-0.015em]">
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
                        <Numeral
                          id="home:best"
                          text={
                            detail.hold
                              ? fmtClock(detail.hold.seconds)
                              : num(detail.added1rm ?? detail.best1rm)
                          }
                          delay={30}
                          hold={98}
                          perChar={34}
                        />
                      }
                      /* Three things can stand here, and each is the figure
                         you actually logged: a hold in minutes and seconds, the
                         weight on the belt for a pull-up, or a plain estimated
                         1RM. The whole load is still what the rank was read
                         from — it is just not the number you entered. */
                      unit={
                        detail.hold
                          ? "best hold"
                          : `${unitLabel}${
                              detail.added1rm == null ? "" : " added"
                            } est. 1RM`
                      }
                    />
                  </div>
                  {/* A hold has no multiple of bodyweight to quote — its whole
                      point is that the body is the load, not the divisor — so it
                      names what was on you instead. */}
                  {detail.hold ? (
                    <p className="mt-2.5 text-[0.8125rem] text-muted">
                      {detail.lift}
                      {detail.hold.added > 0 && (
                        <>
                          {" · "}
                          <span className="font-mono text-fg">
                            +{num(detail.hold.added)} {unitLabel}
                          </span>
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="mt-2.5 text-[0.8125rem] text-muted">
                      {detail.lift} ·{" "}
                      <span className="font-mono text-fg">
                        <Numeral
                          id="home:ratio"
                          text={num(detail.best1rm / latestBw.weight, 2)}
                        />
                        ×
                      </span>{" "}
                      bodyweight
                    </p>
                  )}
                </>
              ) : (
                // The same action as the box on the figure. This sentence has
                // always named the lift to log; it may as well be the way to
                // log it, for anyone who reads the panel before the diagram.
                <button
                  onClick={() => setLogging(active)}
                  className="mt-3 text-left text-[0.8125rem] leading-relaxed text-muted active:text-fg"
                >
                  Log a {benchmarkLift(active, s.settings.benchmarks)} set to
                  score this region.{" "}
                  <span className="whitespace-nowrap font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-fg underline decoration-[1.5px] underline-offset-[4px]">
                    Add it
                  </span>
                </button>
              )}
            </div>

            {/* Flush with the header above it: the card is the band now */}
            <div className="mt-6 flex flex-col gap-1.5">
              <span className="pb-1.5 font-mono text-[0.6875rem] uppercase leading-none tracking-[0.18em] text-muted">
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
                      background={on ? "#2a2a2a" : "#1e1e1e"}
                      minHeight={56}
                      onClick={() => pick(section.group)}
                    />
                  );
                }

                const open = openIds.includes(section.id);
                const avg = averageTier(section.children, scores);
                const holdsActive = section.children.includes(active);
                return (
                  <div key={section.id} className="flex flex-col gap-1.5">
                    <Row
                      name={section.label}
                      sub={`${section.children.length} muscles`}
                      tierText={avg ?? ""}
                      tierColor={avg ? TIER_COLOR[avg] : UNSCORED}
                      nameSize={16}
                      nameColor={holdsActive ? "#ffffff" : "#e4e4e4"}
                      background={holdsActive ? "#2a2a2a" : "#1e1e1e"}
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
                            background={active === c ? "#2a2a2a" : "#191919"}
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
          </section>
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
        <p className="mt-2.5 text-[0.75rem] text-muted">
          Saved against today. One entry per day.
        </p>
      </Sheet>

      <LogBestSet
        open={!!logging}
        muscle={logging}
        onClose={() => setLogging(null)}
      />
    </div>
  );
}
