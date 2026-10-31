import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { cents } from "@/lib/payments";
import { balanceDueC } from "@/lib/payment-status";
import { resolveRange } from "@/lib/date-range";
import type { OrderTypeKey } from "@/lib/pricing";
import type { OrderStatusKey, PaymentStatusKey } from "@/lib/status";
import { LiveBoard, type BoardOrder } from "@/components/live-board";
import Link from "next/link";

export const metadata = { title: "Live orders" };
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const user = await requirePermission("orders.view");
  const s = await getSettings();
  const startOfToday = resolveRange("today", undefined, undefined, s.timezone).from!;
  const include = { items: { select: { productName: true, variantName: true, quantity: true }, orderBy: { id: "asc" as const } } };

  // Open orders always show. Completed and cancelled show for today only.
  const orders = await db.order.findMany({
    where: {
      OR: [
        { status: { in: ["PENDING", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] } },
        { status: "COMPLETED", completedAt: { gte: startOfToday } },
        { status: "CANCELLED", cancelledAt: { gte: startOfToday } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 300,
    include,
  });

  const board: BoardOrder[] = orders.map((o) => ({
    id: o.id, code: o.orderCode, name: o.customerName, phone: o.customerPhone, type: o.type as OrderTypeKey,
    address: o.deliveryAddress, table: o.tableNumber, note: o.note, status: o.status as OrderStatusKey,
    payment: o.paymentStatus as PaymentStatusKey, total: Number(o.total.toString()), paid: Number(o.amountPaid.toString()),
    balance: o.status === "CANCELLED" ? 0 : balanceDueC(cents(o.total), cents(o.amountPaid)) / 100,
    source: o.source, createdAt: o.createdAt.toISOString(),
    items: o.items.map((i) => ({ name: `${i.productName}${i.variantName ? ` (${i.variantName})` : ""}`, qty: i.quantity })),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">Live orders</h2>
          <p className="text-sm text-ink-600">Pending → Accepted → Ready → Completed. Completed and cancelled show today only.</p>
        </div>
        <Link href="/orders" className="btn btn-secondary">All orders</Link>
      </div>
      <LiveBoard
        orders={board}
        canManage={user.permissions.includes("orders.manage")}
        canCancel={user.permissions.includes("orders.cancel")}
        canRefund={user.permissions.includes("payments.refund")}
        symbol={s.currencySymbol}
        timezone={s.timezone}
      />
    </div>
  );
}
