"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { BusinessError } from "@/lib/errors";
import { cents, createRefundTx, lockOrder, refundableCents } from "@/lib/payments";
import { allowedTargets, ORDER_STATUS_LABEL, type OrderStatusKey } from "@/lib/status";
import type { OrderTypeKey } from "@/lib/pricing";
import { cancelSchema, statusSchema } from "@/lib/validation-orders";
import { notifyOrderChange } from "@/lib/realtime";
import { handle, validationError } from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/types";

function refresh(id: string) {
  for (const p of ["/live", "/orders", `/orders/${id}`, "/pos", "/inventory", "/products"]) revalidatePath(p);
}

export async function changeOrderStatus(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("orders.manage");
    const parsed = statusSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return { error: "That status change isn't valid." };
    const { id } = parsed.data;
    const to = parsed.data.to as OrderStatusKey;
    const from = parsed.data.from as OrderStatusKey;

    await db.$transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (order.status !== from) {
        throw new BusinessError(`This order was just changed to ${ORDER_STATUS_LABEL[order.status as OrderStatusKey]} by someone else. Refresh to see the latest.`);
      }
      if (!allowedTargets(order.type as OrderTypeKey, order.status as OrderStatusKey).includes(to)) {
        throw new BusinessError(`${order.type === "DELIVERY" ? "" : "Pickup and dine-in orders skip “Out for delivery”. "}That move isn't allowed from ${ORDER_STATUS_LABEL[from]}.`);
      }

      await tx.order.update({ where: { id }, data: { status: to, completedAt: to === "COMPLETED" ? new Date() : undefined } });
      await tx.orderStatusHistory.create({ data: { orderId: id, fromStatus: from, toStatus: to, changedById: user.id } });

      // Stock goes down once, when the order is completed (completed orders can never change status again).
      if (to === "COMPLETED") {
        const items = await tx.orderItem.findMany({ where: { orderId: id }, include: { product: { select: { trackStock: true } } } });
        const qty = new Map<string, number>();
        for (const it of items) if (it.product.trackStock) qty.set(it.productId, (qty.get(it.productId) ?? 0) + it.quantity);
        for (const [productId, n] of qty) {
          const inv = await tx.inventoryItem.findUnique({ where: { productId } });
          if (!inv) continue;
          const updated = await tx.inventoryItem.update({ where: { id: inv.id }, data: { quantity: { decrement: n } }, select: { quantity: true } });
          await tx.inventoryMovement.create({
            data: { inventoryItemId: inv.id, type: "SOLD", quantityChange: -n, quantityAfter: updated.quantity, reason: `Order ${order.orderCode}`, orderId: id, createdById: user.id },
          });
        }
      }

      await writeAudit(
        {
          user, action: "ORDER_STATUS_CHANGED", entityType: "Order", entityId: id,
          summary: `${user.name} changed order ${order.orderCode} from ${ORDER_STATUS_LABEL[from].toLowerCase()} to ${ORDER_STATUS_LABEL[to].toLowerCase()}`,
          oldValue: { status: from }, newValue: { status: to },
        },
        tx,
      );
    });
    refresh(id);
    await notifyOrderChange(id, "updated");
    return { ok: true };
  });
}

export async function cancelOrder(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("orders.cancel");
    const parsed = cancelSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);
    const { id, reason, refund } = parsed.data;
    const settings = await getSettings();

    const result = await db.$transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (order.status === "CANCELLED") throw new BusinessError("This order is already cancelled.");
      if (order.status === "COMPLETED") throw new BusinessError("Completed orders can't be cancelled. Issue a refund instead.");

      await tx.order.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: user.id, cancellationReason: reason },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: id, fromStatus: order.status, toStatus: "CANCELLED", note: reason, changedById: user.id },
      });

      let refundedC = 0;
      if (refund && user.permissions.includes("payments.refund")) {
        const payments = await tx.payment.findMany({ where: { orderId: id, status: "COMPLETED" }, orderBy: { paidAt: "asc" } });
        for (const p of payments) {
          const { left } = await refundableCents(tx, p.id);
          if (left > 0) {
            await createRefundTx(tx, { orderId: id, paymentId: p.id, amountC: left, reason: `Order cancelled: ${reason}`, type: "REFUND", user, symbol: settings.currencySymbol });
            refundedC += left;
          }
        }
      }

      await writeAudit(
        {
          user, action: "ORDER_CANCELLED", entityType: "Order", entityId: id,
          summary: `${user.name} cancelled order ${order.orderCode}: ${reason}`,
          // The original order details stay on the order itself; this keeps a copy of how it looked at cancellation.
          oldValue: {
            orderCode: order.orderCode, type: order.type, status: order.status, paymentStatus: order.paymentStatus,
            total: Number(order.total.toString()), amountPaid: Number(order.amountPaid.toString()), customerName: order.customerName,
          },
          newValue: { status: "CANCELLED", reason, refundedAutomatically: refundedC / 100 },
        },
        tx,
      );
      return { paidC: cents(order.amountPaid), refundedC };
    });
    refresh(id);
    await notifyOrderChange(id, "updated");
    const stillHeld = result.paidC - result.refundedC;
    return {
      ok: true,
      message: stillHeld > 0 ? "Order cancelled. It has payments that haven't been refunded yet. Refund them below." : "Order cancelled.",
    };
  });
}
