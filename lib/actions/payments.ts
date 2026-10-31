"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { insertPayment, createRefundTx } from "@/lib/payments";
import { toCents } from "@/lib/pricing";
import { paymentSchema, refundSchema } from "@/lib/validation-orders";
import { notifyOrderChange } from "@/lib/realtime";
import { handle, validationError } from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/types";

export async function recordPayment(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("payments.process");
    const parsed = paymentSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;

    // Same form submitted twice (double tap, flaky connection): report success once, record once.
    if (await db.payment.findUnique({ where: { idempotencyKey: d.idempotencyKey } })) {
      return { ok: true, message: "That payment was already recorded." };
    }
    const method = await db.paymentMethod.findUnique({ where: { id: d.methodId } });
    if (!method) return { error: "Choose a payment method." };
    const settings = await getSettings();

    await db.$transaction((tx) =>
      insertPayment(tx, {
        orderId: d.orderId, method, amountC: toCents(d.amount), reference: d.reference || null,
        user, idempotencyKey: d.idempotencyKey, failed: d.failed, symbol: settings.currencySymbol,
      }),
    );
    revalidatePath(`/orders/${d.orderId}`);
    revalidatePath("/orders");
    revalidatePath("/payments");
    revalidatePath("/live");
    await notifyOrderChange(d.orderId, "updated");
    return { ok: true, message: d.failed ? "Failed attempt logged. Nothing was added to the balance." : "Payment recorded." };
  });
}

export async function createRefund(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("payments.refund");
    const parsed = refundSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    const settings = await getSettings();

    await db.$transaction((tx) =>
      createRefundTx(tx, {
        orderId: d.orderId, paymentId: d.paymentId, amountC: toCents(d.amount), reason: d.reason,
        type: d.type, user, symbol: settings.currencySymbol,
      }),
    );
    revalidatePath(`/orders/${d.orderId}`);
    revalidatePath("/orders");
    revalidatePath("/payments");
    await notifyOrderChange(d.orderId, "updated");
    return { ok: true, message: d.type === "VOID" ? "Payment voided." : "Refund recorded." };
  });
}
