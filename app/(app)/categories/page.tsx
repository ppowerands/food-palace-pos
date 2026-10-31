import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { createCategory, moveCategory, setCategoryActive, updateCategory } from "@/lib/actions/categories";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";
import { cn } from "@/lib/utils";

export const metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requirePermission("categories.manage");
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Categories</h2>
        <p className="text-sm text-ink-600">The order here is the order of the tabs on the POS. Deactivating hides a category without touching old orders.</p>
      </div>

      <div className="panel divide-y divide-paper-200">
        {categories.length === 0 && <p className="p-4 text-sm text-ink-600">No categories yet. Add your first one below, e.g. Rice or Drinks.</p>}
        {categories.map((c, i) => (
          <div key={c.id} className={cn("p-4", !c.isActive && "bg-paper-100")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {c.name}
                  {!c.isActive && <span className="ml-2 rounded bg-paper-300 px-1.5 py-0.5 text-xs">Inactive</span>}
                </p>
                <p className="text-xs text-ink-600">{c._count.products} product{c._count.products === 1 ? "" : "s"}{c.description ? ` · ${c.description}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {i > 0 && (
                  <ActionForm action={moveCategory} submitLabel="Up" variant="secondary" buttonClassName="mt-0 px-3">
                    <input type="hidden" name="id" value={c.id} /><input type="hidden" name="direction" value="up" />
                  </ActionForm>
                )}
                {i < categories.length - 1 && (
                  <ActionForm action={moveCategory} submitLabel="Down" variant="secondary" buttonClassName="mt-0 px-3">
                    <input type="hidden" name="id" value={c.id} /><input type="hidden" name="direction" value="down" />
                  </ActionForm>
                )}
                <ActionForm action={setCategoryActive} submitLabel={c.isActive ? "Deactivate" : "Activate"} variant="secondary" buttonClassName="mt-0">
                  <input type="hidden" name="id" value={c.id} /><input type="hidden" name="isActive" value={String(!c.isActive)} />
                </ActionForm>
              </div>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-palm-700">Edit</summary>
              <ActionForm action={updateCategory} submitLabel="Save" className="mt-3">
                <input type="hidden" name="id" value={c.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" name="name" defaultValue={c.name} required />
                  <Field label="Description" name="description" defaultValue={c.description ?? ""} />
                </div>
              </ActionForm>
            </details>
          </div>
        ))}
      </div>

      <section className="panel p-4 sm:p-6">
        <h3 className="text-lg font-semibold">Add category</h3>
        <ActionForm action={createCategory} submitLabel="Add category" resetOnSuccess className="mt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" placeholder="e.g. Swallow" required />
            <Field label="Description (optional)" name="description" />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
