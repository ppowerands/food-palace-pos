"use server";

import { revalidatePath } from "next/cache";
import type { RestaurantSettings } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { authorize, AuthError } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { changedFields, humanize } from "@/lib/utils";
import { ALL_PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import {
  billingSchema, discountSchema, orderSettingsSchema, paymentMethodSchema, receiptSchema, restaurantSchema,
} from "@/lib/validation";
import { handle, validationError } from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/types";

type Parsed = Record<string, unknown>;

async function saveSection(
  label: string,
  schema: z.ZodTypeAny,
  formData: FormData,
  extraCheck?: (data: Parsed, current: RestaurantSettings) => string | null,
): Promise<ActionState> {
  const user = await authorize("settings.manage");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const current = await getSettings();
  const problem = extraCheck?.(parsed.data, current);
  if (problem) return { error: problem };

  const diff = changedFields(current as unknown as Parsed, parsed.data);
  if (diff.changed.length === 0) return { ok: true, message: "No changes to save." };

  await db.$transaction(async (tx) => {
    await tx.restaurantSettings.update({ where: { id: 1 }, data: { ...parsed.data, updatedById: user.id } });
    await writeAudit(
      {
        user,
        action: "SETTINGS_UPDATED",
        entityType: "RestaurantSettings",
        entityId: "1",
        summary: `${user.name} updated ${label.toLowerCase()}: ` +
          diff.changed.map((k) => `${humanize(k)} ${String(diff.oldValue[k] ?? "empty")} → ${String(diff.newValue[k] ?? "empty")}`).join(", "),
        oldValue: diff.oldValue,
        newValue: diff.newValue,
      },
      tx,
    );
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `${label} saved.` };
}

export async function saveRestaurant(_p: ActionState, fd: FormData) {
  return handle(() => saveSection("Restaurant details", restaurantSchema, fd));
}

export async function saveOrderSettings(_p: ActionState, fd: FormData) {
  return handle(() =>
    saveSection("Order settings", orderSettingsSchema, fd, (data, current) => {
      if (!data.enablePickup && !data.enableDelivery && !data.enableDineIn) {
        return "Keep at least one order type enabled.";
      }
      if (Number(data.nextOrderNumber) < current.nextOrderNumber) {
        return `Order numbers can't go backwards. The next number must be ${current.nextOrderNumber} or higher.`;
      }
      return null;
    }),
  );
}

export async function saveBilling(_p: ActionState, fd: FormData) {
  return handle(() => saveSection("Billing settings", billingSchema, fd));
}

export async function saveReceipt(_p: ActionState, fd: FormData) {
  return handle(() => saveSection("Receipt settings", receiptSchema, fd));
}

// ── Discounts ──

export async function createDiscount(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("settings.manage");
    const parsed = discountSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);
    await db.$transaction(async (tx) => {
      const d = await tx.discount.create({ data: parsed.data });
      await writeAudit(
        { user, action: "DISCOUNT_CREATED", entityType: "Discount", entityId: d.id,
          summary: `${user.name} created discount "${d.name}" (${d.type === "PERCENT" ? `${d.value}%` : `₦${d.value}`})`, newValue: parsed.data },
        tx,
      );
    });
    revalidatePath("/settings");
    return { ok: true, message: "Discount added." };
  });
}

export async function setDiscountActive(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("settings.manage");
    const id = String(fd.get("id"));
    const isActive = fd.get("isActive") === "true";
    const d = await db.discount.findUnique({ where: { id } });
    if (!d) return { error: "Discount not found." };
    await db.$transaction(async (tx) => {
      await tx.discount.update({ where: { id }, data: { isActive } });
      await writeAudit(
        { user, action: "DISCOUNT_UPDATED", entityType: "Discount", entityId: id,
          summary: `${user.name} ${isActive ? "activated" : "deactivated"} discount "${d.name}"`,
          oldValue: { isActive: d.isActive }, newValue: { isActive } },
        tx,
      );
    });
    revalidatePath("/settings");
    return { ok: true };
  });
}

// ── Payment methods ──

export async function createPaymentMethod(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("settings.manage");
    const parsed = paymentMethodSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);
    const code = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!code) return { error: "Use letters or numbers in the name." };
    if (await db.paymentMethod.findUnique({ where: { code } })) return { error: "A payment method with that name already exists." };
    const count = await db.paymentMethod.count();
    await db.$transaction(async (tx) => {
      const m = await tx.paymentMethod.create({
        data: { code, name: parsed.data.name, requiresReference: parsed.data.requiresReference, sortOrder: count + 1 },
      });
      await writeAudit(
        { user, action: "PAYMENT_METHOD_CREATED", entityType: "PaymentMethod", entityId: m.id,
          summary: `${user.name} added payment method "${m.name}"`, newValue: parsed.data },
        tx,
      );
    });
    revalidatePath("/settings");
    return { ok: true, message: "Payment method added." };
  });
}

export async function setPaymentMethodEnabled(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("settings.manage");
    const id = String(fd.get("id"));
    const isEnabled = fd.get("isEnabled") === "true";
    const m = await db.paymentMethod.findUnique({ where: { id } });
    if (!m) return { error: "Payment method not found." };
    if (!isEnabled && (await db.paymentMethod.count({ where: { isEnabled: true, id: { not: id } } })) === 0) {
      return { error: "Keep at least one payment method enabled." };
    }
    await db.$transaction(async (tx) => {
      await tx.paymentMethod.update({ where: { id }, data: { isEnabled } });
      await writeAudit(
        { user, action: "PAYMENT_METHOD_UPDATED", entityType: "PaymentMethod", entityId: id,
          summary: `${user.name} ${isEnabled ? "enabled" : "disabled"} payment method "${m.name}"`,
          oldValue: { isEnabled: m.isEnabled }, newValue: { isEnabled } },
        tx,
      );
    });
    revalidatePath("/settings");
    return { ok: true };
  });
}

// ── Role permissions ──

export async function saveRolePermissions(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("staff.manage");
    if (user.roleName !== "OWNER") throw new AuthError("Only the owner can change role permissions.");

    const roleName = String(fd.get("roleName"));
    if (roleName !== "MANAGER" && roleName !== "CASHIER") return { error: "That role can't be edited." };

    const requested = new Set(
      fd.getAll("perm").map(String).filter((k): k is PermissionKey => (ALL_PERMISSIONS as string[]).includes(k)),
    );
    requested.add("dashboard.view"); // everyone needs somewhere to land

    const role = await db.role.findUniqueOrThrow({
      where: { name: roleName },
      include: { permissions: { include: { permission: true } } },
    });
    const before = role.permissions.map((p) => p.permission.key).sort();
    const after = [...requested].sort();
    if (JSON.stringify(before) === JSON.stringify(after)) return { ok: true, message: "No changes to save." };

    const perms = await db.permission.findMany({ where: { key: { in: after } } });
    await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
      await writeAudit(
        { user, action: "ROLE_PERMISSIONS_UPDATED", entityType: "Role", entityId: role.id,
          summary: `${user.name} changed permissions for ${role.label}: +${after.filter((k) => !before.includes(k)).length} / −${before.filter((k) => !after.includes(k)).length}`,
          oldValue: { permissions: before }, newValue: { permissions: after } },
        tx,
      );
    });
    revalidatePath("/settings");
    return { ok: true, message: `${role.label} permissions saved.` };
  });
}
