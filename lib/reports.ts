import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getPaymentBreakdown, local, num, utc, VALID_SQL } from "@/lib/analytics";
import { ORDER_STATUS_LABEL, TYPE_LABEL, effectiveStatus, ORDER_STATUSES, type OrderStatusKey } from "@/lib/status";
import type { OrderTypeKey } from "@/lib/pricing";
import { resolveRangeRequired, shortDay } from "@/lib/date-range";

export const REPORTS = [
  { id: "sales", label: "Sales" },
  { id: "products", label: "Best-selling products" },
  { id: "categories", label: "Sales by category" },
  { id: "payments", label: "Payments" },
  { id: "orders", label: "Orders" },
  { id: "customers", label: "Top customers" },
] as const;
export type ReportId = (typeof REPORTS)[number]["id"];

export type Column = { key: string; label: string; kind: "text" | "money" | "int" | "percent" };
export type ReportData = {
  title: string;
  note: string;
  columns: Column[];
  rows: Record<string, string | number>[];
  summary: { label: string; value: string | number; kind: Column["kind"] }[];
  chart?: { label: string; value: number; kind: Column["kind"] }[];
  chartTitle?: string;
};
export type ReportParams = { from: Date; to: Date; tz: string; group: "day" | "week" | "month"; by: "orders" | "spent" };

const r2 = (n: number) => Math.round(n * 100) / 100;
const range = (p: ReportParams) => Prisma.sql`o."createdAt" >= ${utc(p.from)} AND o."createdAt" <= ${utc(p.to)}`;
const NOTE_SALE = "Counts sales only: orders that are not cancelled and are completed or have a payment.";

export async function buildReport(id: ReportId, p: ReportParams): Promise<ReportData> {
  switch (id) {
    case "sales": return salesReport(p);
    case "products": return productsReport(p);
    case "categories": return categoriesReport(p);
    case "payments": return paymentsReport(p);
    case "orders": return ordersReport(p);
    case "customers": return customersReport(p);
  }
}

async function salesReport(p: ReportParams): Promise<ReportData> {
  const rows = await db.$queryRaw<{ k: string; orders: number; total: unknown; discounts: unknown; refunded: unknown }[]>(Prisma.sql`
    SELECT to_char(date_trunc(${p.group}, ${local(p.tz)}), 'YYYY-MM-DD') AS k, COUNT(*)::int AS orders,
           SUM(o."total") AS total, SUM(o."discountAmount") AS discounts, SUM(o."amountRefunded") AS refunded
    FROM "Order" o WHERE ${range(p)} AND ${VALID_SQL} GROUP BY 1 ORDER BY 1`);
  const label = (k: string) => (p.group === "month" ? new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : p.group === "week" ? `Week of ${shortDay(k)}` : shortDay(k, true));
  const data = rows.map((r) => {
    const total = num(r.total), discounts = num(r.discounts), refunds = num(r.refunded);
    return { period: label(r.k), orders: r.orders, gross: r2(total + discounts), discounts, refunds, net: r2(total - refunds), average: r.orders ? r2((total - refunds) / r.orders) : 0 };
  });
  const sum = (k: "orders" | "gross" | "discounts" | "refunds" | "net") => r2(data.reduce((a, r) => a + r[k], 0));
  const orders = sum("orders");
  return {
    title: `${p.group === "day" ? "Daily" : p.group === "week" ? "Weekly" : "Monthly"} sales`, note: NOTE_SALE,
    columns: [
      { key: "period", label: p.group === "day" ? "Day" : p.group === "week" ? "Week" : "Month", kind: "text" }, { key: "orders", label: "Orders", kind: "int" },
      { key: "gross", label: "Gross sales", kind: "money" }, { key: "discounts", label: "Discounts", kind: "money" }, { key: "refunds", label: "Refunds", kind: "money" },
      { key: "net", label: "Net sales", kind: "money" }, { key: "average", label: "Average order", kind: "money" },
    ],
    rows: data,
    summary: [
      { label: "Net sales", value: sum("net"), kind: "money" }, { label: "Gross sales", value: sum("gross"), kind: "money" },
      { label: "Orders", value: orders, kind: "int" }, { label: "Average order", value: orders ? r2(sum("net") / orders) : 0, kind: "money" },
    ],
    chart: data.map((r) => ({ label: String(r.period), value: r.net, kind: "money" as const })), chartTitle: "Net sales",
  };
}

