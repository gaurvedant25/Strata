import { useState, type ReactNode } from "react";
import { useDialog, usePresence } from "../lib/useDialog";
import { e1rm } from "../lib/stats";
import { Eyebrow, Scrim } from "./ui";
import { fmtClock, num } from "../lib/util";
import {
  ABSOLUTE,
  MUSCLE_LABEL,
  PLANK_SHARE,
  RANKING_LIFTS,
  REGION_ORDER,
  TIERS,
  TIER_COLOR,
  TIER_LEVEL,
  type MuscleGroup,
  type MuscleScore,
} from "../lib/strength";

/*
 * What the ranking system actually does, said once, in the order it happens.
 *
 * Every figure and every list in here is read out of `strength.ts` at render
 * rather than written down a second time: the lifts that carry you, the ones
 * scored on the plate, the stack exceptions, the rungs, the plank's share of a
 * body, the worked example. A card explaining a model it has quietly drifted
 * out of step with is worse than no card, and the only defence that survives a
 * change to the model is not restating it. The few claims below that are prose
 * rather than data are pinned by `scripts/check-rankings.cjs`.
 */

const ALL_LIFTS = Object.values(RANKING_LIFTS).flat();
const uniq = (names: string[]) => [...new Set(names)];

/**
 * The stack-loaded lifts that still rank.
 *
 * Derived from the names rather than listed out: the lat-pulldown pair and the
 * seated cable row are the only entries in the whole ranking set carrying
 * "Cable" or "Pulldown", so this cannot fall out of step with that set the way
 * a hand-written list would. The check script pins both halves of the claim —
 * that these three match, and that nothing else machine-shaped is in there.
 */
const STACK_EXCEPTIONS = uniq(
  ALL_LIFTS.filter((l) => /Cable|Pulldown/.test(l.name)).map((l) => l.name),
);
/** Scored on you plus whatever is hung off you. */
const CARRY_LIFTS = uniq(
  ALL_LIFTS.filter((l) => l.carriesBodyweight && !l.hold).map((l) => l.name),
);
/** Held against a clock instead of counted out. */
const HOLD_LIFTS = uniq(ALL_LIFTS.filter((l) => l.hold).map((l) => l.name));
/** Logged as added weight, and scored on that alone. */
const PLATE_LIFTS = uniq(
  ALL_LIFTS.filter((l) => l.added && !l.carriesBodyweight).map((l) => l.name),
);
/** The regions read in weight rather than in multiples of bodyweight. */
const ABSOLUTE_REGIONS = (Object.keys(ABSOLUTE) as MuscleGroup[]).map(
  (m) => MUSCLE_LABEL[m],
);

/** The two shoulder lifts that make the conversion argument on their own. */
const OHP = RANKING_LIFTS.shoulders[0];
const PUSH_PRESS = RANKING_LIFTS.shoulders.find((l) => l.name === "Push Press");

function list(names: string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Body copy. One tone for the sentence, `Key` for the words carrying it. */
function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-pretty text-[0.8125rem] leading-relaxed text-muted">
      {children}
    </p>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <span className="text-fg">{children}</span>;
}

/** A worked line: the arithmetic set as arithmetic, so it can be followed. */
function Working({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[9px] bg-[#1a1a1a] px-3 py-2.5 font-mono text-[0.75rem] leading-relaxed text-fg">
      {children}
    </p>
  );
}

/**
 * A labelled fact read off the reader's own data.
 *
 * Wraps rather than crushes, which is the same bargain `RankProgress` strikes
 * on the screen behind: at 320px a long label like "As Close-Grip Lat Pulldown"
 * beside a value leaves the value about thirty pixels to live in, and a figure
 * squeezed to a third of its width is worse than a figure on its own line. The
 * value keeps to the right edge when it drops, so the column still reads as a
 * column.
 */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-subrule py-[7px] last:border-0">
      <span className="min-w-0 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <span className="ml-auto min-w-0 text-right text-[0.8125rem] text-fg">
        {value}
      </span>
    </div>
  );
}

/**
 * One collapsed chapter.
 *
 * A button rather than a `details` element: the app's press feedback and its
 * chevron are both built for buttons, and the dialog's focus trap walks real
 * focusables. Closed content is unmounted, which is also what keeps it out of
 * that walk.
 */
