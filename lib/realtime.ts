import "server-only";
import { db } from "@/lib/db";
import { ORDER_EVENT, orderTopic, POS_EVENT, POS_TOPIC } from "@/lib/realtime-topics";

/**
 * Realtime via Supabase Realtime "Broadcast". After an order is saved (or changes), the server sends a tiny message
 * to the POS channel and to that order's private tracking channel. Screens react by reloading their data from the app.
 * Messages carry only ids/status codes, never customer names, phones or addresses.
 * If the Supabase keys are not set, this does nothing and the screens fall back to polling.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function broadcast(messages: { topic: string; event: string; payload: Record<string, unknown> }[]) {
  if (!url || !key) return;
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: false })) }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.error("Realtime broadcast failed:", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("Realtime broadcast error:", e); // never let a realtime hiccup break saving an order
  }
}

export async function notifyOrderChange(orderId: string, kind: "created" | "updated") {
  try {
    const o = await db.order.findUnique({
      where: { id: orderId },
      select: { orderCode: true, trackingToken: true, status: true, paymentStatus: true, source: true, type: true },
    });
    if (!o) return;
    await broadcast([
      { topic: POS_TOPIC, event: POS_EVENT, payload: { kind, orderId, orderCode: o.orderCode, status: o.status, paymentStatus: o.paymentStatus, source: o.source, type: o.type } },
      { topic: orderTopic(o.trackingToken), event: ORDER_EVENT, payload: { status: o.status, paymentStatus: o.paymentStatus } },
    ]);
  } catch (e) {
    console.error("notifyOrderChange failed:", e);
  }
}
