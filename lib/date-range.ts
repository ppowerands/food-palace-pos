import { endOfDay, startOfDay, startOfMonth, subDays } from "date-fns";
import { TZDate } from "@date-fns/tz";

export const RANGE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom range" },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["id"];

export type ResolvedRange = { from: Date | null; to: Date | null; preset: RangePreset | "all"; fromStr: string; toStr: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Turns ?preset=…&from=…&to=… into UTC start/end instants, using the restaurant's own timezone for "today". */
export function resolveRange(
  preset: string | undefined, from: string | undefined, to: string | undefined, timeZone: string,
  fallback: RangePreset | "all" = "all",
): ResolvedRange {
  const wanted = (RANGE_PRESETS.some((p) => p.id === preset) || preset === "all" ? preset : undefined) as RangePreset | "all" | undefined;
  const chosen = wanted ?? fallback;
  const now = new TZDate(new Date(), timeZone);
  const plain = (d: Date) => new Date(d.getTime());
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const mk = (a: Date, b: Date): ResolvedRange => ({ from: plain(a), to: plain(b), preset: chosen, fromStr: ymd(a), toStr: ymd(b) });

  switch (chosen) {
    case "today": return mk(startOfDay(now), endOfDay(now));
    case "yesterday": { const y = subDays(now, 1); return mk(startOfDay(y), endOfDay(y)); }
    case "7d": return mk(startOfDay(subDays(now, 6)), endOfDay(now));
    case "30d": return mk(startOfDay(subDays(now, 29)), endOfDay(now));
    case "month": return mk(startOfMonth(now), endOfDay(now));
    case "custom": {
      if (from && DAY.test(from)) {
        const [fy, fm, fd] = from.split("-").map(Number);
        const [ty, tm, td] = (to && DAY.test(to) ? to : from).split("-").map(Number);
        const start = new TZDate(fy, fm - 1, fd, 0, 0, 0, 0, timeZone);
        const end = new TZDate(ty, tm - 1, td, 23, 59, 59, 999, timeZone);
        if (end >= start) return { from: plain(start), to: plain(end), preset: "custom", fromStr: from, toStr: to && DAY.test(to) ? to : from };
      }
      return { from: null, to: null, preset: "all", fromStr: "", toStr: "" };
    }
    default: return { from: null, to: null, preset: "all", fromStr: "", toStr: "" };
  }
}

/** Like resolveRange but never "all time": dashboards and sales always need a real period (defaults to today). */
export function resolveRangeRequired(
  preset: string | undefined, from: string | undefined, to: string | undefined, timeZone: string,
): ResolvedRange & { from: Date; to: Date } {
  const r = resolveRange(preset === "all" ? undefined : preset, from, to, timeZone, "today");
  if (r.from && r.to) return r as ResolvedRange & { from: Date; to: Date };
  return resolveRange("today", undefined, undefined, timeZone) as ResolvedRange & { from: Date; to: Date };
}

/** Every calendar day from fromStr to toStr inclusive ("YYYY-MM-DD"), no timezone maths needed. */
export function daysBetween(fromStr: string, toStr: string, cap = 366): string[] {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const out: string[] = [];
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  while (out.length < cap) {
    const key = cur.toISOString().slice(0, 10);
    if (key > toStr) break;
    out.push(key);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

export function shortDay(day: string, withYear = false) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}
