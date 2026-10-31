import Link from "next/link";
import type { InventoryMovementType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatInZone } from "@/lib/dates";
import { resolveRange } from "@/lib/date-range";
import { adjustStock } from "@/lib/actions/inventory";
import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/fields";
import { Pagination } from "@/components/pagination";
import { RangeFields } from "@/components/range-fields";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

type SP = { tab?: string; q?: string; status?: string; type?: string; preset?: string; from?: string; to?: string; page?: string };
const TYPE_LABEL: Record<InventoryMovementType, string> = { RECEIVED: "Received", SOLD: "Sold", ADJUSTMENT: "Adjustment", WASTE: "Wasted / damaged", RETURN: "Returned" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("inventory.view");
  const canManage = user.permissions.includes("inventory.manage");
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "stock";
  const s = await getSettings();
  const q = sp.q?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  // Always needed for the summary cards, and the stock list itself (a restaurant tracks tens or hundreds of items).
  const all = await db.inventoryItem.findMany({
    where: { product: { trackStock: true } },
    include: { product: { select: { id: true, name: true, isActive: true, category: { select: { name: true } } } } },
    orderBy: { product: { name: "asc" } },
  });
  const state = (i: (typeof all)[number]) => (i.quantity <= 0 ? "out" : i.quantity <= i.lowStockThreshold ? "low" : "ok");
  const counts = { out: all.filter((i) => state(i) === "out").length, low: all.filter((i) => state(i) === "low").length };

  const tabs = (
    <nav className="flex gap-1" aria-label="Inventory sections">
      {([["stock", "Stock levels"], ["history", "Movement history"]] as const).map(([id, label]) => (
        <Link key={id} href={`/inventory?tab=${id}`} className={cn("rounded-lg px-3 py-2 text-sm font-medium", tab === id ? "bg-palm-900 text-paper-100" : "text-ink-800 hover:bg-paper-100")}>{label}</Link>
      ))}
    </nav>
  );

  const header = (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-2xl font-semibold">Inventory</h2>
        <p className="text-sm text-ink-600">Stock for products with tracking turned on. Every change is recorded with a reason, who made it and when.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="panel p-3"><p className="font-display text-2xl font-semibold">{all.length}</p><p className="text-xs text-ink-600">Tracked products</p></div>
        <div className="panel p-3"><p className={cn("font-display text-2xl font-semibold", counts.low > 0 && "text-amber-700")}>{counts.low}</p><p className="text-xs text-ink-600">Running low</p></div>
        <div className="panel p-3"><p className={cn("font-display text-2xl font-semibold", counts.out > 0 && "text-chili-600")}>{counts.out}</p><p className="text-xs text-ink-600">Out of stock</p></div>
      </div>
      {tabs}
    </div>
  );

  if (tab === "history") {
    const type = (["RECEIVED", "SOLD", "ADJUSTMENT", "WASTE", "RETURN"] as const).find((t) => t === sp.type);
    const range = resolveRange(sp.preset, sp.from, sp.to, s.timezone);
    const where: Prisma.InventoryMovementWhereInput = {
      ...(q ? { inventoryItem: { product: { name: { contains: q, mode: "insensitive" } } } } : {}),
      ...(type ? { type } : {}),
      ...(range.from && range.to ? { createdAt: { gte: range.from, lte: range.to } } : {}),
    };
    const [total, moves] = await Promise.all([
      db.inventoryMovement.count({ where }),
      db.inventoryMovement.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
        include: {
          inventoryItem: { select: { product: { select: { name: true } } } },
          createdBy: { select: { name: true } },
          order: { select: { id: true, orderCode: true } },
        },
      }),
    ]);
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        {header}
        <form className="panel grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
          <input type="hidden" name="tab" value="history" />
          <input name="q" defaultValue={q} placeholder="Product name" className="input" aria-label="Search by product" />
          <select name="type" defaultValue={type ?? ""} className="input" aria-label="Movement type">
            <option value="">Any type</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <RangeFields preset={range.preset} from={range.fromStr} to={range.toStr} />
          <button className="btn btn-primary">Apply filters</button>
          <Link href="/inventory?tab=history" className="btn btn-secondary">Clear</Link>
        </form>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-paper-300 text-xs uppercase text-ink-600">
              <tr><th className="p-3">When</th><th className="p-3">Product</th><th className="p-3">Type</th><th className="p-3 text-right">Change</th><th className="p-3 text-right">Stock after</th><th className="p-3">Reason</th><th className="p-3">By</th></tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {moves.length === 0 && <tr><td colSpan={7} className="p-6 text-ink-600">No stock movements match.</td></tr>}
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap p-3">{formatInZone(m.createdAt, s.timezone, "d MMM, h:mm a")}</td>
                  <td className="p-3 font-medium">{m.inventoryItem.product.name}</td>
                  <td className="p-3">{TYPE_LABEL[m.type]}</td>
                  <td className={cn("p-3 text-right font-semibold", m.quantityChange < 0 ? "text-chili-600" : "text-leaf-700")}>{m.quantityChange > 0 ? "+" : ""}{m.quantityChange}</td>
                  <td className="p-3 text-right">{m.quantityAfter}</td>
                  <td className="p-3">{m.order ? <Link href={`/orders/${m.order.id}`} className="text-palm-700 hover:underline">{m.reason ?? m.order.orderCode}</Link> : m.reason ?? "—"}</td>
                  <td className="p-3">{m.createdBy.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={Math.ceil(total / PAGE_SIZE)} basePath="/inventory" params={{ tab: "history", q, type, preset: range.preset === "all" ? undefined : range.preset, from: sp.from, to: sp.to }} />
      </div>
    );
  }

  const filter = sp.status === "low" || sp.status === "out" ? sp.status : "all";
  const rows = all
    .filter((i) => (q ? i.product.name.toLowerCase().includes(q.toLowerCase()) : true))
    .filter((i) => (filter === "all" ? true : filter === "low" ? state(i) === "low" : state(i) === "out"))
    .sort((a, b) => (state(a) === "ok" ? 1 : 0) - (state(b) === "ok" ? 1 : 0) || a.product.name.localeCompare(b.product.name)); // problems first
  const pages = Math.ceil(rows.length / PAGE_SIZE);
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {header}
      <form className="panel grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto]" role="search">
        <input name="q" defaultValue={q} placeholder="Search products" className="input" aria-label="Search products" />
        <select name="status" defaultValue={filter} className="input" aria-label="Stock status">
          <option value="all">All stock</option><option value="low">Running low</option><option value="out">Out of stock</option>
        </select>
        <button className="btn btn-secondary">Filter</button>
      </form>

      <div className="panel divide-y divide-paper-200">
        {visible.length === 0 && (
          <p className="p-6 text-sm text-ink-600">
            {all.length === 0 ? <>No products track stock yet. Turn on &ldquo;Track stock&rdquo; when you <Link href="/products" className="font-medium text-palm-700 underline">edit a product</Link>.</> : "No products match."}
          </p>
        )}
        {visible.map((i) => {
          const st = state(i);
          return (
            <div key={i.id} className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.product.name}{!i.product.isActive && <span className="ml-2 rounded bg-paper-300 px-1.5 py-0.5 text-xs">Inactive</span>}</p>
                  <p className="text-xs text-ink-600">{i.product.category.name} · low-stock level {i.lowStockThreshold}</p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", st === "out" ? "bg-chili-50 text-chili-600" : st === "low" ? "bg-amber-50 text-amber-800" : "bg-leaf-50 text-leaf-700")}>
                  {st === "out" ? "Out of stock" : st === "low" ? "Running low" : "In stock"}
                </span>
                <p className="w-20 text-right font-display text-2xl font-semibold">{i.quantity}</p>
              </div>
              {canManage && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-palm-700">Receive, waste or count stock</summary>
                  <ActionForm action={adjustStock} submitLabel="Record" resetOnSuccess className="mt-3">
                    <input type="hidden" name="productId" value={i.productId} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <SelectField label="What happened" name="type" options={[
                        { value: "RECEIVED", label: "Stock received (adds)" },
                        { value: "WASTE", label: "Damaged or wasted (removes)" },
                        { value: "ADJUSTMENT", label: "Counted: set stock to this number" },
                      ]} />
                      <Field label="Quantity" name="quantity" type="number" min={0} step={1} required hint="For a count, enter the total you counted." />
                      <Field label="Reason" name="reason" required minLength={3} maxLength={300} placeholder="e.g. Delivery from supplier" />
                    </div>
                  </ActionForm>
                </details>
              )}
            </div>
          );
        })}
      </div>
      <Pagination page={page} pages={pages} basePath="/inventory" params={{ q, status: filter === "all" ? undefined : filter }} />
    </div>
  );
}
