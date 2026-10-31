import "server-only";
import { db } from "@/lib/db";

export type CustomerStats = {
  orders: number; // every order, including cancelled
  validOrders: number; // non-cancelled
  spent: number; // non-cancelled totals minus refunds
  average: number;
  first: Date | null;
  last: Date | null;
};

export async function getCustomerStats(ids: string[]) {
  const map = new Map<string, CustomerStats>();
  if (ids.length === 0) return map;
  const [all, valid] = await Promise.all([
    db.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids } }, _count: { _all: true } }),
    db.order.groupBy({
      by: ["customerId"],
      where: { customerId: { in: ids }, status: { not: "CANCELLED" } },
      _count: { _all: true },
      _sum: { total: true, amountRefunded: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
  ]);
  for (const id of ids) map.set(id, { orders: 0, validOrders: 0, spent: 0, average: 0, first: null, last: null });
  for (const a of all) if (a.customerId) map.get(a.customerId)!.orders = a._count._all;
  for (const v of valid) {
    if (!v.customerId) continue;
    const spent = Number(v._sum.total?.toString() ?? 0) - Number(v._sum.amountRefunded?.toString() ?? 0);
    const s = map.get(v.customerId)!;
    s.validOrders = v._count._all;
    s.spent = spent;
    s.average = v._count._all ? spent / v._count._all : 0;
    s.first = v._min.createdAt;
    s.last = v._max.createdAt;
  }
  return map;
}
