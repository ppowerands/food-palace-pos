// DEMO DATA ONLY. Never run against a real restaurant database.
// Safe to run more than once: it only adds what is missing and never deletes anything.
// Also adds about 50 sample orders with payments over the last 10 days, so the dashboard, sales and items-sold pages have data.
import { PrismaClient, type OrderStatus, type User } from "@prisma/client";
import { centsToString, computeTotals, toCents, type OrderTypeKey } from "../lib/pricing";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to load demo data with NODE_ENV=production.");
}

const db = new PrismaClient();

type Demo = {
  name: string; price: number; description?: string; stock?: number; low?: number;
  variants?: [string, number][]; addons?: [string, number][];
};

const CATALOG: Record<string, Demo[]> = {
  Rice: [
    { name: "Jollof Rice", price: 2500, description: "Party-style smoky jollof", variants: [["Small", 1500], ["Medium", 2500], ["Large", 3500]], addons: [["Chicken", 1500], ["Beef", 1000], ["Egg", 300], ["Extra sauce", 300], ["Plantain", 500]] },
    { name: "Fried Rice", price: 2500, variants: [["Small", 1500], ["Medium", 2500], ["Large", 3500]], addons: [["Chicken", 1500], ["Beef", 1000], ["Egg", 300]] },
    { name: "Coconut Rice", price: 2800, variants: [["Medium", 2800], ["Large", 3800]] },
  ],
  Chicken: [
    { name: "Grilled Chicken", price: 3500, addons: [["Extra pepper sauce", 300]] },
    { name: "Peppered Chicken", price: 3000 },
  ],
  Soups: [
    { name: "Egusi Soup", price: 2500, addons: [["Extra meat", 800], ["Fish", 1000]] },
    { name: "Pepper Soup", price: 2200, addons: [["Extra meat", 800]] },
  ],
  Swallow: [
    { name: "Pounded Yam", price: 1200 },
    { name: "Eba", price: 800 },
  ],
  Snacks: [
    { name: "Meat Pie", price: 700, stock: 30, low: 8 },
    { name: "Puff Puff (5 pcs)", price: 500 },
    { name: "Moi Moi", price: 800 },
  ],
  Drinks: [
    { name: "Chapman", price: 1500 },
    { name: "Bottled Water", price: 300, stock: 48, low: 12 },
    { name: "Soft Drink", price: 500, stock: 36, low: 6 },
  ],
};

const CUSTOMERS = [
  { name: "Adaeze Okafor", phone: "08000000001", address: "12 Example Street, Garki" },
  { name: "Ibrahim Musa", phone: "08000000002", address: "5 Sample Close, Wuse 2" },
  { name: "Chiamaka Eze", phone: "08000000003", address: null },
  { name: "Tunde Bakare", phone: "08000000004", address: "Plot 9, Demo Estate, Gwarinpa" },
  { name: "Fatima Sani", phone: "08000000005", address: null },
  { name: "Emeka Nwosu", phone: "08000000006", address: "22 Test Avenue, Maitama" },
];


