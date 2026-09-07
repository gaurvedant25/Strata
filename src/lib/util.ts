export const uid = () =>
  crypto.randomUUID?.() ??
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export function todayKey(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(key: string) {
  const d = parseKey(key);
  const today = todayKey();
  if (key === today) return "Today";
  const yest = todayKey(new Date(Date.now() - 864e5));
  if (key === yest) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function mmss(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Trim trailing zeros: 22.50 -> 22.5, 20.0 -> 20 */
export function num(n: number, digits = 2) {
  if (!isFinite(n)) return "0";
  return String(Number(n.toFixed(digits)));
}

export function cls(...v: (string | false | null | undefined)[]) {
  return v.filter(Boolean).join(" ");
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "Fridays" style plural label for the weekday most sessions of a routine land on. */
export function mostCommonWeekdayLabel(dates: string[]) {
  if (!dates.length) return null;
  const counts = new Array(7).fill(0);
  for (const key of dates) counts[parseKey(key).getDay()]++;
  const top = counts.indexOf(Math.max(...counts));
  return WEEKDAYS[top] + "s";
}

export function fmtRelative(ts: number, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  const min = Math.round(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return parseKey(todayKey(new Date(ts))).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
