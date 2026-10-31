import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { daysBetween, hourLabel, resolveRangeRequired, shortDay } from "@/lib/date-range";
import { getPaymentBreakdown, getSalesSummary, getSeries } from "@/lib/analytics";
import { BarChart } from "@/components/bar-chart";
import { RangeTabs } from "@/components/range-tabs";

export const metadata = { title: "Sales" };
export const dynamic = "force-dynamic";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ preset?: string; from?: string; to?: string }> }) {
  await requirePermission("sales.view");
  const sp = await searchParams;
  const s = await getSettings();
  const sym = s.currencySymbol;
  const m = (n: number) => formatMoney(n, sym);
  const range = resolveRangeRequired(sp.preset, sp.from, sp.to, s.timezone);
  const singleDay = range.fromStr === range.toStr;

  const [summary, series, payments, methods] = await Promise.all([
    getSalesSummary(range.from, range.to),
    getSeries(range.from, range.to, s.timezone, singleDay ? "hour" : "day", "valid"),
    getPaymentBreakdown(range.from, range.to),
    db.paymentMethod.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const byKey = new Map(series.map((r) => [r.key, r]));
  const buckets = singleDay
    ? Array.from({ length: 24 }, (_, h) => ({ key: String(h).padStart(2, "0"), label: hourLabel(h) }))
    : daysBetween(range.fromStr, range.toStr).map((d) => ({ key: d, label: shortDay(d) }));
  const chart = buckets.map((b) => {
    const r = byKey.get(b.key);
    const net = r ? Math.round((r.total - r.refunded) * 100) / 100 : 0;
    return { label: b.label, value: net, title: `${b.label}: ${m(net)} from ${r?.orders ?? 0} order(s)` };
  });

  // Every method (cash, transfer, card, other, custom…) plus any old method that still has payments in this period.
  const names = [...new Set([...methods.map((x) => x.name), ...payments.keys()])];
  const cards = [
    { label: "Gross sales", value: m(summary.gross), sub: "Before discounts and refunds" },
    { label: "Discounts", value: m(summary.discounts), sub: "Taken off at checkout" },
    { label: "Refunds", value: m(summary.refunds), sub: "Given back on these orders" },
    { label: "Net sales", value: m(summary.net), sub: "Gross − discounts − refunds", strong: true },
    { label: "Orders", value: String(summary.orders), sub: "Counted sales" },
    { label: "Average order", value: m(summary.average), sub: "Net sales ÷ orders" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="space-y-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Sales</h2>
          <p className="text-sm text-ink-600">
            {singleDay ? shortDay(range.fromStr, true) : `${shortDay(range.fromStr, true)} – ${shortDay(range.toStr, true)}`}. A sale is an order that isn't cancelled and is completed or has a payment.
          </p>
        </div>
        <RangeTabs basePath="/sales" current={range.preset} from={range.fromStr} to={range.toStr} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className={`panel p-4 ${c.strong ? "border-palm-700 bg-palm-900 text-paper-100" : ""}`}>
            <p className={`text-sm ${c.strong ? "text-paper-100/70" : "text-ink-600"}`}>{c.label}</p>
            <p className="font-display text-2xl font-semibold sm:text-3xl">{c.value}</p>
            <p className={`text-xs ${c.strong ? "text-paper-100/60" : "text-ink-600"}`}>{c.sub}</p>
          </div>
        ))}
      </div>

      <section className="panel p-4">
        <h3 className="mb-1 text-lg font-semibold">Payments received</h3>
        <p className="mb-3 text-xs text-ink-600">By the day the money came in, after refunds and voids.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {names.map((n) => {
            const p = payments.get(n);
            return (
              <div key={n} className="rounded-lg bg-paper-100 p-3">
                <p className="text-sm text-ink-600">{n}</p>
                <p className="font-display text-xl font-semibold">{m(p?.net ?? 0)}</p>
                {p && p.refunded > 0 && <p className="text-xs text-ink-600">{m(p.received)} received − {m(p.refunded)} refunded</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel p-4">
        <h3 className="mb-2 text-lg font-semibold">{singleDay ? "Net sales by hour" : "Net sales by day"}</h3>
        <BarChart data={chart} format={m} ariaLabel="Net sales over time" color="bg-gold-500" />
      </section>

      {!singleDay && (
        <section className="panel overflow-x-auto">
          <h3 className="p-4 pb-2 text-lg font-semibold">Daily summary</h3>
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-y border-paper-300 text-xs uppercase text-ink-600">
              <tr><th className="p-3">Day</th><th className="p-3 text-right">Orders</th><th className="p-3 text-right">Gross</th><th className="p-3 text-right">Discounts</th><th className="p-3 text-right">Refunds</th><th className="p-3 text-right">Net</th></tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {buckets.map((b) => {
                const r = byKey.get(b.key);
                return (
                  <tr key={b.key} className={r ? "" : "text-ink-600/60"}>
                    <td className="p-3">{b.label}</td>
                    <td className="p-3 text-right">{r?.orders ?? 0}</td>
                    <td className="p-3 text-right">{m(r ? r.total + r.discounts : 0)}</td>
                    <td className="p-3 text-right">{m(r?.discounts ?? 0)}</td>
                    <td className="p-3 text-right">{m(r?.refunded ?? 0)}</td>
                    <td className="p-3 text-right font-medium">{m(r ? r.total - r.refunded : 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
