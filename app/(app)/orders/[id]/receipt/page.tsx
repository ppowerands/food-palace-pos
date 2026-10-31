import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/dates";
import { cents } from "@/lib/payments";
import { balanceDueC } from "@/lib/payment-status";
import { PAYMENT_STATUS_LABEL, TYPE_LABEL, type PaymentStatusKey } from "@/lib/status";
import type { OrderTypeKey } from "@/lib/pricing";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ fresh?: string }> }) {
  await requirePermission("receipts.print");
  const { id } = await params;
  const { fresh } = await searchParams;
  const s = await getSettings();
  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: { include: { addons: true }, orderBy: { id: "asc" } },
      payments: { where: { status: "COMPLETED" }, orderBy: { paidAt: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!order) notFound();

  const m = (v: { toString(): string } | number) => formatMoney(v, s.currencySymbol);
  const balanceC = order.status === "CANCELLED" ? 0 : balanceDueC(cents(order.total), cents(order.amountPaid));
  const line = <div className="my-2 border-t border-dashed border-ink-600/60" />;
  const row = (label: string, value: string, bold = false) => (
    <div className={`flex justify-between gap-3 ${bold ? "text-base font-bold" : ""}`}><span>{label}</span><span>{value}</span></div>
  );

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-3 flex flex-wrap gap-2 print:hidden">
        <Link href={`/orders/${order.id}`} className="btn btn-secondary">Back to order</Link>
        <PrintButton auto={fresh === "1" && s.receiptAutoPrint} />
      </div>

      <article className="bg-white p-5 font-mono text-[13px] leading-snug shadow-sm print:p-0 print:shadow-none">
        <header className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.logoUrl && <img src={s.logoUrl} alt="" className="mx-auto mb-2 max-h-16" />}
          <p className="text-lg font-bold">{s.name}</p>
          {s.receiptShowAddress && s.address && <p>{s.address}</p>}
          {s.phone && <p>Tel: {s.phone}</p>}
          {s.receiptHeader && <p className="mt-1">{s.receiptHeader}</p>}
        </header>
        {line}
        {order.status === "CANCELLED" && <p className="mb-1 text-center text-base font-bold">*** CANCELLED ***</p>}
        {row("Order", order.orderCode, true)}
        {row("Date", formatInZone(order.createdAt, s.timezone, "d MMM yyyy, h:mm a"))}
        {row(order.createdBy ? "Cashier" : "Source", order.createdBy?.name ?? "Website order")}
        {row("Type", TYPE_LABEL[order.type as OrderTypeKey] + (order.tableNumber ? ` · Table ${order.tableNumber}` : ""))}
        {row("Customer", order.customerName)}
        {s.receiptShowPhone && order.customerPhone && row("Phone", order.customerPhone)}
        {order.deliveryAddress && <p>Deliver to: {order.deliveryAddress}</p>}
        {line}
        {order.items.map((it) => (
          <div key={it.id} className="mb-1.5">
            <p>{it.productName}{it.variantName ? ` (${it.variantName})` : ""}</p>
            {it.addons.map((a) => <p key={a.id} className="pl-3">+ {a.name} {m(a.price)}</p>)}
            {row(`  ${it.quantity} x ${m(it.unitPrice)}`, m(it.lineTotal))}
          </div>
        ))}
        {line}
        {row("Subtotal", m(order.subtotal))}
        {cents(order.discountAmount) > 0 && row(`Discount${order.discountName ? ` (${order.discountName})` : ""}`, `-${m(order.discountAmount)}`)}
        {cents(order.serviceChargeAmount) > 0 && row("Service charge", m(order.serviceChargeAmount))}
        {cents(order.taxAmount) > 0 && row(`Tax${order.taxRateApplied ? ` (${order.taxRateApplied.toString()}%)` : ""}`, m(order.taxAmount))}
        {cents(order.deliveryFee) > 0 && row("Delivery fee", m(order.deliveryFee))}
        {line}
        {row("TOTAL", m(order.total), true)}
        {line}
        {order.payments.map((p) => <div key={p.id}>{row(p.methodName, m(p.amount))}{p.reference && <p className="pl-3 text-xs">Ref: {p.reference}</p>}</div>)}
        {cents(order.amountRefunded) > 0 && row("Refunded", `-${m(order.amountRefunded)}`)}
        {balanceC > 0 && row("Balance due", m(balanceC / 100), true)}
        {row("Payment status", PAYMENT_STATUS_LABEL[order.paymentStatus as PaymentStatusKey])}
        {line}
        <p className="text-center">{s.receiptFooter || "Thank you!"}</p>
      </article>
    </div>
  );
}
