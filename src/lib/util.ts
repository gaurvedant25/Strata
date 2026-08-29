export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

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
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
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
