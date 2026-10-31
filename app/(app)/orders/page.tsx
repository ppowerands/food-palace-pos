import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { resolveRange } from "@/lib/date-range";
import {
  ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_STATUSES, PAYMENT_STATUS_LABEL, TYPE_LABEL, statusMatches,
  type OrderStatusKey, type PaymentStatusKey,
} from "@/lib/status";
import type { OrderTypeKey } from "@/lib/pricing";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { RangeFields } from "@/components/range-fields";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

type SP = { q?: string; status?: string; type?: string; payment?: string; preset?: string; from?: string; to?: string; sort?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("orders.view");
  const sp = await searchParams;
  const settings = await getSettings();
  const q = sp.q?.trim() || undefined;
  const status = ORDER_STATUSES.find((s) => s === sp.status);
  const payment = PAYMENT_STATUSES.find((s) => s === sp.payment);
  const type = (["PICKUP", "DELIVERY", "DINE_IN"] as const).find((t) => t === sp.type);
  const range = resolveRange(sp.preset, sp.from, sp.to, settings.timezone);
  const sort = ["oldest", "total_desc", "total_asc"].includes(sp.sort ?? "") ? sp.sort! : "newest";
  const page = Math.max(1, Number(sp.page) || 1);

  const phoneQ = q ? normalizePhone(q) ?? q.replace(/[\s\-]/g, "") : "";
  const where: Prisma.OrderWhereInput = {
    ...(q ? { OR: [
      { orderCode: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      ...(phoneQ ? [{ customerPhone: { contains: phoneQ } }] : []),
    ] } : {}),
    ...(status ? { status: { in: statusMatches(status) } } : {}),
    ...(payment ? { paymentStatus: payment } : {}),
    ...(type ? { type } : {}),
    ...(range.from && range.to ? { createdAt: { gte: range.from, lte: range.to } } : {}),
  };
  const orderBy: Prisma.OrderOrderByWithRelationInput =
    sort === "oldest" ? { createdAt: "asc" } : sort === "total_desc" ? { total: "desc" } : sort === "total_asc" ? { total: "asc" } : { createdAt: "desc" };

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, source: true, orderCode: true, customerName: true, type: true, status: true, paymentStatus: true, total: true, createdAt: true, _count: { select: { items: true } } },
    }),
  ]);
  const sym = settings.currencySymbol;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold">Orders</h2>
        <p className="text-sm text-ink-600">{total} order{total === 1 ? "" : "s"}. Orders are never deleted. Cancel or refund instead.</p>
      </div>

      <form className="panel grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
        <input name="q" defaultValue={q} placeholder="Order number, customer or phone" className="input sm:col-span-2" aria-label="Search orders" />
        <select name="status" defaultValue={status ?? ""} className="input" aria-label="Order status">
          <option value="">Any status</option>
          {ORDER_STATUSES.map((s: OrderStatusKey) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
        </select>
        <select name="payment" defaultValue={payment ?? ""} className="input" aria-label="Payment status">
          <option value="">Any payment</option>
          {PAYMENT_STATUSES.map((s: PaymentStatusKey) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
        </select>
        <select name="type" defaultValue={type ?? ""} className="input" aria-label="Order type">
          <option value="">Any type</option>
          {(["PICKUP", "DELIVERY", "DINE_IN"] as OrderTypeKey[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <RangeFields preset={range.preset} from={range.fromStr} to={range.toStr} />
        <select name="sort" defaultValue={sort} className="input" aria-label="Sort">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
          <option value="total_desc">Highest total</option><option value="total_asc">Lowest total</option>
        </select>
        <button className="btn btn-primary">Apply filters</button>
        <Link href="/orders" className="btn btn-secondary">Clear</Link>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-paper-300 text-xs uppercase text-ink-600">
            <tr>
              <th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Type</th><th className="p-3 text-right">Items</th>
              <th className="p-3 text-right">Total</th><th className="p-3">Payment</th><th className="p-3">Status</th><th className="p-3">Placed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {orders.length === 0 && <tr><td colSpan={8} className="p-6 text-ink-600">No orders match.</td></tr>}
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-paper-50">
                <td className="p-3"><Link href={`/orders/${o.id}`} className="font-semibold text-palm-700 hover:underline">{o.orderCode}</Link>{o.source === "WEBSITE" && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">Online</span>}</td>
                <td className="p-3">{o.customerName}</td>
                <td className="p-3">{TYPE_LABEL[o.type as OrderTypeKey]}</td>
                <td className="p-3 text-right">{o._count.items}</td>
                <td className="p-3 text-right font-medium">{formatMoney(o.total, sym)}</td>
                <td className="p-3"><PaymentStatusBadge status={o.paymentStatus as PaymentStatusKey} /></td>
                <td className="p-3"><OrderStatusBadge status={o.status as OrderStatusKey} /></td>
                <td className="p-3 whitespace-nowrap">{formatInZone(o.createdAt, settings.timezone, "d MMM, h:mm a")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page} pages={Math.ceil(total / PAGE_SIZE)} basePath="/orders"
        params={{ q, status, payment, type, preset: range.preset === "all" ? undefined : range.preset, from: sp.from, to: sp.to, sort: sort === "newest" ? undefined : sort }}
      />
    </div>
  );
}
