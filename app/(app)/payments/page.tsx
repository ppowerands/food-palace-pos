import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/dates";
import { cents } from "@/lib/payments";
import { resolveRange } from "@/lib/date-range";
import { Pagination } from "@/components/pagination";
import { RangeFields } from "@/components/range-fields";
import { cn } from "@/lib/utils";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

type SP = { q?: string; method?: string; status?: string; preset?: string; from?: string; to?: string; page?: string };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("payments.view");
  const sp = await searchParams;
  const s = await getSettings();
  const q = sp.q?.trim() || undefined;
  const status = (["COMPLETED", "FAILED", "PENDING"] as const).find((x) => x === sp.status);
  const range = resolveRange(sp.preset, sp.from, sp.to, s.timezone);
  const page = Math.max(1, Number(sp.page) || 1);
  const sym = s.currencySymbol;

  const where: Prisma.PaymentWhereInput = {
    ...(q ? { OR: [
      { reference: { contains: q, mode: "insensitive" } },
      { order: { orderCode: { contains: q, mode: "insensitive" } } },
      { order: { customerName: { contains: q, mode: "insensitive" } } },
    ] } : {}),
    ...(sp.method ? { methodId: sp.method } : {}),
    ...(status ? { status } : {}),
    ...(range.from && range.to ? { paidAt: { gte: range.from, lte: range.to } } : {}),
  };

  const [total, payments, methods, received] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where, orderBy: { paidAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      include: { order: { select: { id: true, orderCode: true, customerName: true } }, processedBy: { select: { name: true } }, refunds: true },
    }),
    db.paymentMethod.findMany({ orderBy: { sortOrder: "asc" } }),
    db.payment.aggregate({ where: { ...where, status: "COMPLETED" }, _sum: { amount: true } }),
  ]);

  const label = (p: (typeof payments)[number]) => {
    if (p.status === "FAILED") return { text: "Failed", cls: "bg-chili-50 text-chili-600" };
    if (p.status === "PENDING") return { text: "Pending", cls: "bg-amber-50 text-amber-800" };
    const refunded = p.refunds.reduce((sum, r) => sum + cents(r.amount), 0);
    if (p.refunds.some((r) => r.type === "VOID")) return { text: "Voided", cls: "bg-paper-200 text-ink-800" };
    if (refunded >= cents(p.amount)) return { text: "Refunded", cls: "bg-paper-200 text-ink-800" };
    if (refunded > 0) return { text: "Part refunded", cls: "bg-orange-50 text-orange-800" };
    return { text: "Received", cls: "bg-leaf-50 text-leaf-700" };
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Payments</h2>
          <p className="text-sm text-ink-600">{total} record{total === 1 ? "" : "s"}. Payments are never edited or deleted. Mistakes are refunded or voided.</p>
        </div>
        <div className="panel px-4 py-2 text-right">
          <p className="font-display text-xl font-semibold">{formatMoney(received._sum.amount ?? 0, sym)}</p>
          <p className="text-xs text-ink-600">Received in this view (before refunds)</p>
        </div>
      </div>

      <form className="panel grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
        <input name="q" defaultValue={q} placeholder="Order number, customer or reference" className="input sm:col-span-2" aria-label="Search payments" />
        <select name="method" defaultValue={sp.method ?? ""} className="input" aria-label="Payment method">
          <option value="">Any method</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="input" aria-label="Payment status">
          <option value="">Any status</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="PENDING">Pending</option>
        </select>
        <RangeFields preset={range.preset} from={range.fromStr} to={range.toStr} />
        <button className="btn btn-primary">Apply filters</button>
        <Link href="/payments" className="btn btn-secondary">Clear</Link>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-paper-300 text-xs uppercase text-ink-600">
            <tr>
              <th className="p-3">Payment</th><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3 text-right">Amount</th>
              <th className="p-3">Method</th><th className="p-3">Status</th><th className="p-3">Reference</th><th className="p-3">Processed by</th><th className="p-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {payments.length === 0 && <tr><td colSpan={9} className="p-6 text-ink-600">No payments match.</td></tr>}
            {payments.map((p) => {
              const l = label(p);
              return (
                <tr key={p.id} className="hover:bg-paper-50">
                  <td className="p-3 font-mono text-xs">P-{p.id.slice(-8).toUpperCase()}</td>
                  <td className="p-3"><Link href={`/orders/${p.order.id}`} className="font-semibold text-palm-700 hover:underline">{p.order.orderCode}</Link></td>
                  <td className="p-3">{p.order.customerName}</td>
                  <td className="p-3 text-right font-medium">{formatMoney(p.amount, sym)}</td>
                  <td className="p-3">{p.methodName}</td>
                  <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", l.cls)}>{l.text}</span></td>
                  <td className="p-3">{p.reference ?? "—"}</td>
                  <td className="p-3">{p.processedBy.name}</td>
                  <td className="p-3 whitespace-nowrap">{formatInZone(p.paidAt, s.timezone, "d MMM, h:mm a")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page} pages={Math.ceil(total / PAGE_SIZE)} basePath="/payments"
        params={{ q, method: sp.method, status, preset: range.preset === "all" ? undefined : range.preset, from: sp.from, to: sp.to }}
      />
    </div>
  );
}
