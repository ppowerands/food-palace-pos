import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { createProduct } from "@/lib/actions/products";
import { ActionForm } from "@/components/action-form";
import { ProductFields } from "@/components/product-fields";

export const metadata = { title: "Add product" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requirePermission("products.manage");
  const categories = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/products" className="text-sm text-palm-700">← Products</Link>
      <h2 className="font-display text-2xl font-semibold">Add product</h2>
      {categories.length === 0 ? (
        <p className="panel p-4 text-sm">You need a category first. <Link href="/categories" className="font-medium text-palm-700 underline">Create one</Link>.</p>
      ) : (
        <div className="panel p-4 sm:p-6">
          <ActionForm action={createProduct} submitLabel="Create product">
            <ProductFields categories={categories} />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