async function lineReport(p: ReportParams, by: "product" | "category") {
  const key = by === "product" ? Prisma.sql`i."productId"` : Prisma.sql`c."id"`;
  const name = by === "product" ? Prisma.sql`(array_agg(i."productName" ORDER BY o."createdAt" DESC))[1]` : Prisma.sql`c."name"`;
  return db.$queryRaw<{ key: string; name: string; category: string | null; qty: number; orders: number; sales: unknown }[]>(Prisma.sql`
    SELECT ${key} AS key, ${name} AS name, ${by === "product" ? Prisma.sql`MAX(c."name")` : Prisma.sql`NULL`} AS category,
           SUM(i."quantity")::int AS qty, COUNT(DISTINCT o."id")::int AS orders, SUM(i."lineTotal") AS sales
    FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
    JOIN "Product" pr ON pr."id" = i."productId" JOIN "Category" c ON c."id" = pr."categoryId"
    WHERE ${range(p)} AND ${VALID_SQL}
    GROUP BY ${by === "product" ? Prisma.sql`i."productId"` : Prisma.sql`c."id", c."name"`} ORDER BY SUM(i."lineTotal") DESC`);
}

async function productsReport(p: ReportParams): Promise<ReportData> {
  const rows = await lineReport(p, "product");
  const total = rows.reduce((a, r) => a + num(r.sales), 0);
  const data = rows.map((r, i) => ({ rank: i + 1, name: r.name, category: r.category ?? "", qty: r.qty, orders: r.orders, sales: r2(num(r.sales)), share: total ? r2((num(r.sales) / total) * 100) : 0 }));
  return {
    title: "Best-selling products", note: `${NOTE_SALE} Sales include add-ons and are before order-level discounts.`,
    columns: [
      { key: "rank", label: "#", kind: "int" }, { key: "name", label: "Product", kind: "text" }, { key: "category", label: "Category", kind: "text" },
      { key: "qty", label: "Sold", kind: "int" }, { key: "orders", label: "Orders", kind: "int" }, { key: "sales", label: "Sales", kind: "money" }, { key: "share", label: "Share of sales", kind: "percent" },
    ],
    rows: data,
    summary: [{ label: "Products sold", value: data.length, kind: "int" }, { label: "Items sold", value: data.reduce((a, r) => a + r.qty, 0), kind: "int" }, { label: "Sales", value: r2(total), kind: "money" }, { label: "Top product", value: data[0]?.name ?? "—", kind: "text" }],
    chart: data.slice(0, 12).map((r) => ({ label: r.name, value: r.sales, kind: "money" as const })), chartTitle: "Top products by sales",
  };
}

async function categoriesReport(p: ReportParams): Promise<ReportData> {
  const rows = await lineReport(p, "category");
  const total = rows.reduce((a, r) => a + num(r.sales), 0);
  const data = rows.map((r) => ({ name: r.name, qty: r.qty, orders: r.orders, sales: r2(num(r.sales)), share: total ? r2((num(r.sales) / total) * 100) : 0 }));
  return {
    title: "Sales by category", note: `${NOTE_SALE} Uses each product's current category.`,
    columns: [
      { key: "name", label: "Category", kind: "text" }, { key: "qty", label: "Items sold", kind: "int" }, { key: "orders", label: "Orders", kind: "int" },
      { key: "sales", label: "Sales", kind: "money" }, { key: "share", label: "Share of sales", kind: "percent" },
    ],
    rows: data,
    summary: [{ label: "Categories selling", value: data.length, kind: "int" }, { label: "Sales", value: r2(total), kind: "money" }, { label: "Top category", value: data[0]?.name ?? "—", kind: "text" }],
    chart: data.map((r) => ({ label: r.name, value: r.sales, kind: "money" as const })), chartTitle: "Sales by category",
  };
}

