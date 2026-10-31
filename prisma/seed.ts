// Bootstrap seed: safe for production. Creates roles, permissions, default settings,
// payment methods and (only if there are no users yet) the first owner account.
// Demo data (products, customers, orders) will live in a separate prisma/seed-demo.ts.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  PERMISSION_DEFS, ROLE_DEFAULTS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_NAMES,
} from "../lib/permissions";

const db = new PrismaClient();

async function main() {
  for (const p of PERMISSION_DEFS) {
    await db.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: { key: p.key, description: p.description },
    });
  }
  const permissions = await db.permission.findMany();
  const idByKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (const name of ROLE_NAMES) {
    const existing = await db.role.findUnique({ where: { name } });
    const role =
      existing ??
      (await db.role.create({ data: { name, label: ROLE_LABELS[name], description: ROLE_DESCRIPTIONS[name] } }));
    // Owner always gets everything (including new permissions added later).
    // Other roles get defaults only when first created, so edits made in Settings survive re-seeding.
    const keys = name === "OWNER" ? PERMISSION_DEFS.map((p) => p.key) : existing ? [] : ROLE_DEFAULTS[name];
    if (keys.length > 0) {
      await db.rolePermission.createMany({
        data: keys.map((k) => ({ roleId: role.id, permissionId: idByKey.get(k)! })),
        skipDuplicates: true,
      });
    }
  }

  await db.restaurantSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const methods = [
    { code: "cash", name: "Cash", requiresReference: false, sortOrder: 1 },
    { code: "transfer", name: "Bank transfer", requiresReference: true, sortOrder: 2 },
    { code: "card", name: "Card", requiresReference: true, sortOrder: 3 },
    { code: "other", name: "Other", requiresReference: false, sortOrder: 4 },
  ];
  for (const m of methods) {
    await db.paymentMethod.upsert({ where: { code: m.code }, update: {}, create: m });
  }

  if ((await db.user.count()) === 0) {
    const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env to create the first owner account.");
    }
    if (password.length < 8) throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters.");
    const owner = await db.role.findUniqueOrThrow({ where: { name: "OWNER" } });
    await db.user.create({
      data: {
        name: process.env.SEED_ADMIN_NAME || "Owner",
        email,
        passwordHash: await bcrypt.hash(password, 12),
        roleId: owner.id,
      },
    });
    console.log(`Created owner account: ${email}`);
  } else {
    console.log("Users already exist, skipping owner creation.");
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
