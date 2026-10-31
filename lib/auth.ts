import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { PermissionKey, RoleName } from "@/lib/permissions";

export const SESSION_COOKIE = "fp_session";
const SESSION_DAYS = 7;

export class AuthError extends Error {}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  roleName: RoleName;
  roleLabel: string;
  permissions: PermissionKey[];
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Used so a wrong email takes as long as a wrong password (avoids revealing which emails exist).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string | null | undefined) =>
  bcrypt.compare(password, hash ?? DUMMY_HASH);

export async function clientIp() {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const h = await headers();
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
      ip: await clientIp(),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export const getSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;

  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }

  const { user } = session;
  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    roleName: user.role.name as RoleName,
    roleLabel: user.role.label,
    permissions: user.role.permissions.map((rp) => rp.permission.key as PermissionKey),
  };
  return { sessionId: session.id, user: sessionUser };
});

/** For pages and layouts: redirects to /login when signed out. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

/** For pages: redirects to the dashboard when the role lacks the permission. */
export async function requirePermission(key: PermissionKey) {
  const user = await requireUser();
  if (!user.permissions.includes(key)) redirect("/dashboard");
  return user;
}

/** For server actions: throws AuthError (caught and shown as a message). Never trust the client. */
export async function authorize(key?: PermissionKey) {
  const session = await getSession();
  if (!session) throw new AuthError("Your session has expired. Please sign in again.");
  if (key && !session.user.permissions.includes(key)) {
    throw new AuthError("You don't have permission to do that.");
  }
  return { ...session.user, sessionId: session.sessionId };
}
