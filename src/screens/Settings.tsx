import { useRef, useState } from "react";
import { Card, Screen, Sheet, inputCls } from "../components/ui";
import { exportBackup, importBackup, wipe } from "../lib/db";
import { todayKey } from "../lib/util";
import { useStore } from "../store";
import type { Unit } from "../types";

export function Settings() {
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
    <Screen title="Settings">
      <Section title="Units & timer">
        <Row label="Weight unit">
          <div className="flex gap-1.5">
            {(["kg", "lb"] as Unit[]).map((u) => (
              <button
                key={u}
                onClick={() => void s.saveSettings({ unit: u })}
                className={`w-14 rounded-lg py-2 text-[14px] font-semibold ${
                  s.settings.unit === u ? "bg-accent text-ink" : "bg-panel2 text-muted"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Default rest" hint="Starts automatically when you tick a working set.">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() =>
                void s.saveSettings({ restSeconds: Math.max(15, s.settings.restSeconds - 15) })
              }
              className="size-9 rounded-lg bg-panel2 text-muted"
            >
              −
            </button>
            <span className="w-16 text-center text-[15px] font-semibold tabular-nums">
              {Math.floor(s.settings.restSeconds / 60)}:
              {String(s.settings.restSeconds % 60).padStart(2, "0")}
            </span>
            <button
              onClick={() => void s.saveSettings({ restSeconds: s.settings.restSeconds + 15 })}
              className="size-9 rounded-lg bg-panel2 text-muted"
            >
              +
            </button>
          </div>
        </Row>
        <Toggle
          label="Auto-start rest timer"
          value={s.settings.restAutoStart}
          onChange={(v) => void s.saveSettings({ restAutoStart: v })}
        />
        <Toggle
          label="Vibrate when rest ends"
          value={s.settings.vibrate}
          onChange={(v) => void s.saveSettings({ vibrate: v })}
        />
        <Toggle
          label="Beep when rest ends"
          value={s.settings.sound}
          onChange={(v) => void s.saveSettings({ sound: v })}
        />
      </Section>

      <Section title="Exercises">
        <button
          onClick={() => setExOpen(true)}
          className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-panel2"
        >
          <span className="text-[15px]">Manage exercise library</span>
          <span className="text-[13px] text-muted">{s.exercises.length} →</span>
        </button>
      </Section>

      <Section title="Your data" hint="Everything lives on this device only. Nothing is uploaded.">
        <button
          onClick={() => void doExport()}
          className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-panel2"
        >
          <span className="text-[15px]">Export backup (.json)</span>
          <span className="text-muted">→</span>
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-between border-t border-line px-4 py-3.5 text-left active:bg-panel2"
        >
          <span className="text-[15px]">Restore from backup</span>
          <span className="text-muted">→</span>
        </button>
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
              confirm("Erase every workout, routine and exercise on this device? This cannot be undone.")
            ) {
              void wipe().then(() => location.reload());
            }
          }}
          className="w-full border-t border-line px-4 py-3.5 text-left text-[15px] text-red-400 active:bg-panel2"
        >
          Erase all data
        </button>
      </Section>

      <p className="mt-6 px-1 text-center text-[12px] leading-relaxed text-muted">
        Gym Log works fully offline. Back up regularly — clearing your browser data or deleting the
        app also deletes your logs.
      </p>

      {msg && (
        <div className="fixed inset-x-4 bottom-28 z-50 rounded-xl border border-line bg-panel2 px-4 py-3 text-center text-[14px] shadow-xl">
          {msg}
          <button className="ml-3 text-accent" onClick={() => setMsg(null)}>
            OK
          </button>
        </div>
      )}

      <ExerciseManager open={exOpen} onClose={() => setExOpen(false)} />
    </Screen>
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
        className={`${inputCls} mb-3`}
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="overflow-hidden rounded-xl border border-line">
        {list.map((e, i) => (
          <div
            key={e.id}
            className={`flex items-center gap-3 px-3.5 py-3 ${i ? "border-t border-line" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px]">{e.name}</p>
              <p className="text-[12px] text-muted">
                {e.muscle}
                {e.bodyweight ? " · bodyweight" : ""}
              </p>
            </div>
            {used.has(e.id) ? (
              <span className="shrink-0 text-[11px] text-muted">logged</span>
            ) : (
              <button
                onClick={() => {
                  if (confirm(`Delete "${e.name}" from your library?`)) void s.deleteExercise(e.id);
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-[13px] text-red-400 active:bg-panel2"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted">
        Exercises you have already logged can't be deleted — that would orphan your history. Add new
        ones from the picker inside a workout.
      </p>
    </Sheet>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      <Card className="overflow-hidden">{children}</Card>
      {hint && <p className="mt-1.5 px-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <p className="text-[15px]">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between border-b border-line px-4 py-3.5 text-left last:border-b-0 active:bg-panel2"
    >
      <span className="text-[15px]">{label}</span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          value ? "bg-accent" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full bg-white transition-all ${
            value ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}
