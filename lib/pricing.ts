// Pure billing maths shared by the POS screen (preview) and the server (the authoritative calculation).
// Everything is done in whole kobo/cents so totals never drift from floating point.

export type OrderTypeKey = "PICKUP" | "DELIVERY" | "DINE_IN";

export type PricingConfig = {
  deliveryFee: number;
  taxEnabled: boolean;
  taxRate: number;
  serviceChargeEnabled: boolean;
  serviceChargeRate: number;
};

export type PricingLine = { unitPrice: number; addonsPerUnit: number; quantity: number };
export type PricingDiscount = { type: "PERCENT" | "FIXED"; value: number } | null;

export const toCents = (n: number) => Math.round(n * 100);
export const centsToString = (c: number) => (c / 100).toFixed(2);

/**
 * total = subtotal − discount + service charge (dine-in only) + tax + delivery fee
 * Tax is charged on (subtotal − discount + service charge); the delivery fee is not taxed.
 */
export function computeTotals(lines: PricingLine[], cfg: PricingConfig, type: OrderTypeKey, discount: PricingDiscount) {
  const subtotalC = lines.reduce((s, l) => s + (toCents(l.unitPrice) + toCents(l.addonsPerUnit)) * l.quantity, 0);
  let discountC = 0;
  if (discount) {
    discountC = discount.type === "PERCENT" ? Math.round((subtotalC * discount.value) / 100) : toCents(discount.value);
    discountC = Math.min(discountC, subtotalC);
  }
  const base = subtotalC - discountC;
  const serviceC = cfg.serviceChargeEnabled && type === "DINE_IN" ? Math.round((base * cfg.serviceChargeRate) / 100) : 0;
  const taxC = cfg.taxEnabled ? Math.round(((base + serviceC) * cfg.taxRate) / 100) : 0;
  const deliveryC = type === "DELIVERY" ? toCents(cfg.deliveryFee) : 0;
  const totalC = base + serviceC + taxC + deliveryC;
  return {
    subtotalC, discountC, serviceC, taxC, deliveryC, totalC,
    subtotal: subtotalC / 100, discountAmount: discountC / 100, serviceChargeAmount: serviceC / 100,
    taxAmount: taxC / 100, deliveryFee: deliveryC / 100, total: totalC / 100,
  };
}
