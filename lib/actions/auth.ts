"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  authorize, clientIp, createSession, destroyCurrentSession, getSession, hashPassword, verifyPassword,
} from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { changePasswordSchema, loginSchema } from "@/lib/validation";
import { handle, validationError } from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/types";

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };
  const email = parsed.data.email.toLowerCase();

  let signedIn = false;
  const result = await handle(async () => {
    // Slow down password guessing: too many recent failures for this email or from this address.
    const since = new Date(Date.now() - 15 * 60_000);
    const ip = await clientIp();
    const [byEmail, byIp] = await Promise.all([
      db.auditLog.count({ where: { action: "LOGIN_FAILED", userName: email, createdAt: { gte: since } } }),
      ip ? db.auditLog.count({ where: { action: "LOGIN_FAILED", ip, createdAt: { gte: since } } }) : Promise.resolve(0),
    ]);
    if (byEmail >= 8 || byIp >= 25) return { error: "Too many failed attempts. Please wait 15 minutes and try again." };

    const user = await db.user.findUnique({ where: { email } });
    const passwordOk = await verifyPassword(parsed.data.password, user?.passwordHash);
    if (!user || !passwordOk || !user.isActive) {
      await writeAudit({
        user: null,
        userName: email,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user?.id,
        summary: `Failed sign-in attempt for ${email}`,
      });
      return { error: "Incorrect email or password." };
    }
    await createSession(user.id);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAudit({
      user: { id: user.id, name: user.name },
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
      summary: `${user.name} signed in`,
    });
    signedIn = true;
    return undefined;
  });

  if (signedIn) redirect("/dashboard");
  return result;
}

export async function logout() {
  const session = await getSession();
  await destroyCurrentSession();
  if (session) {
    await writeAudit({
      user: session.user,
      action: "LOGOUT",
      entityType: "User",
      entityId: session.user.id,
      summary: `${session.user.name} signed out`,
    });
  }
  redirect("/login");
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return handle(async () => {
    const me = await authorize();
    const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return validationError(parsed.error);

    const record = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(parsed.data.current, record.passwordHash))) {
      return { error: "Your current password is incorrect." };
    }
    const passwordHash = await hashPassword(parsed.data.next);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: me.id }, data: { passwordHash } });
      // Sign out every other device
      await tx.session.deleteMany({ where: { userId: me.id, id: { not: me.sessionId } } });
      await writeAudit(
        { user: me, action: "PASSWORD_CHANGED", entityType: "User", entityId: me.id, summary: `${me.name} changed their password` },
        tx,
      );
    });
    return { ok: true, message: "Password changed. Other devices were signed out." };
  });
}

export async function signOutOtherSessions(): Promise<ActionState> {
  return handle(async () => {
    const me = await authorize();
    const { count } = await db.session.deleteMany({ where: { userId: me.id, id: { not: me.sessionId } } });
    await writeAudit({
      user: me, action: "SESSIONS_REVOKED", entityType: "User", entityId: me.id,
      summary: `${me.name} signed out ${count} other device(s)`,
    });
    return { ok: true, message: count ? `Signed out ${count} other device(s).` : "No other devices were signed in." };
  });
}
