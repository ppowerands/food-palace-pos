import "server-only";
import { Prisma, type Discount, type PaymentMethod } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { centsToString, computeTotals, toCents, type PricingDiscount } from "@/lib/pricing";
import type { orderInputSchema } from "@/lib/validation-catalog";
import { BusinessError } from "@/lib/errors";
import { insertPayment } from "@/lib/payments";
import { notifyOrderChange } from "@/lib/realtime";

export type OrderRequest = z.infer<typeof orderInputSchema>;
export type Actor = { id: string; name: string; permissions: string[] };
export type PlaceOrderResult =
  | { ok: true; orderId: string; orderCode: string; total: number; paid: number; trackingToken: string; duplicate?: boolean }
  | { ok: false; error: string };

const fail = (error: string): PlaceOrderResult => ({ ok: false, error });

/**
 * The one place orders are created, for both the POS (staff) and the customer website.
 * The caller only says WHAT was ordered (product, size, add-on ids, quantity). Names, prices, fees, tax, discount
 * and totals are all recalculated here from the database. Nothing from the browser decides money.
 */
export async function placeOrder(d: OrderRequest, ctx: { actor: Actor | null; source: "POS" | "WEBSITE" }): Promise<PlaceOrderResult> {
  const { actor, source } = ctx;
  try {
    // A double-click or a retry after a bad connection must not create a second order.
    const already = await db.order.findUnique({
      where: { idempotencyKey: d.idempotencyKey },
      select: { id: true, orderCode: true, total: true, amountPaid: true, trackingToken: true },
    });
    if (already) {
      return { ok: true, orderId: already.id, orderCode: already.orderCode, total: Number(already.total.toString()), paid: Number(already.amountPaid.toString()), trackingToken: already.trackingToken, duplicate: true };
    }

    const settings = await getSettings();
    if (source === "WEBSITE" && !settings.onlineOrderingEnabled) return fail("Online ordering is closed right now. Please call the restaurant.");
    const enabled = { PICKUP: settings.enablePickup, DELIVERY: settings.enableDelivery, DINE_IN: settings.enableDineIn };
    if (!enabled[d.type]) return fail("That order type isn't available right now.");

    // ── Customer rules ──
    const typedPhone = normalizePhone(d.customerPhone);
    if (d.customerPhone && !typedPhone) return fail("Enter a valid phone number.");
    const customer = source === "POS" && d.customerId ? await db.customer.findUnique({ where: { id: d.customerId } }) : null;
    if (source === "POS" && d.customerId && !customer) return fail("That customer no longer exists. Pick or enter the customer again.");

    const orderName = customer?.name ?? (d.customerName || (d.tableNumber ? `Table ${d.tableNumber}` : "Walk-in"));
    const orderPhone = customer?.phone ?? typedPhone;
    if (d.type !== "DINE_IN" && !customer && !d.customerName) return fail(source === "WEBSITE" ? "Enter your name." : "Enter the customer's name.");
    if (d.type === "DELIVERY") {
      if (!orderPhone) return fail("A phone number is required for delivery.");
      if (!d.deliveryAddress) return fail("A delivery address is required.");
    }
    if (source === "WEBSITE") {
      if (d.type !== "DINE_IN" && !orderPhone) return fail("Enter your phone number so the restaurant can reach you.");
      if (d.type === "DINE_IN" && !d.tableNumber) return fail("Enter your table number.");
      if (typedPhone) {
        const recent = await db.order.count({ where: { source: "WEBSITE", customerPhone: typedPhone, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
        if (recent >= 50) return fail("You've placed several orders in the last hour. Please call the restaurant if you need help.");
      }
    }

    // ── Items: trust nothing but the ids ──
    const products = await db.product.findMany({
      where: { id: { in: [...new Set(d.items.map((i) => i.productId))] } },
      include: { category: true, variants: true, addons: true, inventoryItem: true },
    });
    type Product = (typeof products)[number];
    type Line = { product: Product; variant: Product["variants"][number] | null; addons: Product["addons"]; quantity: number; note: string; unitPrice: number; addonsPerUnit: number };
    const byId = new Map(products.map((p) => [p.id, p]));
    const lines: Line[] = [];
    for (const item of d.items) {
      const p = byId.get(item.productId);
      if (!p) return fail("An item in this order is no longer on the menu. Please refresh and try again.");
      if (!p.isActive || !p.category.isActive) return fail(`${p.name} is no longer available.`);
      const activeVariants = p.variants.filter((v) => v.isActive);
      let variant: Product["variants"][number] | null = null;
      if (item.variantId) {
        variant = activeVariants.find((v) => v.id === item.variantId) ?? null;
        if (!variant) return fail(`That size of ${p.name} is no longer available.`);
      } else if (activeVariants.length > 0) {
        return fail(`Choose a size for ${p.name}.`);
      }
      const addons: Product["addons"] = [];
      for (const addonId of new Set(item.addonIds)) {
        const a = p.addons.find((x) => x.id === addonId && x.isActive);
        if (!a) return fail(`An add-on for ${p.name} is no longer available.`);
        addons.push(a);
      }
      lines.push({
        product: p, variant, addons, quantity: item.quantity, note: item.note,
        unitPrice: Number((variant?.price ?? p.price).toString()),
        addonsPerUnit: addons.reduce((s, a) => s + Number(a.price.toString()), 0),
      });
    }

    if (settings.enforceStock) {
      const need = new Map<string, number>();
      for (const l of lines) need.set(l.product.id, (need.get(l.product.id) ?? 0) + l.quantity);
      for (const [productId, qty] of need) {
        const p = byId.get(productId)!;
        if (!p.trackStock) continue;
        const have = p.inventoryItem?.quantity ?? 0;
        if (have < qty) return fail(have <= 0 ? `${p.name} is sold out.` : `Only ${have} of ${p.name} left.`);
      }
    }

    // ── Discount (staff only) and totals ──
    let discountRow: Discount | null = null;
    if (source === "POS" && d.discountId) {
      const now = new Date();
      discountRow = await db.discount.findFirst({
        where: {
          id: d.discountId, isActive: true,
          AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
      });
      if (!discountRow) return fail("That discount isn't available any more.");
    }
    const discount: PricingDiscount = discountRow ? { type: discountRow.type, value: Number(discountRow.value.toString()) } : null;
    const totals = computeTotals(
      lines,
      {
        deliveryFee: Number(settings.defaultDeliveryFee.toString()),
        taxEnabled: settings.taxEnabled, taxRate: Number(settings.taxRate.toString()),
        serviceChargeEnabled: settings.serviceChargeEnabled, serviceChargeRate: Number(settings.serviceChargeRate.toString()),
      },
      d.type,
      discount,
    );
    if (totals.totalC !== toCents(d.expectedTotal)) {
      return fail("Prices or fees changed while you were building this order. Refresh the page and review it again.");
    }

    // ── Optional payment (POS only; the website never takes payment) ──
    let payMethod: PaymentMethod | null = null;
    if (source === "POS" && d.payment) {
      if (!actor?.permissions.includes("payments.process")) return fail("You don't have permission to take payments.");
      payMethod = await db.paymentMethod.findUnique({ where: { id: d.payment.methodId } });
      if (!payMethod || !payMethod.isEnabled) return fail("That payment method isn't available.");
      if (payMethod.requiresReference && !d.payment.reference) return fail(`${payMethod.name} payments need a reference number.`);
      if (toCents(d.payment.amount) > totals.totalC) return fail("The payment can't be more than the order total.");
    }

    // ── Write everything or nothing ──
    const address = d.type === "DELIVERY" ? d.deliveryAddress : null;
    const created = await db.$transaction(async (tx) => {
      let customerId = customer?.id ?? null;
      if (!customerId && typedPhone) {
        const found = await tx.customer.findUnique({ where: { phone: typedPhone } }); // no duplicate customers
        customerId = found ? found.id : (await tx.customer.create({ data: { name: orderName, phone: typedPhone, address } })).id;
      }
      if (customerId && address) await tx.customer.updateMany({ where: { id: customerId, address: null }, data: { address } });

      // Row-locking increment: two orders at the same moment still get different numbers.
      // The counter only ever goes up, so a cancelled order's number is never handed out again.
      const counter = await tx.restaurantSettings.update({
        where: { id: 1 }, data: { nextOrderNumber: { increment: 1 } },
        select: { nextOrderNumber: true, orderPrefix: true, orderNumberPadding: true, defaultOrderStatus: true },
      });
      const orderNumber = counter.nextOrderNumber - 1;
      const orderCode = `${counter.orderPrefix}${String(orderNumber).padStart(counter.orderNumberPadding, "0")}`;
      const status = source === "WEBSITE" ? "PENDING" : counter.defaultOrderStatus; // website orders always arrive as pending

      const order = await tx.order.create({
        data: {
          orderNumber, orderCode, source, type: d.type, status, paymentStatus: "UNPAID",
          customerId, customerName: orderName, customerPhone: orderPhone,
          deliveryAddress: address, deliveryInstructions: d.type === "DELIVERY" ? d.deliveryInstructions || null : null,
          tableNumber: d.type === "DINE_IN" ? d.tableNumber || null : null, note: d.note || null,
          subtotal: centsToString(totals.subtotalC), deliveryFee: centsToString(totals.deliveryC),
          discountAmount: centsToString(totals.discountC), serviceChargeAmount: centsToString(totals.serviceC),
          taxAmount: centsToString(totals.taxC), total: centsToString(totals.totalC),
          currency: settings.currency,
          discountId: discountRow?.id ?? null, discountName: discountRow?.name ?? null,
          taxRateApplied: settings.taxEnabled ? settings.taxRate : null,
          idempotencyKey: d.idempotencyKey, createdById: actor?.id ?? null,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id, variantId: l.variant?.id ?? null,
              productName: l.product.name, variantName: l.variant?.name ?? null,
              unitPrice: centsToString(toCents(l.unitPrice)), quantity: l.quantity,
              addonsTotal: centsToString(toCents(l.addonsPerUnit) * l.quantity),
              lineTotal: centsToString((toCents(l.unitPrice) + toCents(l.addonsPerUnit)) * l.quantity),
              note: l.note || null,
              addons: { create: l.addons.map((a) => ({ addonId: a.id, name: a.name, price: a.price })) },
            })),
          },
          statusHistory: { create: { fromStatus: null, toStatus: status, changedById: actor?.id ?? null, note: source === "WEBSITE" ? "Order placed on the website" : "Order created" } },
        },
      });

      if (d.payment && payMethod && actor) {
        await insertPayment(tx, {
          orderId: order.id, method: payMethod, amountC: toCents(d.payment.amount), reference: d.payment.reference || null,
          user: actor, idempotencyKey: `${d.idempotencyKey}:pay`, symbol: settings.currencySymbol,
        });
      }

      const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
      const typeText = d.type.toLowerCase().replace("_", "-");
      await writeAudit(
        {
          user: actor, userName: "Customer (website)", action: "ORDER_CREATED", entityType: "Order", entityId: order.id,
          summary: actor
            ? `${actor.name} created order ${orderCode} (${typeText}, ${itemCount} item(s), ${formatMoney(totals.total, settings.currencySymbol)})`
            : `${orderName} placed website order ${orderCode} (${typeText}, ${itemCount} item(s), ${formatMoney(totals.total, settings.currencySymbol)})`,
          newValue: { orderCode, source, type: d.type, status, total: totals.total },
        },
        tx,
      );
      return order;
    });

    await notifyOrderChange(created.id, "created");
    return { ok: true, orderId: created.id, orderCode: created.orderCode, total: totals.total, paid: d.payment && payMethod ? d.payment.amount : 0, trackingToken: created.trackingToken };
  } catch (e) {
    if (e instanceof BusinessError) return fail(e.message);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Two identical requests raced: hand back the order the first one made.
      const existing = await db.order.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
      if (existing) {
        return { ok: true, orderId: existing.id, orderCode: existing.orderCode, total: Number(existing.total.toString()), paid: Number(existing.amountPaid.toString()), trackingToken: existing.trackingToken, duplicate: true };
      }
    }
    console.error("placeOrder failed:", e);
    return fail(`The order could not be saved, so nothing was recorded. Please try again. (Reference: ${errorRef(e)})`);
  }
}

/** A short, safe code that tells us what went wrong, e.g. P2022 = a column is missing, P2028 = the database was too slow. */
export function errorRef(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code;
  if (e instanceof Error) return e.name === "PrismaClientValidationError" ? "OUTDATED_CLIENT" : e.name;
  return "UNKNOWN";
}
