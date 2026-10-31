import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type OrderStatusKey, type PaymentStatusKey } from "@/lib/status";
import { cn } from "@/lib/utils";

const ORDER_STYLE: Record<OrderStatusKey, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  ACCEPTED: "bg-sky-50 text-sky-800 ring-sky-200",
  PREPARING: "bg-violet-50 text-violet-800 ring-violet-200",
  READY: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  OUT_FOR_DELIVERY: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  COMPLETED: "bg-palm-900 text-paper-100 ring-palm-900",
  CANCELLED: "bg-chili-50 text-chili-600 ring-chili-500/30",
};
const PAY_STYLE: Record<PaymentStatusKey, string> = {
  UNPAID: "bg-white text-chili-600 ring-chili-500/40",
  PARTIALLY_PAID: "bg-amber-50 text-amber-800 ring-amber-200",
  PAID: "bg-leaf-50 text-leaf-700 ring-leaf-500/30",
  REFUNDED: "bg-paper-200 text-ink-800 ring-paper-300",
  PARTIALLY_REFUNDED: "bg-orange-50 text-orange-800 ring-orange-200",
};
const base = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset";

export function OrderStatusBadge({ status, className }: { status: OrderStatusKey; className?: string }) {
  return <span className={cn(base, ORDER_STYLE[status], className)}>{ORDER_STATUS_LABEL[status]}</span>;
}
export function PaymentStatusBadge({ status, className }: { status: PaymentStatusKey; className?: string }) {
  return <span className={cn(base, PAY_STYLE[status], className)}>{PAYMENT_STATUS_LABEL[status]}</span>;
}