// Sample orders so the dashboard has something real to calculate from. Deterministic and only runs once.
async function seedOrders(owner: User) {
  if ((await db.order.count({ where: { idempotencyKey: { startsWith: "demo-" } } })) > 0) {
    console.log("Demo orders already loaded, skipping.");
    return;
  }
  const settings = await db.restaurantSettings.findUniqueOrThrow({ where: { id: 1 } });
  const products = await db.product.findMany({
    where: { isActive: true },
    include: { variants: { where: { isActive: true } }, addons: { where: { isActive: true } } },
  });
  const customers = await db.customer.findMany({ where: { phone: { startsWith: "0800000" } } });
  const methods = await db.paymentMethod.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: "asc" } });
  if (products.length === 0 || methods.length === 0) return;

  let seed = 20260101;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const cfg = {
    deliveryFee: Number(settings.defaultDeliveryFee.toString()), taxEnabled: settings.taxEnabled, taxRate: Number(settings.taxRate.toString()),
    serviceChargeEnabled: settings.serviceChargeEnabled, serviceChargeRate: Number(settings.serviceChargeRate.toString()),
  };
  const now = Date.now();
  let refundedOne = false;

  for (let n = 0; n < 50; n++) {
    const today = n < 8;
    let createdAt: Date;
    if (today) createdAt = new Date(now - (n + 1) * 22 * 60_000);
    else {
      const daysAgo = 1 + Math.floor(rnd() * 10);
      createdAt = new Date(now - daysAgo * 86_400_000);
      createdAt.setUTCHours(10 + Math.floor(rnd() * 11), Math.floor(rnd() * 60), 0, 0); // roughly 11am to 9pm in Nigeria
    }
    const r = rnd();
    const type: OrderTypeKey = r < 0.45 ? "PICKUP" : r < 0.75 ? "DELIVERY" : "DINE_IN";
    const customer = type === "DINE_IN" && rnd() < 0.5 ? null : pick(customers);

    const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
      const product = pick(products);
      const variant = product.variants.length ? pick(product.variants) : null;
      const addons = product.addons.filter(() => rnd() < 0.35).slice(0, 2);
      return { product, variant, addons, quantity: 1 + Math.floor(rnd() * 3) };
    });
    const priced = lines.map((l) => ({
      ...l, unitPrice: Number((l.variant?.price ?? l.product.price).toString()),
      addonsPerUnit: l.addons.reduce((a, x) => a + Number(x.price.toString()), 0),
    }));
    const t = computeTotals(priced, cfg, type, null);

    // Older days: mostly completed. Today: a spread so the live board has every column filled.
    const todayStates: OrderStatus[] = ["PENDING", "PENDING", "ACCEPTED", "READY", "COMPLETED", "COMPLETED", "COMPLETED", "CANCELLED"];
    const status: OrderStatus = today ? todayStates[n] : rnd() < 0.92 ? "COMPLETED" : "CANCELLED";
    const flow: OrderStatus[] = ["PENDING", "ACCEPTED", "READY", "COMPLETED"];
    const path: OrderStatus[] = status === "CANCELLED" ? ["PENDING"] : flow.slice(0, flow.indexOf(status) + 1);
    const history: { fromStatus: OrderStatus | null; toStatus: OrderStatus; changedById: string; note: string | null; createdAt: Date }[] = path.map((st, i) => ({
      fromStatus: i === 0 ? null : path[i - 1], toStatus: st, changedById: owner.id,
      note: i === 0 ? "Order created" : null, createdAt: new Date(createdAt.getTime() + i * 5 * 60_000),
    }));
    if (status === "CANCELLED") {
      history.push({ fromStatus: "PENDING", toStatus: "CANCELLED", changedById: owner.id, note: "Customer changed their mind (demo)", createdAt: new Date(createdAt.getTime() + 10 * 60_000) });
    }

    const method = pick(methods);
    const paidInFull = status !== "CANCELLED" && (status === "COMPLETED" ? rnd() < 0.95 : rnd() < 0.4);
    const totalC = t.totalC;
    const paidC = paidInFull ? totalC : 0;
    const paidAt = new Date(createdAt.getTime() + 6 * 60_000);

    await db.$transaction(async (tx) => {
      const c = await tx.restaurantSettings.update({
        where: { id: 1 }, data: { nextOrderNumber: { increment: 1 } },
        select: { nextOrderNumber: true, orderPrefix: true, orderNumberPadding: true },
      });
      const orderNumber = c.nextOrderNumber - 1;
      const order = await tx.order.create({
        data: {
          orderNumber, orderCode: `${c.orderPrefix}${String(orderNumber).padStart(c.orderNumberPadding, "0")}`,
          type, status, paymentStatus: paidInFull ? "PAID" : "UNPAID",
          customerId: customer?.id ?? null, customerName: customer?.name ?? "Walk-in", customerPhone: customer?.phone ?? null,
          deliveryAddress: type === "DELIVERY" ? customer?.address ?? "Demo address" : null, tableNumber: type === "DINE_IN" ? String(1 + Math.floor(rnd() * 12)) : null,
          subtotal: centsToString(t.subtotalC), deliveryFee: centsToString(t.deliveryC), discountAmount: centsToString(t.discountC),
          serviceChargeAmount: centsToString(t.serviceC), taxAmount: centsToString(t.taxC), total: centsToString(totalC),
          amountPaid: centsToString(paidC), currency: settings.currency, idempotencyKey: `demo-${n}`,
          createdById: owner.id, createdAt,
          completedAt: status === "COMPLETED" ? new Date(createdAt.getTime() + 35 * 60_000) : null,
          cancelledAt: status === "CANCELLED" ? new Date(createdAt.getTime() + 10 * 60_000) : null,
          cancelledById: status === "CANCELLED" ? owner.id : null,
          cancellationReason: status === "CANCELLED" ? "Customer changed their mind (demo)" : null,
          items: {
            create: priced.map((l) => ({
              productId: l.product.id, variantId: l.variant?.id ?? null, productName: l.product.name, variantName: l.variant?.name ?? null,
              unitPrice: centsToString(toCents(l.unitPrice)), quantity: l.quantity,
              addonsTotal: centsToString(toCents(l.addonsPerUnit) * l.quantity),
              lineTotal: centsToString((toCents(l.unitPrice) + toCents(l.addonsPerUnit)) * l.quantity),
              addons: { create: l.addons.map((a) => ({ addonId: a.id, name: a.name, price: a.price })) },
            })),
          },
          statusHistory: { create: history },
        },
      });
      if (paidInFull) {
        const payment = await tx.payment.create({
          data: {
            orderId: order.id, methodId: method.id, methodName: method.name, amount: centsToString(totalC), status: "COMPLETED",
            reference: method.requiresReference ? `DEMO-${100000 + n}` : null, paidAt, processedById: owner.id,
          },
        });
        // One partial refund so the refund figures on the Sales page have something to show.
        if (!refundedOne && status === "COMPLETED" && totalC >= 150_000) {
          refundedOne = true;
          await tx.refund.create({
            data: { orderId: order.id, paymentId: payment.id, type: "REFUND", amount: "500.00", reason: "Missing item (demo)", status: "COMPLETED", createdById: owner.id, approvedById: owner.id },
          });
          await tx.order.update({ where: { id: order.id }, data: { amountRefunded: "500.00", paymentStatus: "PARTIALLY_REFUNDED" } });
        }
      }
    });
  }
  console.log("Demo orders and payments loaded.");
}

