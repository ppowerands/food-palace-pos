import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getCustomerStats } from "@/lib/customer-stats";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/dates";
import { updateCustomer } from "@/lib/actions/customers";
import { ActionForm } from "@/components/action-form";
import { CustomerFields } from "@/components/customer-fields";
import { humanize } from "@/lib/utils";

export const metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("customers.view");
  const canManage = user.permissions.includes("customers.manage");
  const { id } = await params;
  const settings = await getSettings();
  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  const [stats, orders] = await Promise.all([
    getCustomerStats([id]),
    db.order.findMany({
      where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, orderCode: true, type: true, status: true, paymentStatus: true, total: true, createdAt: true, _count: { select: { items: true } } },
    }),
  ]);
  const s = stats.get(id)!;
  const sym = settings.currencySymbol;
  const cards = [
    { label: "Orders", value: String(s.orders) },
    { label: "Total spent", value: formatMoney(s.spent, sym) },
    { label: "Average order", value: s.validOrders ? formatMoney(s.average, sym) : "—" },
    { label: "First order", value: s.first ? formatInZone(s.first, settings.timezone, "d MMM yyyy") : "—" },
    { label: "Last order", value: s.last ? formatInZone(s.last, settings.timezone, "d MMM yyyy") : "—" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/customers" className="text-sm text-palm-700">← Customers</Link>
      <div>
        <h2 className="font-display text-2xl font-semibold">{customer.name}</h2>
        <p className="text-sm text-ink-600">{[customer.phone, customer.address].filter(Boolean).join(" · ") || "No contact details yet"}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="panel p-3">
            <p className="font-display text-lg font-semibold">{c.value}</p>
            <p className="text-xs text-ink-600">{c.label}</p>
          </div>
        ))}
      </div>

      <section className="panel overflow-x-auto">
        <h3 className="p-4 text-lg font-semibold">Order history</h3>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-y border-paper-300 text-xs uppercase text-ink-600">
            <tr><th className="p-3">Order</th><th className="p-3">When</th><th className="p-3">Type</th><th className="p-3">Items</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {orders.length === 0 && <tr><td colSpan={6} className="p-6 text-ink-600">No orders yet.</td></tr>}
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="p-3 font-medium"><Link href={`/orders/${o.id}`} className="text-palm-700 hover:underline">{o.orderCode}</Link></td>
                <td className="p-3">{formatInZone(o.createdAt, settings.timezone)}</td>
                <td className="p-3">{humanize(o.type)}</td>
                <td className="p-3">{o._count.items}</td>
                <td className="p-3">{humanize(o.status)} · {humanize(o.paymentStatus)}</td>
                <td className="p-3 text-right">{formatMoney(o.total, sym)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 50 && <p className="p-3 text-xs text-ink-600">Showing the latest 50 orders. Search Orders for the full history.</p>}
      </section>

      {canManage && (
        <section className="panel p-4 sm:p-6">
          <h3 className="text-lg font-semibold">Edit details</h3>
          <p className="text-sm text-ink-600">Changing details here never changes past orders. They keep the name, phone and address they were placed with.</p>
          <ActionForm action={updateCustomer} submitLabel="Save customer" className="mt-3">
            <CustomerFields customer={customer} />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