function Section({
  id,
  n,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  n: number;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-cardrule first:border-0">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`rank-section-${id}`}
          className="press press-row flex w-full items-start gap-3 py-3.5 text-left"
        >
          <span className="w-3.5 shrink-0 pt-[3px] font-mono text-[0.6875rem] leading-none text-dim">
            {n}
          </span>
          <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-fg">
            {title}
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 pt-[2px] font-mono text-[0.875rem] leading-none text-muted transition-transform duration-[180ms]"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            &rsaquo;
          </span>
        </button>
      </h3>
      {open && (
        <div
          id={`rank-section-${id}`}
          className="animate-exswap flex flex-col gap-2.5 pb-4 pl-[26px] pr-1"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function RankingGuide({
  open,
  onClose,
  muscle,
  score,
  bodyweight,
  benchmark,
  unitLabel,
}: {
  open: boolean;
  onClose: () => void;
  /** The region selected on the screen behind, which the example is drawn from. */
  muscle: MuscleGroup;
  /** That region's score, absent when nothing has been logged against it. */
  score?: MuscleScore;
  /** The latest body weight, or null when none has ever been logged. */
  bodyweight: number | null;
  /** The lift to name when the region is empty. */
  benchmark: string;
  unitLabel: string;
}) {
  const panel = useDialog(open, onClose);
  const { present, closing } = usePresence(open);
  /*
   * The reader's own region leads, and is the one chapter that starts open.
   *
   * It is the only part of this card that is about them, and it is what makes
   * the eight chapters under it worth opening. Everything else starts shut,
   * which is the entire point of the card: all of it available, none of it
   * arriving as a wall.
   */
  const [openIds, setOpenIds] = useState<string[]>(["you"]);

  /*
   * Reopening returns to the top of the explanation rather than to whichever
   * chapter happened to be left open last time.
   *
   * Adjusted during render rather than from an effect, which is the same
   * answer `usePresence` reaches for: an effect does not run until after the
   * render has committed, so the card would paint one frame of the last
   * reader's chapters before collapsing them.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setOpenIds(["you"]);
  }

  if (!present) return null;

  const toggle = (id: string) =>
    setOpenIds((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const isOpen = (id: string) => openIds.includes(id);

  const region = MUSCLE_LABEL[muscle];
  const eligible = RANKING_LIFTS[muscle].map((l) => l.name);

  // The worked example, run through the same function the app scores with, so
  // the arithmetic on screen is the arithmetic in the model.
  const exWeight = 100;
  const exReps = 5;

  // The conversion example, read off the shoulders table. The heavier lift
  // losing is arithmetic rather than assertion.
  const ohpLift = 60;
  const ppLift = Math.round(ohpLift * 1.1);

  const pct = score?.next
    ? Math.min(99, Math.floor(score.next.progress * 100))
    : 100;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4 py-[max(env(safe-area-inset-top),1rem)]">
      <Scrim onClose={onClose} closing={closing} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rank-guide-title"
        tabIndex={-1}
        data-closing={closing || undefined}
        className="animate-rise leave-panel relative flex max-h-full w-full max-w-[27rem] flex-col overflow-hidden rounded-[22px] border border-cardrule bg-card outline-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-cardrule px-4 py-3.5">
          <Eyebrow>
            <span id="rank-guide-title">How rankings work</span>
          </Eyebrow>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close how rankings work"
            className="-my-3 -mr-3 grid size-11 place-items-center font-mono text-[0.9375rem] text-muted active:text-fg"
          >
            &#10005;
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4">
          {/* The whole model in three lines, for anyone who reads no further. */}
          <ol className="flex flex-col gap-2.5">
            {[
              "Finish a workout containing a lift that can score the region.",
              "Your best set becomes an estimated one-rep max, converted so that every lift can be compared.",
              "That figure, measured against your body weight, picks the tier.",
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="mt-[1px] grid size-[18px] shrink-0 place-items-center rounded-full border border-cardrule font-mono text-[0.625rem] leading-none text-muted">
                  {i + 1}
                </span>
                <span className="min-w-0 text-pretty text-[0.8125rem] leading-relaxed text-fg">
                  {step}
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-3.5 text-pretty text-[0.75rem] leading-relaxed text-dim">
            Everything below is the detail behind those three lines. Open
            whatever you want.
          </p>

          <div className="mt-4 flex flex-col">
            <Section
              id="you"
              n={0}
              title={`Your current example — ${region}`}
              open={isOpen("you")}
              onToggle={() => toggle("you")}
            >
              {score ? (
                <>
                  <P>
                    Read from what you have actually logged, using the same
                    numbers as the screen behind this card.
                  </P>
                  <div className="flex flex-col">
                    <Fact
                      label="Region"
                      value={`${region} · ${eligible.length} eligible ${
                        eligible.length === 1 ? "lift" : "lifts"
                      }`}
                    />
                    <Fact
                      label="Tier"
                      value={
                        <>
                          <span style={{ color: score.color }}>
                            {score.tier}
                          </span>
                          <span className="text-muted">
                            {" · "}
                            {TIER_LEVEL[score.tier]}
                          </span>
                        </>
                      }
                    />
                    <Fact label="Scored on" value={score.lift} />
                    <Fact
                      label="You logged"
                      value={
                        score.hold
                          ? `${fmtClock(score.hold.seconds)} hold${
                              score.hold.added > 0
                                ? ` · +${num(score.hold.added)} ${unitLabel}`
                                : ""
                            }`
                          : `${num(score.added1rm ?? score.best1rm)} ${unitLabel}${
                              score.added1rm == null ? "" : " added"
                            } est. 1RM`
                      }
                    />
                    {(score.added1rm != null || score.hold) && (
                      <Fact
                        label="Scored as"
                        value={`${num(score.best1rm)} ${unitLabel}`}
                      />
                    )}
                    {/* Only when the conversion actually moved the figure: on
                        a lift at a factor of 1 this row repeats the one above
                        it and reads as two different facts. */}
                    {num(score.equivalent) !== num(score.best1rm) && (
                      <Fact
                        label={`As ${score.benchmark}`}
                        value={`${num(score.equivalent)} ${unitLabel}`}
                      />
                    )}
                    {/* An absolute region is not divided by the lifter, so its
                        ratio is a weight already shown rather than a multiple
                        worth stating twice. */}
                    {!ABSOLUTE[muscle] && (
                      <Fact
                        label="Over bodyweight"
                        value={`${num(score.ratio, 2)}×`}
                      />
                    )}
                    <Fact
                      label="Progress"
                      value={
                        score.next
                          ? `${pct}% to ${score.next.tier}`
                          : "Top rank — nothing above it"
                      }
                    />
                    {score.next && (
                      <Fact
                        label="Next target"
                        value={
                          score.next.holdSeconds != null
                            ? `${fmtClock(score.next.holdSeconds)} hold`
                            : `+${num(score.next.remaining ?? 0, 1)} ${unitLabel} est. 1RM`
                        }
                      />
                    )}
                  </div>
                  {score.next ? (
                    <P>
                      That <Key>{pct}%</Key> is how far you are through the{" "}
                      {score.tier} band on the way to {score.next.tier} — not a
                      comparison with anybody else.
                    </P>
                  ) : (
                    <P>
                      <Key>{score.tier} is the top rung.</Key> There is nothing
                      above it, so the bar is full and there is no next target
                      to price.
                    </P>
                  )}
                </>
              ) : bodyweight == null ? (
                <>
                  <P>
                    <Key>
                      {region} is unscored, and so is every other region.
                    </Key>{" "}
                    No body weight has been logged, and almost every tier is read
                    as a multiple of it, so there is nothing to measure a lift
                    against.
                  </P>
                  <P>
                    Log your weight from the Strength screen and anything already
                    in your history scores immediately.
                  </P>
                </>
              ) : (
                <>
                  <P>
                    <Key>{region} has nothing eligible logged yet.</Key> Your
                    body weight is on file, so the only thing missing is one
                    completed set of a lift that can score this region.
                  </P>
                  <P>
                    The screen behind this card suggests <Key>{benchmark}</Key>,
                    but any of these will do — whichever you turn out to be best
                    at is the one that counts:
                  </P>
                  <P>{list(eligible)}.</P>
                </>
              )}
            </Section>

            <Section
              id="idea"
              n={1}
              title="The idea"
              open={isOpen("idea")}
              onToggle={() => toggle("idea")}
            >
              <P>
                Each of the <Key>{REGION_ORDER.length} regions</Key> on the
                figure is scored on its own, and each takes its tier from a{" "}
                <Key>single lift</Key>: the strongest eligible thing you have
                logged for it. It is not an average of your training, and it is
                not one nominated exercise — whichever lift you are best at wins
                the region.
              </P>
              <div className="flex flex-col gap-1.5 py-0.5">
                {TIERS.map((t, i) => (
                  <div key={t} className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="inline-block size-[7px] shrink-0 rounded-full"
                      style={{ background: TIER_COLOR[t] }}
                    />
                    <span
                      className="w-[68px] shrink-0 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.14em]"
                      style={{ color: TIER_COLOR[t] }}
                    >
                      {t}
                    </span>
                    <span className="min-w-0 text-[0.8125rem] text-muted">
                      {TIER_LEVEL[t]}
                      {i === 0 && " · the floor"}
                      {i === TIERS.length - 1 && " · the top"}
                    </span>
                  </div>
                ))}
              </div>
              <P>
                <Key>The thresholds are estimates.</Key> They are not taken from
                any published dataset. The larger regions were approximated from
                commonly cited strength charts; the ones added when the map was
                split into {REGION_ORDER.length} are looser still, because widely
                agreed figures for a shrug or a weighted twist do not really
                exist. Treat a tier as a rough compass for your own progress over
                time, not as a ranking against other people — the app holds no
                data about anybody else to rank you against.
              </P>
            </Section>

            <Section
              id="counts"
              n={2}
              title="Which workouts count"
              open={isOpen("counts")}
              onToggle={() => toggle("counts")}
            >
              <P>
                <Key>The workout has to be finished.</Key> A session still
                running scores nothing; it starts counting the moment you end it.
              </P>
              <P>
                <Key>The set has to be completed.</Key> Sets you skipped or never
                ticked off are ignored. A counted set needs at least one rep, and
                a held set needs time on the clock.
              </P>
              <P>
                <Key>The exercise has to be eligible.</Key> Free weights and your
                own body weight rank: a barbell, a dumbbell and your own mass are
                stable enough to compare between gyms. A stack is not — fifty on
                one chest press is not fifty on the one across town, and a
                cable's pulley ratio is set by the manufacturer.
              </P>
              <P>
                So most machine and cable work does <Key>not</Key> set a tier. It
                is still logged, still charted, and still holds its own personal
                records on Progress. It simply does not decide a rank.
              </P>
              <P>
                There are exactly {STACK_EXCEPTIONS.length} cable exceptions:{" "}
                <Key>{list(STACK_EXCEPTIONS)}</Key>. Their fixed-path setup is
                consistent enough for ranks this approximate, and they are
                primary ways people train their lats.
              </P>
            </Section>

            <Section
              id="measure"
              n={3}
              title="How a lift is measured"
              open={isOpen("measure")}
              onToggle={() => toggle("measure")}
            >
              <P>
                A set is turned into an <Key>estimated one-rep max</Key> — what
                that set suggests you could lift once. It is what lets a heavy
                triple and a lighter set of ten be compared, without you ever
                having to test a true single.
              </P>
              <Working>
                weight &times; (1 + reps &divide; 30)
                <br />
                {exWeight} {unitLabel} &times; {exReps} reps &rarr;{" "}
                {num(e1rm(exWeight, exReps), 1)} {unitLabel}
              </Working>
              <P>
                A single rep is simply itself. More reps at the same weight
                estimate higher, which is why adding a rep can move a rank
                without you touching the bar.
              </P>
              <P>
                The <Key>best single set</Key> across all of your finished
                workouts is what gets used — not the most recent, and not an
                average. A rank you have earned does not decay.
              </P>
              <P>
                One convention worth knowing:{" "}
                <Key>a dumbbell lift is the weight of one dumbbell</Key>, not the
                pair. Every dumbbell conversion assumes you log it that way.
              </P>
            </Section>

            <Section
              id="compare"
              n={4}
              title="How different lifts are compared"
              open={isOpen("compare")}
              onToggle={() => toggle("compare")}
            >
              <P>
                Lifts are not loaded alike, so they cannot be compared raw. Each
                eligible lift carries a <Key>conversion factor</Key>: what that
                lift is typically worth against the region's benchmark lift.
                Dividing your estimate by it gives a{" "}
                <Key>benchmark-equivalent</Key>, and those are what get compared.
                The highest equivalent wins the region.
              </P>
              {PUSH_PRESS && (
                <>
                  <P>
                    This is why the naturally heaviest exercise does not
                    automatically win. A {PUSH_PRESS.name.toLowerCase()} moves
                    more weight than {OHP.name.toLowerCase()} by nature — it is
                    rated at {PUSH_PRESS.factor}&times; — so it has to clear a
                    higher bar before it counts for more:
                  </P>
                  <Working>
                    {OHP.name} {ohpLift} &divide; {OHP.factor} ={" "}
                    {num(ohpLift / OHP.factor, 1)}
                    <br />
                    {PUSH_PRESS.name} {ppLift} &divide; {PUSH_PRESS.factor} ={" "}
                    {num(ppLift / PUSH_PRESS.factor, 1)}
                  </Working>
                  <P>
                    The heavier lift loses. Turned around, the same rule means a
                    lateral raise can take the shoulders off your overhead press
                    — if the raises are genuinely the better lift for you.
                  </P>
                </>
              )}
              <P>
                The benchmark is the lift a region's thresholds are written
                against, and the only one with a factor of 1. You never have to
                train it.
              </P>
            </Section>

            <Section
              id="bodyweight"
              n={5}
              title="How bodyweight movements are handled"
              open={isOpen("bodyweight")}
              onToggle={() => toggle("bodyweight")}
            >
              <P>
                These are all logged the same way — you enter{" "}
                <Key>what you added</Key>, never a total load — but they are
                scored in three different ways.
              </P>
              <P>
                <Key>You are the load: {list(CARRY_LIFTS)}.</Key> Scored on your
                body weight plus whatever is hung off you, because the plate is
                the small part of it. These rank from your first unweighted rep,
                so zero added weight is a real answer rather than a blank.
              </P>
              <P>
                That is the one place where the number you enter and the number
                you are scored on differ, and the Strength screen shows both: the
                big figure is what you logged, and the rank is read off the whole
                load.
              </P>
              <P>
                <Key>The plate is the load: {list(PLATE_LIFTS)}.</Key> Nobody's
                back extension is loaded by their own mass the way a pull-up is,
                so these are scored on the added weight alone — which means they
                rank only once there is some. Logged unweighted, they leave the
                region grey.
              </P>
              <P>
                <Key>Timed holds: {list(HOLD_LIFTS)}.</Key> A hold has no one-rep
                max to estimate, so it gets its own conversion: the load you are
                holding, scaled by how long you held it against a minute. A plank
                holds up roughly {Math.round(PLANK_SHARE * 100)}% of you, and a
                heavier lifter carrying more of themselves through the same hold
                is credited for it.
              </P>
              <Working>
                ({PLANK_SHARE} &times; bodyweight + added) &times; &radic;(seconds
                &divide; 60)
              </Working>
              <P>
                At exactly sixty seconds the figure is simply the load you
                carried. The square root is why doubling a hold is worth about
                forty percent more rather than twice as much — a ten-minute plank
                is not ten one-minute planks.
              </P>
            </Section>

            <Section
              id="tier"
              n={6}
              title="How a tier is chosen"
              open={isOpen("tier")}
              onToggle={() => toggle("tier")}
            >
              <P>
                The winning benchmark-equivalent is divided by{" "}
                <Key>your latest logged body weight</Key>, and that ratio is what
                the tier is read from. Normalising is the whole point: a{" "}
                {ohpLift} {unitLabel} bench says very different things about a{" "}
                {ohpLift} {unitLabel} lifter and a 110 {unitLabel} one.
              </P>
              <P>
                <Key>
                  {list(ABSOLUTE_REGIONS)}{" "}
                  {ABSOLUTE_REGIONS.length === 1 ? "is" : "are"} the exception.
                </Key>{" "}
                That ladder is read in weight rather than in multiples of body
                weight, because there your body is the load rather than the
                lifter, and dividing it out again would leave the region
                measuring nothing but time.
              </P>
              <P>
                There are five thresholds and six rungs.{" "}
                <Key>{TIERS[0]} is the floor</Key> — everything below the first
                threshold — and {TIERS[TIERS.length - 1]} is everything above the
                last.
              </P>
              <P>
                One setting changes the answer:{" "}
                <Key>the body map you chose during setup</Key> selects which set
                of thresholds applies. Your unit is a label on the numbers and
                does not affect the maths.
              </P>
              <P>
                A region stays unscored for one of two reasons.{" "}
                <Key>No body weight on file</Key> leaves every region unscored,
                because nothing can be normalised without it.{" "}
                <Key>No eligible lift</Key> logged for a region leaves just that
                one grey. Neither means you are weak; both mean the app has not
                been told enough.
              </P>
            </Section>

            <Section
              id="bar"
              n={7}
              title="What the progress bar means"
              open={isOpen("bar")}
              onToggle={() => toggle("bar")}
            >
              <P>
                The percentage is your position{" "}
                <Key>inside the tier you are already on</Key>, on the way to the
                next one. 49% means you are 49% of the way from where your
                current tier starts to where the next one begins.
              </P>
              <P>
                <Key>It does not mean you are stronger than 49% of users.</Key>{" "}
                There are no other users anywhere in this calculation, and the
                app holds no data about any.
              </P>
              <P>
                The box beside the figure is not a rank either.{" "}
                <Key>It is a trend</Key>: your estimated 1RM on the lift that
                ranks this region, first workout against latest, inside a
                window. Tap it to cycle week, month and year.
              </P>
              <P>
                It reads <Key>only that window</Key>. Your all-time best is
                deliberately kept out of it — a record set two years ago would
                otherwise hold one end of every comparison and report you as
                flat forever. The box on the other side of the figure is that
                best, with the date behind it, and it is usually neither of the
                two readings the percentage was worked out from.
              </P>
              <P>
                So this measures momentum rather than standing. A Diamond region
                down 4% this month is still Diamond — it just is not going
                anywhere at the moment.
              </P>
              <P>
                It is rounded down, and stops at 99% below the top rung, so you
                are never shown 100% at a rank you have not actually reached.
              </P>
              <P>
                <Key>
                  &ldquo;{unitLabel} to go&rdquo; is a gap in estimated one-rep
                  max
                </Key>
                , priced on the lift that won the region — not the weight to add
                to your next working set. Those are different numbers: at five
                reps, closing a 14 {unitLabel} gap in the estimate is about 12{" "}
                {unitLabel} more on the bar. On a lift that carries you, it is
                what goes on the belt.
              </P>
              <P>
                <Key>A hold quotes time instead.</Key> You do not close that gap
                by loading it, so the bar names the hold that would reach the
                threshold, read at the weight you last held it with.
              </P>
              <P>
                <Key>At {TIERS[TIERS.length - 1]} the bar is full</Key> and reads
                &ldquo;Top rank&rdquo;. There is no rung above it, and nothing
                left to be partway through.
              </P>
            </Section>

            <Section
              id="improve"
              n={8}
              title="How to improve a rank"
              open={isOpen("improve")}
              onToggle={() => toggle("improve")}
            >
              <P>
                <Key>Log a better set on any eligible lift for the region.</Key>{" "}
                The best one wins, so progress on any of them can take the rank —
                you do not have to beat the benchmark lift, or even train it.
                More weight, or the same weight for more reps, both raise the
                estimate.
              </P>
              <P>
                <Key>Finish the workout.</Key> Nothing counts until the session
                is ended and the sets are ticked off.
              </P>
              <P>
                <Key>Keep your body weight current.</Key> For every region but{" "}
                {list(ABSOLUTE_REGIONS)} it is the divisor, so a stale figure
                quietly skews every tier you hold. Putting on weight without
                putting on strength does lower the ratio — that is the
                measurement working rather than a fault in it.
              </P>
              <P>
                For a region with nothing logged, the Strength screen names the
                lift it wants and will take a single remembered set for it, so a
                region need not stay grey until your next session.
              </P>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
