import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { daysBetween, resolveRangeRequired, shortDay } from "@/lib/date-range";
import { getItemsSold, type SoldRow } from "@/lib/analytics";
import { RangeTabs } from "@/components/range-tabs";
import { cn } from "@/lib/utils";

export const metadata = { title: "Items sold" };
export const dynamic = "force-dynamic";
const MAX_DAYS = 62;

type SP = { preset?: string; from?: string; to?: string; basis?: string };

export default async function ItemsSoldPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("sales.view");
  const sp = await searchParams;
  const s = await getSettings();
  const basis = sp.basis === "completed" ? "completed" : "placed";
  const range = resolveRangeRequired(sp.preset, sp.from, sp.to, s.timezone);
  const allDays = daysBetween(range.fromStr, range.toStr);
  const tooLong = allDays.length > MAX_DAYS;
  const days = allDays.slice(-MAX_DAYS); // keep the most recent days if the range is very long
  const from = tooLong ? new Date(range.to.getTime() - MAX_DAYS * 86_400_000) : range.from;

  const { products, addons } = await getItemsSold(from, range.to, s.timezone, basis);
  const totalItems = products.reduce((a, p) => a + p.total, 0);
  const totalAddons = addons.reduce((a, p) => a + p.total, 0);
  const best = products[0];
  const extra = { basis: basis === "placed" ? undefined : basis };
  const sym = s.currencySymbol;

  const Matrix = ({ rows, unit }: { rows: SoldRow[]; unit: string }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-paper-300 text-xs uppercase text-ink-600">
          <tr>
            <th className="sticky left-0 z-10 min-w-[11rem] bg-white p-3">{unit}</th>
            {days.map((d) => <th key={d} className="whitespace-nowrap p-3 text-right">{shortDay(d)}</th>)}
            <th className="p-3 text-right">Total</th>
            <th className="p-3 text-right">{unit === "Product" ? "Sales" : "Extra income"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-200">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="sticky left-0 z-10 bg-white p-3">
                <p className="font-medium">{r.name}</p>
                {r.sizes.length > 0 && <p className="text-xs text-ink-600">{r.sizes.sort((a, b) => b.qty - a.qty).map((z) => `${z.name} ${z.qty}`).join(" · ")}</p>}
              </td>
              {days.map((d) => (
                <td key={d} className={cn("p-3 text-right", r.perDay[d] ? "font-semibold" : "text-ink-600/40")}>{r.perDay[d] ?? "·"}</td>
              ))}
              <td className="p-3 text-right font-display text-lg font-semibold">{r.total}</td>
              <td className="p-3 text-right">{formatMoney(r.revenue, sym)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="space-y-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Items sold</h2>
          <p className="text-sm text-ink-600">How many of each product, and each add-on such as beef, were sold on each day.</p>
        </div>
        <RangeTabs basePath="/items" current={range.preset} from={range.fromStr} to={range.toStr} extra={extra} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-600">Count:</span>
          {([["placed", "Every order placed"], ["completed", "Completed orders only"]] as const).map(([b, label]) => (
            <Link
              key={b}
              href={`/items?${new URLSearchParams({ preset: range.preset, ...(range.preset === "custom" ? { from: range.fromStr, to: range.toStr } : {}), ...(b === "completed" ? { basis: b } : {}) }).toString()}`}
              className={cn("rounded-lg px-3 py-1.5 font-medium", basis === b ? "bg-palm-900 text-paper-100" : "bg-white ring-1 ring-paper-300 hover:bg-paper-100")}
            >
              {label}
            </Link>
          ))}
          <span className="text-xs text-ink-600">Cancelled orders are never counted.</span>
        </div>
        {tooLong && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">That range is longer than {MAX_DAYS} days, so only the most recent {MAX_DAYS} days are shown.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Items sold", value: String(totalItems) },
          { label: "Add-ons sold", value: String(totalAddons) },
          { label: "Different products", value: String(products.length) },
          { label: "Best seller", value: best ? `${best.name} (${best.total})` : "—" },
        ].map((c) => (
          <div key={c.label} className="panel p-4">
            <p className="text-sm text-ink-600">{c.label}</p>
            <p className="font-display text-xl font-semibold sm:text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <section className="panel">
        <h3 className="p-4 pb-2 text-lg font-semibold">Products</h3>
        {products.length === 0 ? <p className="p-4 pt-0 text-sm text-ink-600">Nothing sold in this period yet.</p> : <Matrix rows={products} unit="Product" />}
      </section>

      <section className="panel">
        <h3 className="px-4 pt-4 text-lg font-semibold">Add-ons (beef, chicken, egg…)</h3>
        <p className="px-4 pb-2 text-xs text-ink-600">Each add-on is counted on its own, across every dish it was added to.</p>
        {addons.length === 0 ? <p className="p-4 pt-0 text-sm text-ink-600">No add-ons sold in this period.</p> : <Matrix rows={addons} unit="Add-on" />}
      </section>
    </div>
  );
}
