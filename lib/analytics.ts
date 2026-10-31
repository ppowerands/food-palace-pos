import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

/**
 * What counts as a "sale": an order that is not cancelled AND is either completed or has had money paid on it.
 * A pending, unpaid order is not a sale yet. Orders are placed in a period by the day they were created.
 */
export const validOrder: Prisma.OrderWhereInput = { status: { not: "CANCELLED" }, OR: [{ status: "COMPLETED" }, { amountPaid: { gt: 0 } }] };

export const VALID_SQL = Prisma.sql`o."status" <> 'CANCELLED' AND (o."status" = 'COMPLETED' OR o."amountPaid" > 0)`;
export const PLACED_SQL = Prisma.sql`o."status" <> 'CANCELLED'`;
// Timestamps are stored as UTC; compare them as UTC no matter how the database session is set up.
export const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
export const local = (tz: string) => Prisma.sql`((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})`;
export const num = (v: unknown) => (v === null || v === undefined ? 0 : Math.round(Number(String(v)) * 100) / 100);

export async function getSalesSummary(from: Date, to: Date) {
  const agg = await db.order.aggregate({
    where: { ...validOrder, createdAt: { gte: from, lte: to } },
    _sum: { total: true, discountAmount: true, amountRefunded: true },
    _count: { _all: true },
  });
  const total = num(agg._sum.total);
  const discounts = num(agg._sum.discountAmount);
  const refunds = num(agg._sum.amountRefunded);
  const orders = agg._count._all;
  const net = Math.round((total - refunds) * 100) / 100;
  return { orders, gross: Math.round((total + discounts) * 100) / 100, discounts, refunds, net, average: orders ? Math.round((net / orders) * 100) / 100 : 0 };
}

export async function getStatusCounts(from: Date, to: Date) {
  const rows = await db.order.groupBy({ by: ["status"], where: { createdAt: { gte: from, lte: to } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.status as string, r._count._all]));
}

/** Orders per day (or per hour) in the restaurant's timezone. "placed" = every non-cancelled order, "valid" = counted sales. */
export async function getSeries(from: Date, to: Date, tz: string, bucket: "day" | "hour", scope: "placed" | "valid") {
  const fmt = bucket === "hour" ? "HH24" : "YYYY-MM-DD";
  const rows = await db.$queryRaw<{ k: string; orders: number; total: unknown; discounts: unknown; refunded: unknown }[]>(Prisma.sql`
    SELECT to_char(${local(tz)}, ${fmt}) AS k, COUNT(*)::int AS orders,
           SUM(o."total") AS total, SUM(o."discountAmount") AS discounts, SUM(o."amountRefunded") AS refunded
    FROM "Order" o
    WHERE o."createdAt" >= ${utc(from)} AND o."createdAt" <= ${utc(to)} AND ${scope === "valid" ? VALID_SQL : PLACED_SQL}
    GROUP BY 1 ORDER BY 1`);
  return rows.map((r) => ({ key: r.k, orders: r.orders, total: num(r.total), discounts: num(r.discounts), refunded: num(r.refunded) }));
}

/** Money received per payment method in the period (by payment time), minus what was refunded or voided on those payments. */
export async function getPaymentBreakdown(from: Date, to: Date) {
  const rows = await db.$queryRaw<{ method: string; received: unknown; refunded: unknown }[]>(Prisma.sql`
    SELECT p."methodName" AS method, SUM(p."amount") AS received, COALESCE(SUM(r.refunded), 0) AS refunded
    FROM "Payment" p
    LEFT JOIN (SELECT "paymentId", SUM("amount") AS refunded FROM "Refund" WHERE "status" = 'COMPLETED' GROUP BY "paymentId") r ON r."paymentId" = p."id"
    WHERE p."status" = 'COMPLETED' AND p."paidAt" >= ${utc(from)} AND p."paidAt" <= ${utc(to)}
    GROUP BY 1`);
  return new Map(rows.map((r) => [r.method, { received: num(r.received), refunded: num(r.refunded), net: Math.round((num(r.received) - num(r.refunded)) * 100) / 100 }]));
}

export type SoldRow = { key: string; name: string; perDay: Record<string, number>; total: number; revenue: number; sizes: { name: string; qty: number }[] };

