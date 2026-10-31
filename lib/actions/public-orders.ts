"use server";

import { errorRef, placeOrder } from "@/lib/order-service";
import { websiteOrderSchema } from "@/lib/validation-catalog";

export type WebsiteOrderResult = { ok: true; trackingToken: string; orderCode: string } | { ok: false; error: string };

/**
 * Public: a customer submitting an order from the website. No login, no payment.
 * The order lands in the POS as pending and unpaid. Prices are recalculated on the server.
 */
export async function placeWebsiteOrder(input: unknown): Promise<WebsiteOrderResult> {
  const parsed = websiteOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your order and try again." };
  const { company, ...rest } = parsed.data;
  if (company) return { ok: false, error: "Something went wrong. Please try again." }; // honeypot: real customers never fill this in

  try {
    const res = await placeOrder({ ...rest, customerId: null, discountId: null, payment: null }, { actor: null, source: "WEBSITE" });
    return res.ok ? { ok: true, trackingToken: res.trackingToken, orderCode: res.orderCode } : res;
  } catch (e) {
    console.error("placeWebsiteOrder failed:", e);
    return { ok: false, error: `Sorry, we couldn't send your order. Please try again or call the restaurant. (Reference: ${errorRef(e)})` };
  }
}
