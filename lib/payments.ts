import "server-only";
import type { Prisma, PaymentMethod } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { BusinessError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { centsToString, toCents } from "@/lib/pricing";
import { derivePaymentStatus } from "@/lib/payment-status";

type Tx = Prisma.TransactionClient;
type Actor = { id: string; name: string };

export const cents = (v: { toString(): string } | number) => toCents(Number(v.toString()));

/** Locks the order row for the rest of the transaction so two cashiers can't pay or refund the same order at once. */
export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new BusinessError("Order not found.");
  return order;
}

/** Records a payment (or a failed attempt) and updates the order's paid amount and payment status. History is only ever added to. */
export async function insertPayment(
  tx: Tx,
  a: {
    orderId: string; method: PaymentMethod; amountC: number; reference: string | null; user: Actor;
    idempotencyKey?: string | null; failed?: boolean; symbol: string;
  },
) {
  const order = await lockOrder(tx, a.orderId);
  const money = (c: number) => formatMoney(c / 100, a.symbol);
  if (order.status === "CANCELLED") throw new BusinessError("This order is cancelled, so it can't take payments.");
  if (!a.method.isEnabled) throw new BusinessError(`${a.method.name} is turned off in Settings.`);
  if (a.method.requiresReference && !a.reference) throw new BusinessError(`${a.method.name} payments need a reference number.`);
  if (a.amountC <= 0) throw new BusinessError("Enter an amount above zero.");

  const totalC = cents(order.total);
  const paidC = cents(order.amountPaid);
  if (!a.failed) {
    const due = totalC - paidC;
    if (due <= 0) throw new BusinessError("This order is already fully paid.");
    if (a.amountC > due) throw new BusinessError(`That is more than the balance due (${money(due)}).`);
  }

  const payment = await tx.payment.create({
    data: {
      orderId: order.id, methodId: a.method.id, methodName: a.method.name, amount: centsToString(a.amountC),
      status: a.failed ? "FAILED" : "COMPLETED", reference: a.reference, processedById: a.user.id,
      idempotencyKey: a.idempotencyKey ?? null,
    },
  });

  let paymentStatus = order.paymentStatus;
  if (!a.failed) {
    const newPaid = paidC + a.amountC;
    paymentStatus = derivePaymentStatus(totalC, newPaid, cents(order.amountRefunded));
    await tx.order.update({ where: { id: order.id }, data: { amountPaid: centsToString(newPaid), paymentStatus } });
  }

  await writeAudit(
    {
      user: a.user,
      action: a.failed ? "PAYMENT_FAILED" : "PAYMENT_RECORDED",
      entityType: "Payment", entityId: payment.id,
      summary: a.failed
        ? `${a.user.name} logged a failed ${a.method.name} payment of ${money(a.amountC)} on order ${order.orderCode}`
        : `${a.user.name} recorded a ${a.method.name} payment of ${money(a.amountC)} on order ${order.orderCode}`,
      newValue: { orderCode: order.orderCode, method: a.method.name, amount: a.amountC / 100, reference: a.reference, paymentStatus },
    },
    tx,
  );
  return { payment, paymentStatus };
}

/** How much of a payment can still be refunded. */
export async function refundableCents(tx: Tx, paymentId: string) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new BusinessError("Payment not found.");
  const agg = await tx.refund.aggregate({ where: { paymentId, status: "COMPLETED" }, _sum: { amount: true } });
  const already = cents(agg._sum.amount ?? 0);
  return { payment, already, left: payment.status === "COMPLETED" ? cents(payment.amount) - already : 0 };
}

/**
 * REFUND: money handed back. VOID: reverses a whole payment that was entered by mistake, so the balance re-opens.
 * The payment and the order's billed amounts are never edited; a refund row is added instead.
 */
export async function createRefundTx(
  tx: Tx,
  a: { orderId: string; paymentId: string; amountC: number; reason: string; type: "REFUND" | "VOID"; user: Actor; symbol: string },
) {
  const order = await lockOrder(tx, a.orderId);
  const money = (c: number) => formatMoney(c / 100, a.symbol);
  const { payment, already, left } = await refundableCents(tx, a.paymentId);
  if (payment.orderId !== order.id) throw new BusinessError("That payment belongs to a different order.");
  if (left <= 0) throw new BusinessError("That payment has already been fully refunded.");
  if (a.amountC <= 0 || a.amountC > left) throw new BusinessError(`You can refund at most ${money(left)} of that payment.`);
  if (a.type === "VOID" && (already !== 0 || a.amountC !== cents(payment.amount))) {
    throw new BusinessError("A void reverses a whole payment that has no refunds yet. Use a refund instead.");
  }

  const refund = await tx.refund.create({
    data: {
      orderId: order.id, paymentId: payment.id, type: a.type, amount: centsToString(a.amountC), reason: a.reason,
      status: "COMPLETED", createdById: a.user.id, approvedById: a.user.id,
    },
  });

  let paidC = cents(order.amountPaid);
  let refundedC = cents(order.amountRefunded);
  if (a.type === "VOID") paidC -= a.amountC;
  else refundedC += a.amountC;
  const paymentStatus = derivePaymentStatus(cents(order.total), paidC, refundedC);
  await tx.order.update({
    where: { id: order.id },
    data: { amountPaid: centsToString(paidC), amountRefunded: centsToString(refundedC), paymentStatus },
  });

  await writeAudit(
    {
      user: a.user, action: a.type === "VOID" ? "PAYMENT_VOIDED" : "REFUND_ISSUED", entityType: "Refund", entityId: refund.id,
      summary: `${a.user.name} ${a.type === "VOID" ? "voided" : "refunded"} ${money(a.amountC)} ${a.type === "VOID" ? "payment on" : "from"} order ${order.orderCode}: ${a.reason}`,
      oldValue: { amountPaid: Number(order.amountPaid.toString()), amountRefunded: Number(order.amountRefunded.toString()), paymentStatus: order.paymentStatus },
      newValue: { amountPaid: paidC / 100, amountRefunded: refundedC / 100, paymentStatus, reason: a.reason },
    },
    tx,
  );
  return refund;
}
