import Link from "next/link";
import { RANGE_PRESETS } from "@/lib/date-range";
import { cn } from "@/lib/utils";

// Preset links (today, yesterday, …) plus a custom from/to form. Extra params (e.g. basis) are carried along.
export function RangeTabs({
  basePath, current, from, to, extra = {},
}: { basePath: string; current: string; from: string; to: string; extra?: Record<string, string | undefined> }) {
  const qs = (preset: string) => {
    const sp = new URLSearchParams({ preset });
    for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <nav className="-mx-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:px-0" aria-label="Date range">
        {RANGE_PRESETS.filter((p) => p.id !== "custom").map((p) => (
          <Link key={p.id} href={qs(p.id)} className={cn("min-h-[40px] whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", current === p.id ? "bg-palm-900 text-paper-100" : "bg-white ring-1 ring-paper-300 hover:bg-paper-100")}>
            {p.label}
          </Link>
        ))}
      </nav>
      <form action={basePath} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="preset" value="custom" />
        {Object.entries(extra).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <label className="text-xs text-ink-600">From<input type="date" name="from" defaultValue={from} required className="input mt-0.5 !py-2" /></label>
        <label className="text-xs text-ink-600">To<input type="date" name="to" defaultValue={to} required className="input mt-0.5 !py-2" /></label>
        <button className={cn("btn", current === "custom" ? "btn-primary" : "btn-secondary")}>Custom range</button>
      </form>
    </div>
  );
}
