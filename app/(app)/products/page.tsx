import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { setProductActive } from "@/lib/actions/products";
import { ActionForm } from "@/components/action-form";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";

export const metadata = { title: "Products" };
export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

export default async function ProductsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; category?: string; status?: string; page?: string }> }) {
  const user = await requirePermission("products.view");
  const canManage = user.permissions.includes("products.manage");
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const status = sp.status === "active" || sp.status === "inactive" ? sp.status : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const settings = await getSettings();

  const where: Prisma.ProductWhereInput = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    ...(sp.category ? { categoryId: sp.category } : {}),
    ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
  };
  const [total, products, categories] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where, orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      include: { category: true, inventoryItem: true, _count: { select: { variants: true, addons: true } } },
    }),
    db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Products</h2>
          <p className="text-sm text-ink-600">{total} product{total === 1 ? "" : "s"}. Products are deactivated, never deleted, so old orders stay readable.</p>
        </div>
        {canManage && <Link href="/products/new" className="btn btn-primary">Add product</Link>}
      </div>

      <form className="panel grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
        <input name="q" defaultValue={q} placeholder="Search products" className="input" aria-label="Search products" />
        <select name="category" defaultValue={sp.category ?? ""} className="input" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="status" defaultValue={status} className="input" aria-label="Status">
          <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <button className="btn btn-secondary">Filter</button>
      </form>

      <div className="panel divide-y divide-paper-200">
        {products.length === 0 && (
          <p className="p-6 text-sm text-ink-600">{q || sp.category ? "No products match those filters." : "No products yet."}</p>
        )}
        {products.map((p) => {
          const low = p.trackStock && p.inventoryItem && p.inventoryItem.quantity <= p.inventoryItem.lowStockThreshold;
          return (
            <div key={p.id} className={cn("flex flex-wrap items-center gap-3 p-3", !p.isActive && "bg-paper-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="h-12 w-12 rounded-lg object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-lg bg-paper-200 font-display text-lg text-ink-600">{p.name[0]}</div>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-ink-600">
                  {p.category.name}
                  {p._count.variants > 0 && ` · ${p._count.variants} size${p._count.variants > 1 ? "s" : ""}`}
                  {p._count.addons > 0 && ` · ${p._count.addons} add-on${p._count.addons > 1 ? "s" : ""}`}
                </p>
              </div>
              <p className="w-24 text-right font-medium">{formatMoney(p.price, settings.currencySymbol)}</p>
              <p className={cn("w-24 text-right text-xs", low ? "font-semibold text-chili-600" : "text-ink-600")}>
                {p.trackStock ? `${p.inventoryItem?.quantity ?? 0} in stock` : "Not tracked"}
              </p>
              {!p.isActive && <span className="rounded bg-paper-300 px-1.5 py-0.5 text-xs">Inactive</span>}
              {canManage && (
                <div className="flex items-center gap-2">
                  <Link href={`/products/${p.id}`} className="btn btn-secondary">Edit</Link>
                  <ActionForm action={setProductActive} submitLabel={p.isActive ? "Deactivate" : "Activate"} variant="secondary" buttonClassName="mt-0">
                    <input type="hidden" name="id" value={p.id} /><input type="hidden" name="isActive" value={String(!p.isActive)} />
                  </ActionForm>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Pagination page={page} pages={Math.ceil(total / PAGE_SIZE)} basePath="/products" params={{ q, category: sp.category, status: status === "all" ? undefined : status }} />
    </div>
  );
}
