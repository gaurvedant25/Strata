import { useRef, useState, type ReactNode } from "react";
import { Eyebrow, Segmented, Sheet, inputCls } from "../components/ui";
import { exportBackup, importBackup, wipe } from "../lib/db";
import { todayKey } from "../lib/util";
import { useStore } from "../store";
import type { Gender, Unit } from "../types";

export function Settings({ onBack }: { onBack: () => void }) {
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [exOpen, setExOpen] = useState(false);

  async function doExport() {
    const data = await exportBackup();
    const json = JSON.stringify(data, null, 2);
    const file = new File([json], `gym-log-${todayKey()}.json`, { type: "application/json" });

    // iOS installed PWAs handle share sheets far better than <a download>
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Gym Log backup" });
        return;
      } catch {
        /* user cancelled — fall through to download */
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setMsg(`Saved ${file.name} to your downloads.`);
  }

  async function doImport(f: File) {
    try {
      const parsed: unknown = JSON.parse(await f.text());
      await importBackup(parsed);
      await s.reload();
      setMsg("Backup restored.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  return (
    <div className="min-h-full pb-40">
      <div className="flex items-center justify-between px-5 pb-5 pt-[calc(env(safe-area-inset-top)+14px)]">
        <Eyebrow>Settings</Eyebrow>
        <button onClick={onBack} className="flex items-center gap-1.5 text-muted active:text-fg">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 6l-6 6 6 6" />
          </svg>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">
            Strength
          </span>
        </button>
      </div>

      <Group title="Units" />
      <SettingRow label="Weight unit" rule="subrule">
        <Segmented
          options={[
            { id: "kg" as Unit, label: "kg" },
            { id: "lb" as Unit, label: "lb" },
          ]}
          value={s.settings.unit}
          onChange={(u) => void s.saveSettings({ unit: u })}
        />
      </SettingRow>
      <SettingRow label="Sex" hint="Strength standards differ by sex.">
        <Segmented
          options={[
            { id: "male" as Gender, label: "male" },
            { id: "female" as Gender, label: "female" },
          ]}
          value={s.settings.gender}
          onChange={(g) => void s.saveSettings({ gender: g })}
        />
      </SettingRow>

      <Group title="Exercises" />
      <ActionRow
        label="Exercise library"
        value={`${s.exercises.length} →`}
        onClick={() => setExOpen(true)}
      />

      <Group title="Your data" />
      <ActionRow
        label="Export backup"
        value=".json →"
        rule="subrule"
        onClick={() => void doExport()}
      />
      <ActionRow
        label="Restore from backup"
        value="→"
        rule="subrule"
        onClick={() => fileRef.current?.click()}
      />
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImport(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => {
          if (
            confirm(
              "Erase every workout, routine and exercise on this device? This cannot be undone.",
            )
          ) {
            void wipe().then(() => location.reload());
          }
        }}
        className="flex w-full items-center justify-between border-b border-rule px-5 py-3.5 text-left active:bg-[#0b0b0b]"
      >
        <span className="text-[15px] text-danger">Erase all data</span>
        <span className="text-[#4d1a16]">→</span>
      </button>

      <p className="px-5 pt-6 text-[12px] leading-[1.7] text-muted text-pretty">
        Everything lives on this device only — nothing is uploaded. Clearing your browser data or
        deleting the app also deletes your logs, so back up regularly.
      </p>

      {msg && (
        <div className="fixed inset-x-0 bottom-28 z-50 mx-auto flex max-w-lg items-center justify-between gap-4 border-y border-rule bg-ink px-5 py-3.5 text-[14px]">
          {msg}
          <button
            className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-fg"
            onClick={() => setMsg(null)}
          >
            OK
          </button>
        </div>
      )}

      <ExerciseManager open={exOpen} onClose={() => setExOpen(false)} />
    </div>
  );
}

function Group({ title }: { title: string }) {
  return (
    <div className="border-t border-rule px-5 pb-2 pt-4">
      <Eyebrow className="tracking-[0.18em]">{title}</Eyebrow>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  children,
  rule = "rule",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  rule?: "rule" | "subrule";
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-5 py-3 ${
        rule === "rule" ? "border-b border-rule" : "border-b border-subrule"
      }`}
    >
      <div className="min-w-0">
        <p className="text-[15px]">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ActionRow({
  label,
  value,
  onClick,
  rule = "rule",
}: {
  label: string;
  value: string;
  onClick: () => void;
  rule?: "rule" | "subrule";
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between px-5 py-3.5 text-left active:bg-[#0b0b0b] ${
        rule === "rule" ? "border-b border-rule" : "border-b border-subrule"
      }`}
    >
      <span className="text-[15px]">{label}</span>
      <span className="font-mono text-[12px] text-muted">{value}</span>
    </button>
  );
}

function ExerciseManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [q, setQ] = useState("");
  const list = s.exercises
    .filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name));

  const used = new Set(s.sessions.flatMap((x) => x.entries.map((e) => e.exerciseId)));

  return (
    <Sheet open={open} onClose={onClose} title="Exercise library">
      <input
        className={`${inputCls} mb-4`}
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="border-t border-rule">
        {list.map((e) => (
          <div key={e.id} className="flex items-center gap-3 border-b border-subrule py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px]">{e.name}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                {e.muscle}
                {e.bodyweight ? " · bodyweight" : ""}
              </p>
            </div>
            {used.has(e.id) ? (
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                logged
              </span>
            ) : (
              <button
                onClick={() => {
                  if (confirm(`Delete "${e.name}" from your library?`)) void s.deleteExercise(e.id);
                }}
                className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-danger"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="pt-4 text-[12px] leading-relaxed text-muted">
        Exercises you have already logged can't be deleted — that would orphan your history. Add new
        ones from the picker inside a workout.
      </p>
    </Sheet>
  );
}
