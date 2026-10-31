"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { categorySchema } from "@/lib/validation-catalog";
import { handle, validationError } from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/types";

export async function createCategory(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("categories.manage");
    const parsed = categorySchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);
    if (await db.category.findFirst({ where: { name: { equals: parsed.data.name, mode: "insensitive" } } })) {
      return { error: "A category with that name already exists." };
    }
    const last = await db.category.aggregate({ _max: { sortOrder: true } });
    await db.$transaction(async (tx) => {
      const c = await tx.category.create({ data: { ...parsed.data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      await writeAudit(
        { user, action: "CATEGORY_CREATED", entityType: "Category", entityId: c.id, summary: `${user.name} created category "${c.name}"`, newValue: parsed.data },
        tx,
      );
    });
    revalidatePath("/categories");
    return { ok: true, message: "Category added." };
  });
}

export async function updateCategory(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("categories.manage");
    const id = String(fd.get("id"));
    const parsed = categorySchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);
    const current = await db.category.findUnique({ where: { id } });
    if (!current) return { error: "Category not found." };
    const clash = await db.category.findFirst({
      where: { name: { equals: parsed.data.name, mode: "insensitive" }, id: { not: id } },
    });
    if (clash) return { error: "Another category already uses that name." };
    await db.$transaction(async (tx) => {
      await tx.category.update({ where: { id }, data: parsed.data });
      await writeAudit(
        { user, action: "CATEGORY_UPDATED", entityType: "Category", entityId: id,
          summary: `${user.name} edited category "${current.name}"${current.name !== parsed.data.name ? ` (now "${parsed.data.name}")` : ""}`,
          oldValue: { name: current.name, description: current.description }, newValue: parsed.data },
        tx,
      );
    });
    revalidatePath("/categories");
    return { ok: true, message: "Category saved." };
  });
}

export async function setCategoryActive(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("categories.manage");
    const id = String(fd.get("id"));
    const isActive = fd.get("isActive") === "true";
    const c = await db.category.findUnique({ where: { id } });
    if (!c) return { error: "Category not found." };
    await db.$transaction(async (tx) => {
      await tx.category.update({ where: { id }, data: { isActive } });
      await writeAudit(
        { user, action: "CATEGORY_UPDATED", entityType: "Category", entityId: id,
          summary: `${user.name} ${isActive ? "activated" : "deactivated"} category "${c.name}"`,
          oldValue: { isActive: c.isActive }, newValue: { isActive } },
        tx,
      );
    });
    revalidatePath("/categories");
    return { ok: true };
  });
}

export async function moveCategory(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("categories.manage");
    const id = String(fd.get("id"));
    const dir = fd.get("direction") === "up" ? -1 : 1;
    const all = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const i = all.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return { ok: true };
    [all[i], all[j]] = [all[j], all[i]];
    await db.$transaction(async (tx) => {
      for (let n = 0; n < all.length; n++) {
        if (all[n].sortOrder !== n) await tx.category.update({ where: { id: all[n].id }, data: { sortOrder: n } });
      }
      await writeAudit(
        { user, action: "CATEGORY_REORDERED", entityType: "Category", entityId: id, summary: `${user.name} moved category "${all[j].name}" ${dir < 0 ? "up" : "down"}` },
        tx,
      );
    });
    revalidatePath("/categories");
    return { ok: true };
  });
}