/** How many of each product (and each add-on, such as beef) were sold per day. */
export async function getItemsSold(from: Date, to: Date, tz: string, basis: "placed" | "completed") {
  const cond = basis === "completed" ? Prisma.sql`o."status" = 'COMPLETED'` : PLACED_SQL;
  const range = Prisma.sql`o."createdAt" >= ${utc(from)} AND o."createdAt" <= ${utc(to)} AND ${cond}`;
  const day = Prisma.sql`to_char(${local(tz)}, 'YYYY-MM-DD')`;

  const [products, sizes, addons] = await Promise.all([
    db.$queryRaw<{ day: string; key: string; name: string; qty: number; revenue: unknown }[]>(Prisma.sql`
      SELECT ${day} AS day, i."productId" AS key, (array_agg(i."productName" ORDER BY o."createdAt" DESC))[1] AS name,
             SUM(i."quantity")::int AS qty, SUM(i."lineTotal" - i."addonsTotal") AS revenue
      FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId" WHERE ${range} GROUP BY 1, 2`),
    db.$queryRaw<{ key: string; size: string; qty: number }[]>(Prisma.sql`
      SELECT i."productId" AS key, i."variantName" AS size, SUM(i."quantity")::int AS qty
      FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId" WHERE ${range} AND i."variantName" IS NOT NULL GROUP BY 1, 2`),
    db.$queryRaw<{ day: string; key: string; name: string; qty: number; revenue: unknown }[]>(Prisma.sql`
      SELECT ${day} AS day, lower(a."name") AS key, (array_agg(a."name" ORDER BY o."createdAt" DESC))[1] AS name,
             SUM(i."quantity")::int AS qty, SUM(a."price" * i."quantity") AS revenue
      FROM "OrderItemAddon" a JOIN "OrderItem" i ON i."id" = a."orderItemId" JOIN "Order" o ON o."id" = i."orderId"
      WHERE ${range} GROUP BY 1, 2`),
  ]);

  const build = (rows: { day: string; key: string; name: string; qty: number; revenue: unknown }[]) => {
    const map = new Map<string, SoldRow>();
    for (const r of rows) {
      const row = map.get(r.key) ?? { key: r.key, name: r.name, perDay: {}, total: 0, revenue: 0, sizes: [] };
      row.perDay[r.day] = (row.perDay[r.day] ?? 0) + r.qty;
      row.total += r.qty;
      row.revenue = Math.round((row.revenue + num(r.revenue)) * 100) / 100;
      map.set(r.key, row);
    }
    return map;
  };
  const productMap = build(products);
  for (const s of sizes) productMap.get(s.key)?.sizes.push({ name: s.size, qty: s.qty });
  const sort = (m: Map<string, SoldRow>) => [...m.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { products: sort(productMap), addons: sort(build(addons)) };
}

export type ActivityEvent = { id: string; at: Date; kind: "new" | "repeat" | "payment" | "cancel"; text: string; href: string; tag?: string };

/** Customer activity in the last 24 hours, built from real order, payment and cancellation records. */
export async function getActivity(symbol: string): Promise<ActivityEvent[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [orders, payments, cancels] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, source: true, orderCode: true, customerName: true, customerId: true, type: true, createdAt: true, items: { select: { quantity: true } } },
    }),
    db.payment.findMany({
      where: { status: "COMPLETED", paidAt: { gte: since } }, orderBy: { paidAt: "desc" }, take: 10,
      select: { id: true, amount: true, methodName: true, paidAt: true, order: { select: { id: true, orderCode: true, customerName: true } } },
    }),
    db.order.findMany({
      where: { status: "CANCELLED", cancelledAt: { gte: since } }, orderBy: { cancelledAt: "desc" }, take: 10,
      select: { id: true, orderCode: true, customerName: true, cancelledAt: true },
    }),
  ]);

  const ids = [...new Set(orders.map((o) => o.customerId).filter((x): x is string => !!x))];
  const firsts = ids.length
    ? await db.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids } }, _min: { createdAt: true } })
    : [];
  const firstAt = new Map(firsts.map((f) => [f.customerId, f._min.createdAt]));
  const via = { PICKUP: "pickup", DELIVERY: "delivery", DINE_IN: "dine-in" } as const;

  const events: ActivityEvent[] = [
    ...orders.map((o): ActivityEvent => {
      const n = o.items.reduce((s, i) => s + i.quantity, 0);
      const first = o.customerId ? firstAt.get(o.customerId) : null;
      const repeat = !!first && first < o.createdAt;
      return {
        id: `o-${o.id}`, at: o.createdAt, kind: repeat ? "repeat" : "new", href: `/orders/${o.id}`,
        text: `${o.orderCode} ${o.customerName} ordered ${n} item${n === 1 ? "" : "s"} through ${via[o.type]}`,
        tag: o.source === "WEBSITE" ? (repeat ? "Online · repeat" : "Online order") : repeat ? "Repeat order" : "New order",
      };
    }),
    ...payments.map((p): ActivityEvent => ({
      id: `p-${p.id}`, at: p.paidAt, kind: "payment", href: `/orders/${p.order.id}`, tag: "Payment",
      text: `${p.order.orderCode} ${p.order.customerName} paid ${formatMoney(p.amount, symbol)} by ${p.methodName}`,
    })),
    ...cancels.map((c): ActivityEvent => ({
      id: `c-${c.id}`, at: c.cancelledAt!, kind: "cancel", href: `/orders/${c.id}`, tag: "Cancelled",
      text: `${c.orderCode} ${c.customerName} was cancelled`,
    })),
  ];
  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 15);
}
