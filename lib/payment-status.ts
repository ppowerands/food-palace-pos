import type { PaymentStatusKey } from "@/lib/status";

/**
 * paid     = money received, minus payments voided as mistakes
 * refunded = money given back (refunds, not voids)
 * Billed amounts never change, so a refund does not re-open the balance. Only a void does.
 */
export function derivePaymentStatus(totalC: number, paidC: number, refundedC: number): PaymentStatusKey {
  if (refundedC > 0 && refundedC >= paidC) return "REFUNDED";
  if (refundedC > 0) return "PARTIALLY_REFUNDED";
  if (paidC >= totalC && totalC > 0) return "PAID";
  if (paidC > 0) return "PARTIALLY_PAID";
  return "UNPAID";
}

export const balanceDueC = (totalC: number, paidC: number) => Math.max(0, totalC - paidC);
