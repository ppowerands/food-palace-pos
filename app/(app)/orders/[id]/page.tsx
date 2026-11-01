import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/dates";
import { cents } from "@/lib/payments";
import { balanceDueC } from "@/lib/payment-status";
import type { OrderTypeKey } from "@/lib/pricing";
import {
  allowedTargets, isFinal, nextStatus, NEXT_ACTION_LABEL, ORDER_STATUS_LABEL, TYPE_LABEL,
  type OrderStatusKey, type PaymentStatusKey,
} from "@/lib/status";
import { cancelOrder, changeOrderStatus } from "@/lib/actions/order-flow";
import { createRefund } from "@/lib/actions/payments";
import { ActionForm } from "@/components/action-form";
import { CheckField, Field, SelectField, TextAreaField } from "@/components/fields";
import { PaymentForm } from "@/components/payment-form";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/status-badge";

export const metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function OrderPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ cancel?: string }> }) {
  const user = await requirePermission("orders.view");
  const { id } = await params;
  const { cancel } = await searchParams;
  const settings = await getSettings();
  const sym = settings.currencySymbol;
  const tz = settings.timezone;
  const money = (v: { toString(): string } | number) => formatMoney(v, sym);

  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: { include: { addons: true }, orderBy: { id: "asc" } },
      payments: { include: { processedBy: { select: { name: true } }, refunds: true }, orderBy: { paidAt: "asc" } },
      refunds: { include: { createdBy: { select: { name: true } }, payment: { select: { methodName: true } } }, orderBy: { createdAt: "asc" } },
      statusHistory: { include: { changedBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      createdBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
    },
  });
  if (!order) notFound();

  const type = order.type as OrderTypeKey;
  const status = order.status as OrderStatusKey;
  const totalC = cents(order.total);
  const paidC = cents(order.amountPaid);
  const balanceC = status === "CANCELLED" ? 0 : balanceDueC(totalC, paidC);
  const can = (k: Parameters<typeof user.permissions.includes>[0]) => user.permissions.includes(k);

  const next = nextStatus(type, status);
  const targets = allowedTargets(type, status).filter((t) => t !== next);
  const methods = can("payments.process") && balanceC > 0
    ? await db.paymentMethod.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: "asc" } })
    : [];

  const refundable = order.payments
    .filter((p) => p.status === "COMPLETED")
    .map((p) => ({ p, left: cents(p.amount) - p.refunds.reduce((s, r) => s + cents(r.amount), 0) }))
    .filter((x) => x.left > 0);

  const paymentLabel = (p: (typeof order.payments)[number]) => {
    if (p.status === "FAILED") return "Failed";
    if (p.status === "PENDING") return "Pending";
    const refunded = p.refunds.reduce((s, r) => s + cents(r.amount), 0);
    if (p.refunds.some((r) => r.type === "VOID")) return "Voided";
    if (refunded >= cents(p.amount)) return "Refunded";
    return refunded > 0 ? "Part refunded" : "Received";
  };

  return (
<div className="mb-6 p-4 border border-paper-300 rounded-xl bg-white shadow-sm flex items-center justify-between">
  <div>
    <h3 className="font-semibold text-lg">Order Status</h3>
    <p className="text-sm text-ink-600">Current: {order.status}</p>
  </div>
  <div className="relative group inline-block">
    <button className="btn btn-secondary flex items-center gap-2">
      Change Status
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
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
            {st}
          </button>
        ))}
      </form>
    </div>
  </div>
</div>
    <div className="mx-auto max-w-6xl space-y-4">
<div className="mb-4 p-4 border border-paper-300 rounded-xl bg-white shadow-sm flex items-center justify-between">
  <div>
    <h3 className="font-semibold text-lg">Order Status</h3>
    <p className="text-sm text-ink-600">Current: {order.status}</p>
  </div>
  <div className="relative group inline-block">
    <button className="btn btn-secondary flex items-center gap-2">
      Change Status
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
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
            {st}
          </button>
        ))}
      </form>
    </div>
  </div>
