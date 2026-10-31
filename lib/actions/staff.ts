"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { authorize, hashPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ROLE_NAMES } from "@/lib/permissions";
import { createStaffSchema } from "@/lib/validation";
import { handle, validationError } from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/types";

async function activeOwnerCountExcluding(userId: string) {
  return db.user.count({ where: { isActive: true, role: { name: "OWNER" }, id: { not: userId } } });
}

export async function createStaff(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const me = await authorize("staff.manage");
    const parsed = createStaffSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);

    if (await db.user.findUnique({ where: { email: parsed.data.email } })) {
      return { error: "A staff account with that email already exists." };
    }
    const role = await db.role.findUniqueOrThrow({ where: { name: parsed.data.role } });
    const passwordHash = await hashPassword(parsed.data.password);

    await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { name: parsed.data.name, email: parsed.data.email, passwordHash, roleId: role.id },
      });
      await writeAudit(
        { user: me, action: "STAFF_CREATED", entityType: "User", entityId: u.id,
          summary: `${me.name} created ${role.label} account for ${u.name}`,
          newValue: { name: u.name, email: u.email, role: role.name } },
        tx,
      );
    });
    revalidatePath("/staff");
    return { ok: true, message: `${parsed.data.name} can now sign in.` };
  });
}

export async function changeStaffRole(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const me = await authorize("staff.manage");
    const userId = String(fd.get("userId"));
    const roleName = String(fd.get("role"));
    if (!(ROLE_NAMES as readonly string[]).includes(roleName)) return { error: "Choose a valid role." };

    const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!target) return { error: "Staff member not found." };
    if (target.role.name === roleName) return { ok: true, message: "No changes to save." };
    if (target.id === me.id) return { error: "You can't change your own role." };
    if (target.role.name === "OWNER" && (await activeOwnerCountExcluding(target.id)) === 0) {
      return { error: "There must always be at least one active owner." };
    }

    const role = await db.role.findUniqueOrThrow({ where: { name: roleName } });
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { roleId: role.id } });
      await writeAudit(
        { user: me, action: "STAFF_ROLE_CHANGED", entityType: "User", entityId: userId,
          summary: `${me.name} changed ${target.name} from ${target.role.label} to ${role.label}`,
          oldValue: { role: target.role.name }, newValue: { role: role.name } },
        tx,
      );
    });
    revalidatePath("/staff");
    return { ok: true, message: "Role updated." };
  });
}

export async function setStaffActive(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const me = await authorize("staff.manage");
    const userId = String(fd.get("userId"));
    const isActive = fd.get("isActive") === "true";

    const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!target) return { error: "Staff member not found." };
    if (target.id === me.id) return { error: "You can't deactivate your own account." };
    if (!isActive && target.role.name === "OWNER" && (await activeOwnerCountExcluding(target.id)) === 0) {
      return { error: "There must always be at least one active owner." };
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive } });
      if (!isActive) await tx.session.deleteMany({ where: { userId } }); // sign them out everywhere
      await writeAudit(
        { user: me, action: isActive ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED", entityType: "User", entityId: userId,
          summary: `${me.name} ${isActive ? "reactivated" : "deactivated"} ${target.name}`,
          oldValue: { isActive: target.isActive }, newValue: { isActive } },
        tx,
      );
    });
    revalidatePath("/staff");
    return { ok: true };
  });
}

export async function revokeStaffSessions(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const me = await authorize("staff.manage");
    const userId = String(fd.get("userId"));
    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) return { error: "Staff member not found." };
    const { count } = await db.session.deleteMany({ where: { userId } });
    await writeAudit({
      user: me, action: "SESSIONS_REVOKED", entityType: "User", entityId: userId,
      summary: `${me.name} signed ${target.name} out of ${count} device(s)`,
    });
    revalidatePath("/staff");
    return { ok: true, message: count ? `Signed out of ${count} device(s).` : "They weren't signed in anywhere." };
  });
}
