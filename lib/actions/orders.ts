"use server";

import { authorize, AuthError } from "@/lib/auth";
import { placeOrder } from "@/lib/order-service";
import { orderInputSchema } from "@/lib/validation-catalog";
import { errorRef } from "@/lib/order-service";

export type CreateOrderResult =
  | { ok: true; orderId: string; orderCode: string; total: number; paid: number; duplicate?: boolean }
  | { ok: false; error: string };

/** Staff creating an order at the POS (optionally taking payment at the same time). */
export async function createOrder(input: unknown): Promise<CreateOrderResult> {
  try {
    const user = await authorize("orders.create");
    const parsed = orderInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "This order isn't valid." };
    const res = await placeOrder(parsed.data, { actor: user, source: "POS" });
    return res.ok ? { ok: true, orderId: res.orderId, orderCode: res.orderCode, total: res.total, paid: res.paid, duplicate: res.duplicate } : res;
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error("createOrder failed:", e);
    return { ok: false, error: `The order could not be saved, so nothing was recorded. Please try again. (Reference: ${errorRef(e)})` };
  }
}
