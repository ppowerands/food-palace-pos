import { RANGE_PRESETS } from "@/lib/date-range";

// Plain form controls for a GET filter form: pick a preset, or "Custom range" and fill both dates.
export function RangeFields({ preset, from, to }: { preset: string; from: string; to: string }) {
  return (
    <>
      <select name="preset" defaultValue={preset} className="input" aria-label="Date range">
        <option value="all">All time</option>
        {RANGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <input type="date" name="from" defaultValue={from} className="input" aria-label="From date (custom range)" />
      <input type="date" name="to" defaultValue={to} className="input" aria-label="To date (custom range)" />
    </>
  );
}
