import type { OrderTypeKey } from "@/lib/pricing";

export type OrderStatusKey = "PENDING" | "ACCEPTED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELLED";
export type PaymentStatusKey = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED";

/** The five statuses the restaurant works with. */
export const ORDER_STATUSES: OrderStatusKey[] = ["PENDING", "ACCEPTED", "READY", "COMPLETED", "CANCELLED"];
/** Live board column order. */
export const BOARD_COLUMNS: OrderStatusKey[] = ["PENDING", "ACCEPTED", "READY", "CANCELLED", "COMPLETED"];
/** Every value that can exist in the database (two older ones are retired but old orders may still carry them). */
export const ALL_ORDER_STATUSES: OrderStatusKey[] = ["PENDING", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"];
export const PAYMENT_STATUSES: PaymentStatusKey[] = ["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "PARTIALLY_REFUNDED"];

export const ORDER_STATUS_LABEL: Record<OrderStatusKey, string> = {
  PENDING: "Pending", ACCEPTED: "Accepted", PREPARING: "Preparing", READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery", COMPLETED: "Completed", CANCELLED: "Cancelled",
};
export const PAYMENT_STATUS_LABEL: Record<PaymentStatusKey, string> = {
  UNPAID: "Unpaid", PARTIALLY_PAID: "Part paid", PAID: "Paid", REFUNDED: "Refunded", PARTIALLY_REFUNDED: "Part refunded",
};
export const TYPE_LABEL: Record<OrderTypeKey, string> = { PICKUP: "Pickup", DELIVERY: "Delivery", DINE_IN: "Dine-in" };

// Orders placed before the workflow was simplified keep their old status. They stay readable and act as the nearest current step.
const LEGACY: Partial<Record<OrderStatusKey, OrderStatusKey>> = { PREPARING: "ACCEPTED", OUT_FOR_DELIVERY: "READY" };
export const effectiveStatus = (s: OrderStatusKey): OrderStatusKey => LEGACY[s] ?? s;
/** Database values that belong to a current status (for filters and counts). */
export const statusMatches = (s: OrderStatusKey): OrderStatusKey[] => ALL_ORDER_STATUSES.filter((x) => effectiveStatus(x) === s);

/** pending → accepted → ready → completed. Same for pickup, delivery and dine-in. */
export const FLOW: OrderStatusKey[] = ["PENDING", "ACCEPTED", "READY", "COMPLETED"];
export function flowFor(_type?: OrderTypeKey): OrderStatusKey[] {
  return FLOW;
}

export const isFinal = (s: OrderStatusKey) => s === "COMPLETED" || s === "CANCELLED";

/** An open order can move to any other step (forward to skip ahead, back to fix a slip). Completed and cancelled are final.
 *  Cancelling has its own form because it needs a reason. */
export function allowedTargets(_type: OrderTypeKey, status: OrderStatusKey): OrderStatusKey[] {
  if (isFinal(status)) return [];
  const here = effectiveStatus(status);
  return FLOW.filter((s) => s !== here);
}

export function nextStatus(_type: OrderTypeKey, status: OrderStatusKey): OrderStatusKey | null {
  const i = FLOW.indexOf(effectiveStatus(status));
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}

export const NEXT_ACTION_LABEL: Partial<Record<OrderStatusKey, string>> = { ACCEPTED: "Accept", READY: "Mark ready", COMPLETED: "Complete" };
