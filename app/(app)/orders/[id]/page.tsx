import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/dates";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { changeOrderStatus } from "@/lib/actions/order-flow";
import { ORDER_STATUS_LABEL, TYPE_LABEL } from "@/lib/status";

export default async function OrderDetailsPage({ params }: { params: { id: string } }) {
  const order = await db.order.findUnique({
    where: { id: params.id },
    include: {
      items: true,
      customer: true,
    },
  });

  if (!order) {
    notFound();
  }

  // Using the Naira symbol directly to avoid encoding issues
  const money = (n: number) => formatMoney(n, "₦");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between mb-4">
        <Link href="/orders" className="text-sm text-palm-700 hover:underline">
          ← Back to Orders
        </Link>
        <Link href={`/orders/${order.id}/receipt`} className="btn btn-primary" target="_blank">
          Print Receipt
        </Link>
      </div>

      <div className="mb-4 p-4 border border-paper-300 rounded-xl bg-white shadow-sm flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Order Status</h3>
          <p className="text-sm text-ink-600 flex items-center gap-2">
            Current: <OrderStatusBadge status={order.status} />
          </p>
        </div>
        <div className="relative group inline-block">
          <button className="btn btn-secondary flex items-center gap-2">
            Change Status
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div className="absolute right-0 mt-1 w-40 bg-white border border-paper-300 rounded-lg shadow-lg hidden group-hover:block z-50">
            <form action={async (formData: FormData) => {
              "use server";
              const newStatus = formData.get("status") as string;
              const fd = new FormData();
              fd.set("id", order.id);
              fd.set("from", order.status);
              fd.set("to", newStatus);
              await changeOrderStatus(undefined, fd);
            }} className="flex flex-col p-1">
              {["PENDING", "ACCEPTED", "READY", "COMPLETED", "CANCELLED"].map((st) => (
                <button 
                  key={st}
                  name="status" 
                  value={st} 
                  disabled={order.status === st}
                  className="text-left px-3 py-2 text-sm hover:bg-paper-100 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                >
                  {ORDER_STATUS_LABEL[st as keyof typeof ORDER_STATUS_LABEL] ?? st}
                </button>
              ))}
            </form>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold">{order.orderCode}</h1>
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4">
          <div className="rounded-xl border border-paper-300 bg-white p-4">
            <h2 className="mb-3 font-semibold">Items</h2>
            <ul className="space-y-2">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between text-sm">
                  <span>
                    {item.quantity}× {item.productName} {item.variantName ? `(${item.variantName})` : ""}
                  </span>
                  {/* Fixed the price math and removed the encoding issues */}
                  <span>{money(Number(item.unitPrice) * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-paper-200 pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-600">Subtotal</span>
                <span>{money(Number(order.subtotal) / 100)}</span>
              </div>
              {Number(order.deliveryFee) > 0 && (
                <div className="flex justify-between">
                  <span className="text-ink-600">Delivery</span>
                  <span>{money(Number(order.deliveryFee) / 100)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base pt-2">
                <span>Total</span>
                <span>{money(Number(order.total) / 100)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-paper-300 bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold">Details</h2>
            <div className="space-y-2">
              <p>
                <span className="text-ink-600">Type:</span> {TYPE_LABEL[order.orderType as keyof typeof TYPE_LABEL] ?? order.orderType}
              </p>
              <p>
                <span className="text-ink-600">Customer:</span> {order.customerName || "Walk-in"}
              </p>
              {order.customerPhone && (
                <p>
                  <span className="text-ink-600">Phone:</span> {order.customerPhone}
                </p>
              )}
              <p>
                <span className="text-ink-600">Time:</span> {formatInZone(order.createdAt, "Africa/Lagos", "MMM d, h:mm a")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}