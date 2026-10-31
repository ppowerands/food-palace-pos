import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/dates";
import { effectiveStatus, ORDER_STATUS_LABEL, TYPE_LABEL, type OrderStatusKey, type PaymentStatusKey } from "@/lib/status";
import type { OrderTypeKey } from "@/lib/pricing";
import { TrackLive } from "@/components/track-live";
import { cn } from "@/lib/utils";

export const metadata = { title: "Your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAYMENT_TEXT: Record<PaymentStatusKey, string> = {
  UNPAID: "Not paid yet. Payment will be handled by the restaurant.",
  PARTIALLY_PAID: "Part paid. The balance will be handled by the restaurant.",
  PAID: "Paid. Thank you!",
  REFUNDED: "Refunded by the restaurant.",
  PARTIALLY_REFUNDED: "Partly refunded by the restaurant.",
};

export default async function TrackPage({
  params, searchParams,
}: { params: Promise<{ token: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { token } = await params;
  const { placed } = await searchParams;
  if (!UUID.test(token)) notFound();

  const [s, order] = await Promise.all([
    getSettings(),
    db.order.findUnique({
      where: { trackingToken: token },
      include: { items: { include: { addons: true }, orderBy: { id: "asc" } } },
    }),
  ]);
  if (!order) notFound();

  const m = (v: { toString(): string }) => formatMoney(v, s.currencySymbol);
  const status = effectiveStatus(order.status as OrderStatusKey);
  const cancelled = status === "CANCELLED";
  const steps: OrderStatusKey[] = cancelled ? ["PENDING", "CANCELLED"] : ["PENDING", "ACCEPTED", "READY", "COMPLETED"];
  const current = steps.indexOf(status);
  const pay = order.paymentStatus as PaymentStatusKey;

  return (
    <div className="min-h-screen bg-paper-50">
      <header className="bg-palm-900 text-paper-100">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-4">
          <p className="font-display text-xl font-semibold">{s.name}</p>
          <Link href="/order" className="text-sm font-medium text-gold-300">Order more</Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {placed === "1" && (
          <div className="rounded-xl bg-leaf-50 p-4 text-leaf-700 ring-1 ring-leaf-500/30">
            <p className="font-semibold">Order placed! The restaurant has received it.</p>
            <p className="text-sm">Keep this page. It shows your order status as the restaurant works on it.</p>
          </div>
        )}

        <section className="panel p-5 text-center">
          <p className="text-sm text-ink-600">Order number</p>
          <p className="font-display text-4xl font-semibold">{order.orderCode}</p>
          <p className="mt-1 text-sm text-ink-600">{TYPE_LABEL[order.type as OrderTypeKey]} · placed {formatInZone(order.createdAt, s.timezone, "d MMM, h:mm a")}</p>
        </section>

        <section className="panel p-5">
          <h2 className="mb-4 text-lg font-semibold">Order status</h2>
          <ol className="flex items-start">
            {steps.map((st, i) => {
              const done = i <= current;
              const bad = st === "CANCELLED";
              return (
                <li key={st} className="flex flex-1 flex-col items-center text-center">
                  <div className="flex w-full items-center">
                    <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : done ? (bad ? "bg-chili-500" : "bg-palm-700") : "bg-paper-300")} />
                    <span className={cn("grid h-9 w-9 place-items-center rounded-full text-white", done ? (bad ? "bg-chili-500" : "bg-palm-700") : "bg-paper-300")}>
                      {bad ? <X className="h-5 w-5" /> : done ? <Check className="h-5 w-5" /> : <span className="text-xs">{i + 1}</span>}
                    </span>
                    <span className={cn("h-0.5 flex-1", i === steps.length - 1 ? "bg-transparent" : i < current ? "bg-palm-700" : "bg-paper-300")} />
                  </div>
                  <span className={cn("mt-1 text-xs", i === current ? "font-bold" : "text-ink-600")}>{ORDER_STATUS_LABEL[st]}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-center text-sm">
            {status === "PENDING" && "Waiting for the restaurant to accept your order."}
            {status === "ACCEPTED" && "The restaurant has accepted your order and is working on it."}
            {status === "READY" && (order.type === "DELIVERY" ? "Your order is ready and on its way to being delivered." : order.type === "DINE_IN" ? "Your order is ready." : "Your order is ready for pickup.")}
            {status === "COMPLETED" && "Your order is complete. Enjoy!"}
            {status === "CANCELLED" && `Your order was cancelled.${order.cancellationReason ? ` Reason: ${order.cancellationReason}` : ""}${s.phone ? ` Questions? Call ${s.phone}.` : ""}`}
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="mb-1 text-lg font-semibold">Payment</h2>
          <p className="text-sm">{PAYMENT_TEXT[pay]}</p>
          {pay === "PARTIALLY_PAID" && <p className="text-sm text-ink-600">Paid so far: {m(order.amountPaid)} of {m(order.total)}</p>}
        </section>

        <section className="panel p-5">
          <h2 className="mb-2 text-lg font-semibold">Your order</h2>
          <ul className="divide-y divide-paper-200 text-sm">
            {order.items.map((it) => (
              <li key={it.id} className="flex justify-between gap-3 py-2">
                <span>
                  {it.quantity} × {it.productName}{it.variantName ? ` (${it.variantName})` : ""}
                  {it.addons.length > 0 && <span className="block text-xs text-ink-600">+ {it.addons.map((a) => a.name).join(", ")}</span>}
                </span>
                <span className="font-medium">{m(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-paper-300 pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-600">Subtotal</dt><dd>{m(order.subtotal)}</dd></div>
            {Number(order.serviceChargeAmount) > 0 && <div className="flex justify-between"><dt className="text-ink-600">Service charge</dt><dd>{m(order.serviceChargeAmount)}</dd></div>}
            {Number(order.taxAmount) > 0 && <div className="flex justify-between"><dt className="text-ink-600">Tax</dt><dd>{m(order.taxAmount)}</dd></div>}
            {Number(order.deliveryFee) > 0 && <div className="flex justify-between"><dt className="text-ink-600">Delivery fee</dt><dd>{m(order.deliveryFee)}</dd></div>}
            <div className="flex justify-between font-display text-xl font-semibold"><dt>Total</dt><dd>{m(order.total)}</dd></div>
          </dl>
          <div className="mt-3 text-sm text-ink-600">
            <p>{order.customerName}{order.customerPhone ? ` · ${order.customerPhone}` : ""}</p>
            {order.deliveryAddress && <p>{order.deliveryAddress}</p>}
            {order.tableNumber && <p>Table {order.tableNumber}</p>}
          </div>
        </section>

        <TrackLive token={token} />
      </main>
    </div>
  );
}
