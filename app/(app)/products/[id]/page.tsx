import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { updateProduct } from "@/lib/actions/products";
import { ActionForm } from "@/components/action-form";
import { ProductFields } from "@/components/product-fields";

export const metadata = { title: "Edit product" };
export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requirePermission("products.manage");
  const { id } = await params;
  const { created } = await searchParams;
  const [product, categories] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: { variants: { orderBy: { sortOrder: "asc" } }, addons: { orderBy: { sortOrder: "asc" } }, inventoryItem: true },
    }),
    db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/products" className="text-sm text-palm-700">← Products</Link>
      <h2 className="font-display text-2xl font-semibold">{product.name}</h2>
      {created && <p className="rounded-lg bg-leaf-50 px-3 py-2 text-sm text-leaf-700">Product created.</p>}
      <div className="panel p-4 sm:p-6">
        <ActionForm action={updateProduct} submitLabel="Save changes">
          <ProductFields
            categories={categories}
            product={{
              id: product.id, name: product.name, description: product.description, categoryId: product.categoryId,
              imageUrl: product.imageUrl, price: product.price.toString(), costPrice: product.costPrice?.toString() ?? null,
              trackStock: product.trackStock, isActive: product.isActive,
              lowStockThreshold: product.inventoryItem?.lowStockThreshold ?? 5, stock: product.inventoryItem?.quantity ?? null,
              variants: product.variants.map((v) => ({ id: v.id, name: v.name, price: v.price.toString(), isActive: v.isActive })),
              addons: product.addons.map((a) => ({ id: a.id, name: a.name, price: a.price.toString(), isActive: a.isActive })),
            }}
          />
        </ActionForm>
      </div>
    </div>
  );
}
