import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Orders, payments and refunds are many small queries in one transaction. A remote database needs more than Prisma's 5s default.
    transactionOptions: { maxWait: 15_000, timeout: 60_000 },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
