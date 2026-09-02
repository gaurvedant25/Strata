import { useMemo } from "react";
import { todayKey } from "../lib/util";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * GitHub-style contribution grid: one column per week, one dot per weekday,
 * lit up on days a workout was logged. Matches the dashboard reference —
 * dense dots with month labels floating above the week they start in.
 */
export function Heatmap({ activeDates, weeks = 13 }: { activeDates: Set<string>; weeks?: number }) {
  const columns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (6 - today.getDay())); // this Saturday

    const cols: { key: string; date: Date; active: boolean; future: boolean }[][] = [];
    const start = new Date(endOfWeek);
    start.setDate(endOfWeek.getDate() - weeks * 7 + 1);

    for (let w = 0; w < weeks; w++) {
      const col: (typeof cols)[number] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const key = todayKey(date);
        col.push({ key, date, active: activeDates.has(key), future: date > today });
      }
      cols.push(col);
    }
    return cols;
  }, [activeDates, weeks]);

  // label the first column whose top row falls within the first week of its month
  let lastLabeled = "";
  const labels = columns.map((col) => {
    const d = col[0].date;
    if (d.getDate() <= 7) {
      const m = MONTHS[d.getMonth()];
      if (m !== lastLabeled) {
        lastLabeled = m;
        return m;
      }
    }
    return "";
  });

  return (
    <div className="flex gap-[3px] overflow-hidden">
      {columns.map((col, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-[3px]">
          <span className="mb-0.5 h-3 text-[10px] font-medium leading-3 text-muted">
            {labels[i]}
          </span>
          {col.map((day) => (
            <span
              key={day.key}
              className={
                "aspect-square w-full max-w-[6px] rounded-full " +
                (day.future ? "bg-transparent" : day.active ? "bg-white" : "bg-faint")
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}