async function paymentsReport(p: ReportParams): Promise<ReportData> {
  const [byMethod, counts, methods] = await Promise.all([
    getPaymentBreakdown(p.from, p.to),
    db.payment.groupBy({ by: ["methodName", "status"], where: { paidAt: { gte: p.from, lte: p.to } }, _count: { _all: true } }),
    db.paymentMethod.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const names = [...new Set([...methods.map((m) => m.name), ...byMethod.keys()])];
  const net = [...byMethod.values()].reduce((a, v) => a + v.net, 0);
  const data = names.map((n) => {
    const v = byMethod.get(n);
    const done = counts.find((c) => c.methodName === n && c.status === "COMPLETED")?._count._all ?? 0;
    const failed = counts.find((c) => c.methodName === n && c.status === "FAILED")?._count._all ?? 0;
    return { method: n, payments: done, failed, received: v?.received ?? 0, refunded: v?.refunded ?? 0, net: v?.net ?? 0, share: net ? r2(((v?.net ?? 0) / net) * 100) : 0 };
  });
  return {
    title: "Payments by method", note: "Money received in the period (by the day it was paid), minus refunds and voids on those payments.",
    columns: [
      { key: "method", label: "Method", kind: "text" }, { key: "payments", label: "Payments", kind: "int" }, { key: "failed", label: "Failed attempts", kind: "int" },
      { key: "received", label: "Received", kind: "money" }, { key: "refunded", label: "Refunded / voided", kind: "money" }, { key: "net", label: "Net", kind: "money" }, { key: "share", label: "Share", kind: "percent" },
    ],
    rows: data,
    summary: [{ label: "Net received", value: r2(net), kind: "money" }, { label: "Payments", value: data.reduce((a, r) => a + r.payments, 0), kind: "int" }, { label: "Failed attempts", value: data.reduce((a, r) => a + r.failed, 0), kind: "int" }],
    chart: data.map((r) => ({ label: r.method, value: r.net, kind: "money" as const })), chartTitle: "Net received by method",
  };
}

async function ordersReport(p: ReportParams): Promise<ReportData> {
  const where = { createdAt: { gte: p.from, lte: p.to } };
  const [byStatus, byType, bySource] = await Promise.all([
    db.order.groupBy({ by: ["status"], where, _count: { _all: true }, _sum: { total: true } }),
    db.order.groupBy({ by: ["type"], where: { ...where, status: { not: "CANCELLED" } }, _count: { _all: true }, _sum: { total: true } }),
    db.order.groupBy({ by: ["source"], where: { ...where, status: { not: "CANCELLED" } }, _count: { _all: true }, _sum: { total: true } }),
  ]);
  const rows: Record<string, string | number>[] = [];
  const statusTotals = new Map<OrderStatusKey, { n: number; value: number }>();
  for (const r of byStatus) {
    const k = effectiveStatus(r.status as OrderStatusKey);
    const cur = statusTotals.get(k) ?? { n: 0, value: 0 };
    statusTotals.set(k, { n: cur.n + r._count._all, value: cur.value + num(r._sum.total) });
  }
  for (const st of ORDER_STATUSES) rows.push({ group: "Status", name: ORDER_STATUS_LABEL[st], orders: statusTotals.get(st)?.n ?? 0, value: r2(statusTotals.get(st)?.value ?? 0) });
  for (const r of byType) rows.push({ group: "Type (not cancelled)", name: TYPE_LABEL[r.type as OrderTypeKey], orders: r._count._all, value: r2(num(r._sum.total)) });
  for (const r of bySource) rows.push({ group: "Source (not cancelled)", name: r.source === "WEBSITE" ? "Website orders" : "Taken at the POS", orders: r._count._all, value: r2(num(r._sum.total)) });
  const all = [...statusTotals.values()].reduce((a, v) => a + v.n, 0);
  const pending = statusTotals.get("PENDING")?.n ?? 0, completed = statusTotals.get("COMPLETED")?.n ?? 0, cancelled = statusTotals.get("CANCELLED")?.n ?? 0;
  return {
    title: "Orders by status, type and source", note: "Every order placed in the period, including cancelled ones. 'Value' is the order total.",
    columns: [{ key: "group", label: "Group", kind: "text" }, { key: "name", label: "Name", kind: "text" }, { key: "orders", label: "Orders", kind: "int" }, { key: "value", label: "Value", kind: "money" }],
    rows,
    summary: [{ label: "Orders placed", value: all, kind: "int" }, { label: "Completed", value: completed, kind: "int" }, { label: "Pending", value: pending, kind: "int" }, { label: "Cancelled", value: cancelled, kind: "int" }],
    chart: ORDER_STATUSES.map((st) => ({ label: ORDER_STATUS_LABEL[st], value: statusTotals.get(st)?.n ?? 0, kind: "int" as const })), chartTitle: "Orders by status",
  };
}

async function customersReport(p: ReportParams): Promise<ReportData> {
  const rows = await db.$queryRaw<{ id: string; name: string; phone: string | null; orders: number; spent: unknown; last: Date }[]>(Prisma.sql`
    SELECT c."id", c."name", c."phone", COUNT(*)::int AS orders, SUM(o."total" - o."amountRefunded") AS spent, MAX(o."createdAt") AS last
    FROM "Order" o JOIN "Customer" c ON c."id" = o."customerId"
    WHERE ${range(p)} AND ${VALID_SQL}
    GROUP BY c."id", c."name", c."phone"
    ORDER BY ${p.by === "orders" ? Prisma.sql`COUNT(*) DESC, SUM(o."total" - o."amountRefunded") DESC` : Prisma.sql`SUM(o."total" - o."amountRefunded") DESC, COUNT(*) DESC`} LIMIT 50`);
  const data = rows.map((r, i) => ({ rank: i + 1, name: r.name, phone: r.phone ?? "", orders: r.orders, spent: r2(num(r.spent)), average: r.orders ? r2(num(r.spent) / r.orders) : 0, last: shortDay(r.last.toISOString().slice(0, 10), true) }));
  return {
    title: `Top customers by ${p.by === "orders" ? "number of orders" : "spending"}`, note: `${NOTE_SALE} Shows customers with a saved record (a phone number). Up to 50.`,
    columns: [
      { key: "rank", label: "#", kind: "int" }, { key: "name", label: "Customer", kind: "text" }, { key: "phone", label: "Phone", kind: "text" }, { key: "orders", label: "Orders", kind: "int" },
      { key: "spent", label: "Spent", kind: "money" }, { key: "average", label: "Average order", kind: "money" }, { key: "last", label: "Last order", kind: "text" },
    ],
    rows: data,
    summary: [{ label: "Customers who ordered", value: data.length, kind: "int" }, { label: "Their spending", value: r2(data.reduce((a, r) => a + r.spent, 0)), kind: "money" }, { label: "Top customer", value: data[0]?.name ?? "—", kind: "text" }],
    chart: data.slice(0, 10).map((r) => ({ label: r.name, value: p.by === "orders" ? r.orders : r.spent, kind: p.by === "orders" ? ("int" as const) : ("money" as const) })), chartTitle: p.by === "orders" ? "Orders" : "Spending",
  };
}

/** CSV text with Excel-friendly encoding. Cells that start with = + - @ are neutralised so a spreadsheet never runs them as formulas. */
export function toCsv(data: ReportData) {
  const esc = (v: string | number) => {
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [data.columns.map((c) => esc(c.label)).join(",")];
  for (const row of data.rows) lines.push(data.columns.map((c) => esc(row[c.key] ?? "")).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** Reads ?report=&preset=&from=&to=&group=&by= (shared by the page and the CSV download). */
export function parseReportRequest(sp: Record<string, string | undefined>, tz: string) {
  const id: ReportId = REPORTS.find((r) => r.id === sp.report)?.id ?? "sales";
  const range = resolveRangeRequired(sp.preset ?? (sp.from ? undefined : "30d"), sp.from, sp.to, tz);
  const group = sp.group === "week" || sp.group === "month" ? sp.group : "day";
  const by = sp.by === "spent" ? "spent" : "orders";
  return { id, range, group, by, params: { from: range.from, to: range.to, tz, group, by } satisfies ReportParams };
}
