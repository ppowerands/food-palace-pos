"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { changedFields } from "@/lib/utils";
import { productSchema } from "@/lib/validation-catalog";
import { handle, validationError } from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/types";

export async function createProduct(_p: ActionState, fd: FormData): Promise<ActionState> {
  const out: { id?: string } = {};
  const result = await handle(async () => {
    const user = await authorize("products.manage");
    const parsed = productSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    if (!(await db.category.findUnique({ where: { id: d.categoryId } }))) return { error: "Choose a category." };

    const last = await db.product.aggregate({ _max: { sortOrder: true } });
    await db.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name: d.name, description: d.description, categoryId: d.categoryId, imageUrl: d.imageUrl,
          price: d.price, costPrice: d.costPrice, trackStock: d.trackStock, isActive: d.isActive,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
          variants: { create: d.variants.map((v, i) => ({ name: v.name, price: v.price, isActive: v.isActive, sortOrder: i })) },
          addons: { create: d.addons.map((a, i) => ({ name: a.name, price: a.price, isActive: a.isActive, sortOrder: i })) },
        },
      });
      if (d.trackStock) {
        const item = await tx.inventoryItem.create({
          data: { productId: p.id, quantity: d.openingStock, lowStockThreshold: d.lowStockThreshold },
        });
        if (d.openingStock > 0) {
          await tx.inventoryMovement.create({
            data: { inventoryItemId: item.id, type: "RECEIVED", quantityChange: d.openingStock, quantityAfter: d.openingStock, reason: "Opening stock", createdById: user.id },
          });
        }
      }
      await writeAudit(
        { user, action: "PRODUCT_CREATED", entityType: "Product", entityId: p.id,
          summary: `${user.name} created product "${p.name}" at ₦${d.price}`,
          newValue: { name: d.name, price: d.price, categoryId: d.categoryId, variants: d.variants, addons: d.addons } },
        tx,
      );
      out.id = p.id;
    });
    revalidatePath("/products");
    return { ok: true };
  });
  if (out.id) redirect(`/products/${out.id}?created=1`);
  return result;
}

export async function updateProduct(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("products.manage");
    const id = String(fd.get("id"));
    const parsed = productSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;

    const current = await db.product.findUnique({
      where: { id },
      include: { variants: { orderBy: { sortOrder: "asc" } }, addons: { orderBy: { sortOrder: "asc" } }, inventoryItem: true },
    });
    if (!current) return { error: "Product not found." };
    if (!(await db.category.findUnique({ where: { id: d.categoryId } }))) return { error: "Choose a category." };

    const ownVariantIds = new Set(current.variants.map((v) => v.id));
    const ownAddonIds = new Set(current.addons.map((a) => a.id));
    if (d.variants.some((v) => v.id && !ownVariantIds.has(v.id)) || d.addons.some((a) => a.id && !ownAddonIds.has(a.id))) {
      return { error: "That list is out of date. Reload the page and try again." };
    }

    const fields = {
      name: d.name, description: d.description, categoryId: d.categoryId, imageUrl: d.imageUrl,
      price: d.price, costPrice: d.costPrice, trackStock: d.trackStock, isActive: d.isActive,
    };
    const diff = changedFields(current as unknown as Record<string, unknown>, fields);
    const simple = (l: { name: string; price: { toString(): string } | number; isActive: boolean }[]) =>
      JSON.stringify(l.map((x) => ({ n: x.name, p: Number(x.price.toString()), a: x.isActive })));
    const variantsChanged = simple(current.variants) !== simple(d.variants);
    const addonsChanged = simple(current.addons) !== simple(d.addons);
    const thresholdChanged = d.trackStock && current.inventoryItem && current.inventoryItem.lowStockThreshold !== d.lowStockThreshold;

    if (diff.changed.length === 0 && !variantsChanged && !addonsChanged && !thresholdChanged && !(d.trackStock && !current.inventoryItem)) {
      return { ok: true, message: "No changes to save." };
    }

    await db.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: fields });

      // Sizes and add-ons are never deleted: old orders point at them. Removed ones are switched off.
      const sync = async (kind: "variant" | "addon") => {
        const submitted = kind === "variant" ? d.variants : d.addons;
        const existing = kind === "variant" ? current.variants : current.addons;
        const keep = new Set(submitted.filter((x) => x.id).map((x) => x.id!));
        for (const [i, row] of submitted.entries()) {
          const data = { name: row.name, price: row.price, isActive: row.isActive, sortOrder: i };
          if (row.id) {
            if (kind === "variant") await tx.productVariant.update({ where: { id: row.id }, data });
            else await tx.productAddon.update({ where: { id: row.id }, data });
          } else if (kind === "variant") await tx.productVariant.create({ data: { ...data, productId: id } });
          else await tx.productAddon.create({ data: { ...data, productId: id } });
        }
        for (const old of existing.filter((x) => !keep.has(x.id))) {
          if (kind === "variant") await tx.productVariant.update({ where: { id: old.id }, data: { isActive: false } });
          else await tx.productAddon.update({ where: { id: old.id }, data: { isActive: false } });
        }
      };
      await sync("variant");
      await sync("addon");

      if (d.trackStock) {
        if (current.inventoryItem) {
          if (thresholdChanged) await tx.inventoryItem.update({ where: { productId: id }, data: { lowStockThreshold: d.lowStockThreshold } });
        } else {
          await tx.inventoryItem.create({ data: { productId: id, quantity: 0, lowStockThreshold: d.lowStockThreshold } });
        }
      }

      const parts = diff.changed.map((k) => `${k} ${String(diff.oldValue[k] ?? "empty")} → ${String(diff.newValue[k] ?? "empty")}`);
      if (variantsChanged) parts.push("sizes");
      if (addonsChanged) parts.push("add-ons");
      await writeAudit(
        { user, action: "PRODUCT_UPDATED", entityType: "Product", entityId: id,
          summary: `${user.name} updated product "${current.name}": ${parts.join(", ") || "stock settings"}`,
          oldValue: { ...diff.oldValue, ...(variantsChanged ? { variants: current.variants } : {}), ...(addonsChanged ? { addons: current.addons } : {}) },
          newValue: { ...diff.newValue, ...(variantsChanged ? { variants: d.variants } : {}), ...(addonsChanged ? { addons: d.addons } : {}) } },
        tx,
      );
    });
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return { ok: true, message: "Product saved. Old orders keep the name and price they were sold at." };
  });
}

export async function setProductActive(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("products.manage");
    const id = String(fd.get("id"));
    const isActive = fd.get("isActive") === "true";
    const p = await db.product.findUnique({ where: { id } });
    if (!p) return { error: "Product not found." };
    await db.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { isActive } });
      await writeAudit(
        { user, action: "PRODUCT_UPDATED", entityType: "Product", entityId: id,
          summary: `${user.name} ${isActive ? "reactivated" : "deactivated"} product "${p.name}"`,
          oldValue: { isActive: p.isActive }, newValue: { isActive } },
        tx,
      );
    });
    revalidatePath("/products");
    return { ok: true };
  });
}
