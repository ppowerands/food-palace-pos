import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/auth";

type Client = Prisma.TransactionClient | typeof db;

const toJson = (v: unknown) =>
  v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

export async function writeAudit(
  input: {
    user: { id: string; name: string } | null;
    userName?: string;
    action: string;
    entityType: string;
    entityId?: string;
    summary: string;
    oldValue?: unknown;
    newValue?: unknown;
  },
  client: Client = db,
) {
  await client.auditLog.create({
    data: {
      userId: input.user?.id ?? null,
      userName: input.user?.name ?? input.userName ?? "System",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      oldValue: toJson(input.oldValue),
      newValue: toJson(input.newValue),
      ip: await clientIp(),
    },
  });
}
