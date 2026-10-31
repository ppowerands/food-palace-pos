import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getCustomerStats } from "@/lib/customer-stats";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { Pagination } from "@/components/pagination";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

export default async function CustomersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const user = await requirePermission("customers.view");
  const canManage = user.permissions.includes("customers.manage");
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const sort = sp.sort === "name" ? "name" : "newest";
  const page = Math.max(1, Number(sp.page) || 1);
  const settings = await getSettings();

  // Search by name, phone number or order number (e.g. FP-000123)
  const phoneQ = q ? normalizePhone(q) ?? q.replace(/[\s\-]/g, "") : "";
  const where: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: phoneQ } },
          { orders: { some: { orderCode: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : {};

  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where, orderBy: sort === "name" ? { name: "asc" } : { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    }),
  ]);
  const stats = await getCustomerStats(customers.map((c) => c.id));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Customers</h2>
          <p className="text-sm text-ink-600">{total} customer{total === 1 ? "" : "s"}</p>
        </div>
        {canManage && <Link href="/customers/new" className="btn btn-primary">Add customer</Link>}
      </div>

      <form className="panel grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto]" role="search">
        <input name="q" defaultValue={q} placeholder="Search by name, phone or order number" className="input" aria-label="Search customers" />
        <select name="sort" defaultValue={sort} className="input" aria-label="Sort">
          <option value="newest">Newest first</option><option value="name">Name A–Z</option>
        </select>
        <button className="btn btn-secondary">Search</button>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-paper-300 text-xs uppercase text-ink-600">
            <tr>
              <th className="p-3">Customer</th><th className="p-3 text-right">Orders</th><th className="p-3 text-right">Spent</th>
              <th className="p-3 text-right">Average</th><th className="p-3">First order</th><th className="p-3">Last order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {customers.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-ink-600">{q ? "No customers match that search." : "No customers yet. They are added automatically when an order is placed with a phone number."}</td></tr>
            )}
            {customers.map((c) => {
              const s = stats.get(c.id)!;
              return (
                <tr key={c.id} className="hover:bg-paper-50">
                  <td className="p-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-palm-700 hover:underline">{c.name}</Link>
                    <p className="text-xs text-ink-600">{c.phone ?? "No phone"}</p>
                  </td>
                  <td className="p-3 text-right">{s.orders}</td>
                  <td className="p-3 text-right">{formatMoney(s.spent, settings.currencySymbol)}</td>
                  <td className="p-3 text-right">{s.validOrders ? formatMoney(s.average, settings.currencySymbol) : "—"}</td>
                  <td className="p-3">{s.first ? formatInZone(s.first, settings.timezone, "d MMM yyyy") : "—"}</td>
                  <td className="p-3">{s.last ? formatInZone(s.last, settings.timezone, "d MMM yyyy") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={Math.ceil(total / PAGE_SIZE)} basePath="/customers" params={{ q, sort: sort === "newest" ? undefined : sort }} />
    </div>
  );
}
