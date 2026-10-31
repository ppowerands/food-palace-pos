import type { Category } from "@prisma/client";
import { CheckField, Field, SelectField, TextAreaField } from "@/components/fields";
import { ListEditor } from "@/components/list-editor";

type Existing = {
  id: string; name: string; description: string | null; categoryId: string; imageUrl: string | null;
  price: string; costPrice: string | null; trackStock: boolean; isActive: boolean;
  lowStockThreshold: number; stock: number | null;
  variants: { id: string; name: string; price: string; isActive: boolean }[];
  addons: { id: string; name: string; price: string; isActive: boolean }[];
};

export function ProductFields({ categories, product }: { categories: Category[]; product?: Existing }) {
  return (
    <div className="space-y-5">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" defaultValue={product?.name} required className="sm:col-span-2" />
        <TextAreaField label="Description" name="description" defaultValue={product?.description ?? ""} className="sm:col-span-2" />
        <SelectField
          label="Category" name="categoryId" defaultValue={product?.categoryId ?? categories[0]?.id}
          options={categories.map((c) => ({ value: c.id, label: c.isActive ? c.name : `${c.name} (inactive)` }))}
        />
        <Field label="Image link" name="imageUrl" defaultValue={product?.imageUrl ?? ""} placeholder="https://…" hint="Upload support comes later." />
        <Field label="Price" name="price" type="number" min={0} step="0.01" defaultValue={product?.price} required hint="Used when the product has no sizes." />
        <Field label="Cost price (optional)" name="costPrice" type="number" min={0} step="0.01" defaultValue={product?.costPrice ?? ""} />
      </div>

      <ListEditor
        key={JSON.stringify(product?.variants ?? [])}
        name="variants" title="Sizes / variants" addLabel="Add size" namePlaceholder="e.g. Small"
        hint="If you add sizes, the cashier must pick one and its price replaces the product price."
        initial={product?.variants ?? []}
      />
      <ListEditor
        key={JSON.stringify(product?.addons ?? [])}
        name="addons" title="Add-ons" addLabel="Add add-on" namePlaceholder="e.g. Extra chicken"
        hint="Optional extras the cashier can tick. The price is added to the item."
        initial={product?.addons ?? []}
      />

      <div className="space-y-1 rounded-lg border border-paper-300 p-3">
        <CheckField label="Track stock for this product" name="trackStock" defaultChecked={product?.trackStock} hint="Stock goes down when orders are completed. Every change is recorded." />
        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <Field label="Low-stock warning at" name="lowStockThreshold" type="number" min={0} defaultValue={product?.lowStockThreshold ?? 5} />
          {product ? (
            <div>
              <span className="label">Current stock</span>
              <p className="py-2.5 text-sm">{product.trackStock ? product.stock ?? 0 : "Not tracked"}</p>
              <span className="hint">Change stock from Inventory (coming in phase 7) so it is recorded.</span>
            </div>
          ) : (
            <Field label="Opening stock" name="openingStock" type="number" min={0} defaultValue={0} hint="Recorded as received stock." />
          )}
        </div>
      </div>

      <CheckField label="Active (sold in the POS)" name="isActive" defaultChecked={product ? product.isActive : true} />
    </div>
  );
}