</div>
      <Link href="/orders" className="text-sm text-palm-700">← Orders</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-3xl font-semibold">{order.orderCode}</h2>
          <OrderStatusBadge status={status} />
          <PaymentStatusBadge status={order.paymentStatus as PaymentStatusKey} />
          {order.source === "WEBSITE" && <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">Online order</span>}
        </div>
        {can("receipts.print") && <Link href={`/orders/${order.id}/receipt`} className="btn btn-secondary">Receipt</Link>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className="panel p-4">
            <h3 className="mb-2 text-lg font-semibold">Order details</h3>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-600">Customer</dt><dd className="font-medium">{order.customerId ? <Link className="text-palm-700 hover:underline" href={`/customers/${order.customerId}`}>{order.customerName}</Link> : order.customerName}</dd></div>
              <div><dt className="text-ink-600">Phone</dt><dd className="font-medium">{order.customerPhone ?? "—"}</dd></div>
              <div><dt className="text-ink-600">Order type</dt><dd className="font-medium">{TYPE_LABEL[type]}{order.tableNumber ? ` · Table ${order.tableNumber}` : ""}</dd></div>
              <div><dt className="text-ink-600">Taken by</dt><dd className="font-medium">{order.createdBy?.name ?? "Online customer (website)"}</dd></div>
              {order.deliveryAddress && <div className="sm:col-span-2"><dt className="text-ink-600">Delivery address</dt><dd className="font-medium">{order.deliveryAddress}{order.deliveryInstructions ? ` (${order.deliveryInstructions})` : ""}</dd></div>}
              {order.note && <div className="sm:col-span-2"><dt className="text-ink-600">Note</dt><dd className="font-medium">{order.note}</dd></div>}
              <div><dt className="text-ink-600">Created</dt><dd className="font-medium">{formatInZone(order.createdAt, tz)}</dd></div>
              <div><dt className="text-ink-600">Last updated</dt><dd className="font-medium">{formatInZone(order.updatedAt, tz)}</dd></div>
              {order.cancelledAt && (
                <div className="rounded-lg bg-chili-50 p-3 sm:col-span-2">
                  <dt className="font-semibold text-chili-600">Cancelled by {order.cancelledBy?.name ?? "staff"} · {formatInZone(order.cancelledAt, tz)}</dt>
                  <dd>{order.cancellationReason}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="panel overflow-x-auto">
            <h3 className="p-4 pb-2 text-lg font-semibold">Items</h3>
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-y border-paper-300 text-xs uppercase text-ink-600">
                <tr><th className="p-3">Item</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-paper-200">
                {order.items.map((it) => (
                  <tr key={it.id}>
                    <td className="p-3">
                      <p className="font-medium">{it.productName}{it.variantName ? ` (${it.variantName})` : ""}</p>
                      {it.addons.length > 0 && <p className="text-xs text-ink-600">+ {it.addons.map((a) => `${a.name} ${money(a.price)}`).join(", ")}</p>}
                      {it.note && <p className="text-xs italic text-ink-600">{it.note}</p>}
                    </td>
                    <td className="p-3 text-right">{it.quantity}</td>
                    <td className="p-3 text-right">{money(it.unitPrice)}</td>
                    <td className="p-3 text-right font-medium">{money(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto w-full max-w-xs space-y-1 p-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-600">Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
              {cents(order.discountAmount) > 0 && <div className="flex justify-between"><dt className="text-ink-600">Discount{order.discountName ? ` (${order.discountName})` : ""}</dt><dd>−{money(order.discountAmount)}</dd></div>}
              {cents(order.serviceChargeAmount) > 0 && <div className="flex justify-between"><dt className="text-ink-600">Service charge</dt><dd>{money(order.serviceChargeAmount)}</dd></div>}
              {cents(order.taxAmount) > 0 && <div className="flex justify-between"><dt className="text-ink-600">Tax{order.taxRateApplied ? ` (${order.taxRateApplied.toString()}%)` : ""}</dt><dd>{money(order.taxAmount)}</dd></div>}
              {cents(order.deliveryFee) > 0 && <div className="flex justify-between"><dt className="text-ink-600">Delivery fee</dt><dd>{money(order.deliveryFee)}</dd></div>}
              <div className="flex justify-between border-t border-paper-300 pt-2 font-display text-xl font-semibold"><dt>Total</dt><dd>{money(order.total)}</dd></div>
            </dl>
          </section>

          <section className="panel p-4">
            <h3 className="mb-3 text-lg font-semibold">Timeline</h3>
            <ol className="space-y-3 border-l-2 border-paper-300 pl-4">
              {order.statusHistory.map((h) => (
                <li key={h.id} className="relative text-sm">
                  <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-palm-700" />
                  <p className="font-medium">{h.fromStatus ? ORDER_STATUS_LABEL[h.toStatus as OrderStatusKey] : `Created (${ORDER_STATUS_LABEL[h.toStatus as OrderStatusKey]})`}</p>
                  <p className="text-xs text-ink-600">{formatInZone(h.createdAt, tz)} · {h.changedBy?.name ?? "Customer (website)"}{h.note ? ` · ${h.note}` : ""}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-4">
          {can("orders.manage") && !isFinal(status) && (
            <section className="panel p-4">
              <h3 className="mb-2 text-lg font-semibold">Status</h3>
              {next && (
                <ActionForm
                  action={changeOrderStatus} submitLabel={NEXT_ACTION_LABEL[next] ?? ORDER_STATUS_LABEL[next]} buttonClassName="w-full"
                  confirmMessage={next === "COMPLETED" && balanceC > 0 ? `This order still has ${money(balanceC / 100)} unpaid. Complete it anyway?` : undefined}
                >
                  <input type="hidden" name="id" value={order.id} /><input type="hidden" name="from" value={status} /><input type="hidden" name="to" value={next} />
                </ActionForm>
              )}
              {targets.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-palm-700">Move to another status</summary>
                  <ActionForm action={changeOrderStatus} submitLabel="Move order" variant="secondary" className="mt-2">
                    <input type="hidden" name="id" value={order.id} /><input type="hidden" name="from" value={status} />
                    <SelectField label="New status" name="to" options={targets.map((t) => ({ value: t, label: ORDER_STATUS_LABEL[t] }))} />
                  </ActionForm>
                </details>
              )}
            </section>
          )}

          <section className="panel p-4">
            <h3 className="mb-2 text-lg font-semibold">Payment</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-ink-600">Total</dt><dd>{money(order.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-600">Paid</dt><dd>{money(order.amountPaid)}</dd></div>
              {cents(order.amountRefunded) > 0 && <div className="flex justify-between"><dt className="text-ink-600">Refunded</dt><dd>{money(order.amountRefunded)}</dd></div>}
              <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd>{money(balanceC / 100)}</dd></div>
            </dl>
            {order.payments.length > 0 && (
              <ul className="mt-3 divide-y divide-paper-200 border-t border-paper-200 text-sm">
                {order.payments.map((p) => (
                  <li key={p.id} className="py-2">
                    <div className="flex justify-between gap-2"><span className="font-medium">{p.methodName}</span><span>{money(p.amount)}</span></div>
                    <p className="text-xs text-ink-600">{paymentLabel(p)} · {formatInZone(p.paidAt, tz, "d MMM, h:mm a")} · {p.processedBy.name}{p.reference ? ` · Ref ${p.reference}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
            {order.refunds.length > 0 && (
              <ul className="mt-2 divide-y divide-paper-200 border-t border-paper-200 text-sm">
                {order.refunds.map((r) => (
                  <li key={r.id} className="py-2">
                    <div className="flex justify-between gap-2"><span className="font-medium">{r.type === "VOID" ? "Void" : "Refund"} · {r.payment.methodName}</span><span>−{money(r.amount)}</span></div>
                    <p className="text-xs text-ink-600">{formatInZone(r.createdAt, tz, "d MMM, h:mm a")} · {r.createdBy.name} · {r.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {methods.length > 0 && (
            <section className="panel p-4">
              <h3 className="mb-2 text-lg font-semibold">Take payment</h3>
              <PaymentForm
                key={order.payments.length} orderId={order.id} balance={balanceC / 100} symbol={sym}
                methods={methods.map((m) => ({ id: m.id, name: m.name, code: m.code, requiresReference: m.requiresReference }))}
              />
            </section>
          )}

          {can("payments.refund") && refundable.length > 0 && (
            <section className="panel p-4">
              <h3 className="mb-1 text-lg font-semibold">Refund or void</h3>
              <p className="mb-2 text-xs text-ink-600">Payments are never edited or deleted. A refund gives money back. A void reverses a whole payment entered by mistake.</p>
              <ActionForm action={createRefund} submitLabel="Record" variant="danger" resetOnSuccess confirmMessage="Record this refund? It can't be undone.">
                <input type="hidden" name="orderId" value={order.id} />
                <div className="space-y-3">
                  <SelectField label="Payment" name="paymentId" options={refundable.map(({ p, left }) => ({ value: p.id, label: `${p.methodName} ${money(p.amount)} (${money(left / 100)} refundable)` }))} />
                  <SelectField label="Type" name="type" options={[{ value: "REFUND", label: "Refund (money given back)" }, { value: "VOID", label: "Void (whole payment, entered in error)" }]} />
                  <Field label={`Amount (${sym})`} name="amount" type="number" step="0.01" min="0.01" required />
                  <TextAreaField label="Reason" name="reason" required minLength={3} maxLength={300} />
                </div>
              </ActionForm>
            </section>
          )}

          {can("orders.cancel") && !isFinal(status) && (
            <section className="panel border-chili-500/30 p-4">
              <details open={cancel === "1"}>
                <summary className="cursor-pointer text-lg font-semibold text-chili-600">Cancel order</summary>
                <p className="mt-1 text-xs text-ink-600">The order stays on record as cancelled, with who cancelled it and why. Its number is never reused.</p>
                <ActionForm action={cancelOrder} submitLabel="Cancel this order" variant="danger" className="mt-2" confirmMessage={`Cancel order ${order.orderCode}? This can't be undone.`}>
                  <input type="hidden" name="id" value={order.id} />
                  <div className="space-y-3">
                    <TextAreaField label="Reason for cancelling" name="reason" required minLength={3} maxLength={300} />
                    {paidC > 0 && can("payments.refund") && <CheckField label={`Also refund ${money(paidC / 100)} paid so far`} name="refund" defaultChecked />}
                    {paidC > 0 && !can("payments.refund") && <p className="text-xs text-amber-700">This order has payments. Ask a manager or owner to refund them after cancelling.</p>}
                  </div>
                </ActionForm>
              </details>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}