async function main() {
  const owner = await db.user.findFirst({ where: { role: { name: "OWNER" } } });
  if (!owner) throw new Error("Run `npm run db:seed` first so an owner account exists.");

  let cat = 0;
  for (const [categoryName, products] of Object.entries(CATALOG)) {
    const category = await db.category.upsert({
      where: { name: categoryName }, update: {}, create: { name: categoryName, sortOrder: cat },
    });
    cat++;
    let sort = 0;
    for (const p of products) {
      const existing = await db.product.findFirst({ where: { name: p.name, categoryId: category.id } });
      if (existing) continue;
      const created = await db.product.create({
        data: {
          name: p.name, description: p.description, price: p.price, categoryId: category.id,
          trackStock: p.stock !== undefined, sortOrder: sort++,
          variants: { create: (p.variants ?? []).map(([name, price], i) => ({ name, price, sortOrder: i })) },
          addons: { create: (p.addons ?? []).map(([name, price], i) => ({ name, price, sortOrder: i })) },
        },
      });
      if (p.stock !== undefined) {
        const item = await db.inventoryItem.create({ data: { productId: created.id, quantity: p.stock, lowStockThreshold: p.low ?? 5 } });
        await db.inventoryMovement.create({
          data: { inventoryItemId: item.id, type: "RECEIVED", quantityChange: p.stock, quantityAfter: p.stock, reason: "Demo opening stock", createdById: owner.id },
        });
      }
    }
  }

  for (const c of CUSTOMERS) {
    await db.customer.upsert({ where: { phone: c.phone }, update: {}, create: c });
  }

  if ((await db.discount.count()) === 0) {
    await db.discount.createMany({
      data: [
        { name: "Staff meal", type: "PERCENT", value: 20 },
        { name: "Loyalty ₦500 off", type: "FIXED", value: 500 },
      ],
    });
  }
  await seedOrders(owner);
  console.log("Demo catalogue, customers and orders loaded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
