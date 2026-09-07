import { useState } from "react";
import { Button, Eyebrow } from "../components/ui";
import { PRESETS } from "../lib/presets";
import { num, todayKey } from "../lib/util";
import { useStore } from "../store";
import type { Gender, Unit } from "../types";

/**
 * First run. Four questions, asked once.
 *
 * All four were previously scattered: unit and sex sat in Settings, bodyweight
 * behind an empty state on the Strength screen, and the split behind the
 * Routines tab. Each one gates something — nothing scores without a bodyweight,
 * and the standards are wrong without a sex — so a new install used to open on
 * a screen that could not show anything until you found them.
 *
 * Every step is skippable and every answer is editable afterwards, so this
 * gathers defaults rather than blocking entry.
 */

type Step = {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  back: string;
};

const STEPS: Step[] = [
  {
    eyebrow: "Step 1 of 4",
    title: "Kilos or pounds?",
    body: "Every weight in the app is shown in this unit. You can change it later in Settings.",
    cta: "Continue",
    back: "Skip setup",
  },
  {
    eyebrow: "Step 2 of 4",
    title: "What do you weigh?",
    body: "Strength is scored against your bodyweight, so the body map stays blank until this is set.",
    cta: "Continue",
    back: "Back",
  },
  {
    eyebrow: "Step 3 of 4",
    title: "Which body map?",
    body: "This picks the figure you tap on and the strength standards each region is scored against.",
    cta: "Continue",
    back: "Back",
  },
  {
    eyebrow: "Step 4 of 4",
    title: "Pick a starting split",
    body: "Just a starting point — every day inside it is yours to edit, add to or delete.",
    cta: "Start training",
    back: "Back",
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const s = useStore();
  const [i, setI] = useState(0);
  const [unit, setUnit] = useState<Unit>(s.settings.unit);
  const [gender, setGender] = useState<Gender>(s.settings.gender);
  const [bw, setBw] = useState(unit === "lb" ? 180 : 80);
  const [splitKey, setSplitKey] = useState(PRESETS[1].key);

  const step = STEPS[i];

  async function finish() {
    await s.saveSettings({ unit, gender });
    await s.logBodyWeight(todayKey(), bw);
    const preset = PRESETS.find((p) => p.key === splitKey);
    if (preset) await s.useSplit(preset);
    onDone();
  }

  function next() {
    if (i === STEPS.length - 1) void finish();
    else setI(i + 1);
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+26px)] pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="flex gap-1.5 pb-11">
        {STEPS.map((_, n) => (
          <span
            key={n}
            className="h-0.5 flex-1 transition-colors"
            style={{ background: n <= i ? "#f5f5f5" : "#1a1a1a" }}
          />
        ))}
      </div>

      <Eyebrow>{step.eyebrow}</Eyebrow>
      <h1 className="mt-3.5 text-[1.875rem] font-bold leading-[1.1] tracking-[-0.028em] text-pretty">
        {step.title}
      </h1>
      <p className="mt-3 text-[0.875rem] leading-relaxed text-muted text-pretty">
        {step.body}
      </p>

      <div className="min-h-0 flex-1 pt-8">
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
            <div className="flex items-end gap-3 border-b border-fg pb-3.5">
              <span className="font-mono text-[3.5rem] font-medium leading-[0.9] tracking-[-0.04em]">
                {num(bw, 1)}
              </span>
              <span className="pb-[7px] font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted">
                {unit === "lb" ? "lbs" : "kg"}
              </span>
            </div>
            <div className="flex gap-2.5 pt-4.5">
              {[-1, -0.1, 0.1, 1].map((d) => (
                <button
                  key={d}
                  onClick={() =>
                    setBw((v) => Math.max(30, +(v + d).toFixed(1)))
                  }
                  className="h-11 flex-1 rounded-full border border-rule font-mono text-[0.75rem] font-medium active:border-faint"
                >
                  {d > 0 ? "+" : ""}
                  {d}
                </button>
              ))}
            </div>
            <p className="mt-5 text-[0.8125rem] leading-relaxed text-muted">
              Saved against today. You can log it again any time from the
              Strength screen.
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
                sub: "Male standards for all six regions.",
              },
              {
                key: "female" as Gender,
                title: "Female",
                sub: "Female standards for all six regions.",
              },
            ]}
          />
        )}

        {i === 3 && (
          <Choices
            value={splitKey}
            onChange={setSplitKey}
            options={PRESETS.map((p) => ({
              key: p.key,
              title: p.name,
              sub: p.blurb,
            }))}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 pt-6">
        <Button onClick={next}>{step.cta}</Button>
        <Button
          variant="quiet"
          onClick={() => (i === 0 ? onDone() : setI(i - 1))}
        >
          {step.back}
        </Button>
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
    <div className="border-t border-rule">
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`flex w-full items-start gap-3.5 border-b border-subrule px-1 py-4 text-left transition-colors ${
              on ? "bg-[#0c0c0c]" : ""
            }`}
          >
            <span className="flex-1">
              <span
                className={`block text-[1rem] font-medium ${on ? "text-fg" : "text-[#8b8b90]"}`}
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
