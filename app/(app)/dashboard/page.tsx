import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/dates";
import { daysBetween, hourLabel, resolveRangeRequired, shortDay } from "@/lib/date-range";
import { getActivity, getSalesSummary, getSeries, getStatusCounts } from "@/lib/analytics";
import { ORDER_STATUSES, statusMatches, TYPE_LABEL, type OrderStatusKey, type PaymentStatusKey } from "@/lib/status";
import type { OrderTypeKey } from "@/lib/pricing";
import { BarChart } from "@/components/bar-chart";
import { RangeTabs } from "@/components/range-tabs";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const KIND_STYLE = { new: "bg-sky-50 text-sky-800", repeat: "bg-violet-50 text-violet-800", payment: "bg-leaf-50 text-leaf-700", cancel: "bg-chili-50 text-chili-600" } as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ preset?: string; from?: string; to?: string }> }) {
  const user = await requirePermission("dashboard.view");
  const sp = await searchParams;
  const s = await getSettings();
  const sym = s.currencySymbol;
  const range = resolveRangeRequired(sp.preset, sp.from, sp.to, s.timezone);
  const can = (k: Parameters<typeof user.permissions.includes>[0]) => user.permissions.includes(k);
  const singleDay = range.fromStr === range.toStr;

  const [summary, statusCounts, series, customers, newCustomers, products, activity, recent] = await Promise.all([
    can("sales.view") ? getSalesSummary(range.from, range.to) : null,
    getStatusCounts(range.from, range.to),
    can("orders.view") ? getSeries(range.from, range.to, s.timezone, singleDay ? "hour" : "day", "placed") : null,
    can("customers.view") ? db.customer.count() : null,
    can("customers.view") ? db.customer.count({ where: { createdAt: { gte: range.from, lte: range.to } } }) : null,
    db.product.count({ where: { isActive: true } }),
    can("orders.view") ? getActivity(sym) : [],
    can("orders.view")
      ? db.order.findMany({
          orderBy: { createdAt: "desc" }, take: 8,
          select: { id: true, orderCode: true, customerName: true, type: true, total: true, paymentStatus: true, status: true, createdAt: true },
        })
      : [],
  ]);

  const ordersInRange = [...statusCounts.values()].reduce((a, b) => a + b, 0);
  const byKey = new Map((series ?? []).map((r) => [r.key, r.orders]));
  const buckets = singleDay
    ? Array.from({ length: 24 }, (_, h) => ({ key: String(h).padStart(2, "0"), label: hourLabel(h) }))
    : daysBetween(range.fromStr, range.toStr).map((d) => ({ key: d, label: shortDay(d) }));
  const chart = buckets.map((b) => ({ label: b.label, value: byKey.get(b.key) ?? 0, title: `${b.label}: ${byKey.get(b.key) ?? 0} order(s)` }));

  const cards = [
    ...(summary ? [{ label: "Sales", value: formatMoney(summary.net, sym), sub: `Gross ${formatMoney(summary.gross, sym)} · refunds ${formatMoney(summary.refunds, sym)}` }] : []),
    ...(series ? [{ label: "Orders", value: String(ordersInRange), sub: `${statusCounts.get("CANCELLED") ?? 0} cancelled` }] : []),
    ...(customers !== null ? [{ label: "Customers", value: String(customers), sub: `${newCustomers} new in this period` }] : []),
    { label: "Active products", value: String(products), sub: "currently on sale" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="space-y-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Dashboard</h2>
          <p className="text-sm text-ink-600">
            {singleDay ? shortDay(range.fromStr, true) : `${shortDay(range.fromStr, true)} – ${shortDay(range.toStr, true)}`}. Every number is calculated from your records.
          </p>
        </div>
        <RangeTabs basePath="/dashboard" current={range.preset} from={range.fromStr} to={range.toStr} />
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="panel p-4">
            <p className="text-sm text-ink-600">{c.label}</p>
            <p className="font-display text-2xl font-semibold sm:text-3xl">{c.value}</p>
            <p className="text-xs text-ink-600">{c.sub}</p>
          </div>
        ))}
      </div>

      {series && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <section className="panel p-4">
            <h3 className="mb-2 text-lg font-semibold">Order summary</h3>
            <BarChart data={chart} format={(n) => `${n} order${n === 1 ? "" : "s"}`} ariaLabel="Orders over time" />
          </section>
          <section className="panel p-4">
            <h3 className="mb-2 text-lg font-semibold">Order status</h3>
            <ul className="space-y-2">
              {ORDER_STATUSES.map((st: OrderStatusKey) => (
                <li key={st} className="flex items-center justify-between">
                  <OrderStatusBadge status={st} />
                  <span className="font-display text-lg font-semibold">{statusMatches(st).reduce((n, x) => n + (statusCounts.get(x) ?? 0), 0)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {can("orders.view") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel p-4">
            <h3 className="mb-1 text-lg font-semibold">Customer activity</h3>
            <p className="mb-2 text-xs text-ink-600">Last 24 hours</p>
            {activity.length === 0 ? (
              <p className="rounded-lg bg-paper-100 p-4 text-sm text-ink-600">No activity in the last 24 hours.</p>
            ) : (
              <ul className="divide-y divide-paper-200">
                {activity.map((e) => (
                  <li key={e.id} className="py-2">
                    <Link href={e.href} className="block text-sm hover:underline">{e.text}</Link>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-600">
                      {e.tag && <span className={cn("rounded px-1.5 py-0.5 font-semibold", KIND_STYLE[e.kind])}>{e.tag}</span>}
                      {formatDistanceToNowStrict(e.at, { addSuffix: true })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel overflow-x-auto p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Recent orders</h3>
              <Link href="/orders" className="text-sm font-medium text-palm-700">View all</Link>
            </div>
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs uppercase text-ink-600">
                <tr><th className="py-1 pr-2">Order</th><th className="pr-2">Customer</th><th className="pr-2 text-right">Total</th><th className="pr-2">Payment</th><th className="pr-2">Status</th><th>Time</th></tr>
              </thead>
              <tbody className="divide-y divide-paper-200">
                {recent.length === 0 && <tr><td colSpan={6} className="py-4 text-ink-600">No orders yet. Orders appear here as soon as you take one at the POS.</td></tr>}
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2 pr-2"><Link href={`/orders/${o.id}`} className="font-semibold text-palm-700 hover:underline">{o.orderCode}</Link><p className="text-xs text-ink-600">{TYPE_LABEL[o.type as OrderTypeKey]}</p></td>
                    <td className="pr-2">{o.customerName}</td>
                    <td className="pr-2 text-right font-medium">{formatMoney(o.total, sym)}</td>
                    <td className="pr-2"><PaymentStatusBadge status={o.paymentStatus as PaymentStatusKey} /></td>
                    <td className="pr-2"><OrderStatusBadge status={o.status as OrderStatusKey} /></td>
                    <td className="whitespace-nowrap text-xs">{formatInZone(o.createdAt, s.timezone, "d MMM, h:mm a")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
