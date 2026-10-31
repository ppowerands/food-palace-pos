"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { changedFields } from "@/lib/utils";
import { customerSchema } from "@/lib/validation-catalog";
import { handle, validationError } from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/types";

function prepare(fd: FormData) {
  const parsed = customerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: validationError(parsed.error) } as const;
  const phone = normalizePhone(parsed.data.phone);
  if (parsed.data.phone && !phone) {
    return { error: { error: "Please fix the fields below.", fieldErrors: { phone: ["Enter a valid phone number"] } } as ActionState } as const;
  }
  return { data: { ...parsed.data, phone } } as const;
}

export async function createCustomer(_p: ActionState, fd: FormData): Promise<ActionState> {
  const out: { id?: string } = {};
  const result = await handle(async () => {
    const user = await authorize("customers.manage");
    const p = prepare(fd);
    if ("error" in p) return p.error;
    if (p.data.phone) {
      const clash = await db.customer.findUnique({ where: { phone: p.data.phone } });
      if (clash) return { error: `A customer with that phone number already exists (${clash.name}).` };
    }
    await db.$transaction(async (tx) => {
      const c = await tx.customer.create({ data: p.data });
      out.id = c.id;
      await writeAudit(
        { user, action: "CUSTOMER_CREATED", entityType: "Customer", entityId: c.id, summary: `${user.name} added customer ${c.name}`, newValue: p.data },
        tx,
      );
    });
    revalidatePath("/customers");
    return { ok: true };
  });
  if (out.id) redirect(`/customers/${out.id}`);
  return result;
}

export async function updateCustomer(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("customers.manage");
    const id = String(fd.get("id"));
    const p = prepare(fd);
    if ("error" in p) return p.error;
    const current = await db.customer.findUnique({ where: { id } });
    if (!current) return { error: "Customer not found." };
    if (p.data.phone) {
      const clash = await db.customer.findFirst({ where: { phone: p.data.phone, id: { not: id } } });
      if (clash) return { error: `Another customer already uses that phone number (${clash.name}).` };
    }
    const diff = changedFields(current as unknown as Record<string, unknown>, p.data);
    if (diff.changed.length === 0) return { ok: true, message: "No changes to save." };
    await db.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: p.data });
      await writeAudit(
        { user, action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: id,
          summary: `${user.name} updated customer ${current.name}: ${diff.changed.join(", ")}`, oldValue: diff.oldValue, newValue: diff.newValue },
        tx,
      );
    });
    // Old orders keep the name, phone and address they were placed with.
    revalidatePath(`/customers/${id}`);
    revalidatePath("/customers");
    return { ok: true, message: "Customer saved." };
  });
}
