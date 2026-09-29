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

/**
 * A date, written out for the reader's locale.
 *
 * `toLocaleDateString` with options builds a fresh `Intl.DateTimeFormat` on
 * every call, and building one is the expensive part — measured here, 150
 * calls took 13.5ms against 0.2ms for the same 150 through one kept formatter,
 * and a phone is several times slower than that. History alone formats two or
 * three dates a row. So each set of options gets one formatter, made the first
 * time it is asked for and reused after.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

export function localDate(d: Date | number, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) formatters.set(key, (f = new Intl.DateTimeFormat(undefined, options)));
  return f.format(d);
}

export function fmtDate(key: string) {
  const d = parseKey(key);
  const today = todayKey();
  if (key === today) return "Today";
  const yest = todayKey(new Date(Date.now() - 864e5));
  if (key === yest) return "Yesterday";
  return localDate(d, {
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

/**
 * A held set, as a clock: 45 -> "0:45", 90 -> "1:30", 3700 -> "1:01:40".
 *
 * Minutes are never padded and seconds always are, so the figure reads the way
 * a stopwatch does rather than as a decimal that happens to have a colon in it.
 */
export function fmtClock(seconds: number) {
  const t = Math.max(0, Math.round(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
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

/**
 * Whole local days from a YYYY-MM-DD key to today.
 *
 * Both ends are put through `parseKey`, so the arithmetic is between two local
 * midnights rather than between two instants: a personal best set last night
 * and one set this morning are one day apart and nought days apart
 * respectively, which is how a person counts them. Rounding absorbs the hour a
 * daylight-saving boundary adds or removes in between.
 */
export function daysSince(key: string, today: string = todayKey()) {
  const then = parseKey(key).getTime();
  const now = parseKey(today).getTime();
  return Math.max(0, Math.round((now - then) / 864e5));
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
  return localDate(parseKey(todayKey(new Date(ts))), {
    day: "numeric",
    month: "short",
  });
}
