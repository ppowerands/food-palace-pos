// Run with: npm run db:check
// Checks the database and settings the app depends on, and prints what is wrong in plain words.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
let problems = 0;
const ok = (m: string) => console.log(`  OK    ${m}`);
const warn = (m: string) => { problems++; console.log(`  WARN  ${m}`); };

async function main() {
  console.log("\nFood Palace check\n");

  // 1. Connection speed. Creating an order is about 15 queries inside one transaction.
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    await db.$queryRaw`SELECT 1`;
    times.push(Date.now() - t);
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  if (avg > 400) warn(`Database round trip is slow (${avg} ms each). Use a database region closer to you. The app now allows long transactions, but pages will feel slow.`);
  else ok(`Database reachable, ${avg} ms per query`);

  const t0 = Date.now();
  await db.$transaction(async (tx) => {
    for (let i = 0; i < 15; i++) await tx.$queryRaw`SELECT 1`;
  });
  const txMs = Date.now() - t0;
  txMs > 4500 ? warn(`A 15-query transaction took ${txMs} ms. That is close to Prisma's old 5 second limit, which is what made orders fail.`) : ok(`A 15-query transaction takes ${txMs} ms`);

  // 2. The columns and rows added for online ordering
  const cols = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name = 'Order' AND column_name IN ('source', 'trackingToken', 'createdById'))
       OR (table_name = 'RestaurantSettings' AND column_name = 'onlineOrderingEnabled')`;
  const has = (t: string, c: string) => cols.some((x) => x.table_name === t && x.column_name === c);
  for (const [t, c] of [["Order", "source"], ["Order", "trackingToken"], ["RestaurantSettings", "onlineOrderingEnabled"]] as const) {
    has(t, c) ? ok(`${t}.${c} exists`) : warn(`${t}.${c} is missing. Run: npx prisma migrate dev --name customer_ordering`);
  }
  const nullable = await db.$queryRaw<{ is_nullable: string }[]>`
    SELECT is_nullable FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'createdById'`;
  nullable[0]?.is_nullable === "YES" ? ok("Orders can be created without a staff member (website orders)") : warn("Order.createdById still requires a staff member, so website orders will fail. Run the migration.");

  // 3. Protection triggers
  const triggers = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'fp\\_%'`;
  (triggers[0]?.n ?? 0) > 0 ? ok(`${triggers[0].n} data-protection triggers installed`) : warn("Data-protection triggers are missing. Run: npm run db:guards");

  // 4. Settings and data the app needs
  const s = await db.restaurantSettings.findUnique({ where: { id: 1 } });
  if (!s) warn("Settings row missing. Run: npm run db:seed");
  else {
    ok(`Restaurant: ${s.name}, next order number ${s.nextOrderNumber}`);
    if (!s.enablePickup && !s.enableDelivery && !s.enableDineIn) warn("All order types are turned off in Settings > Orders.");
    if (!s.onlineOrderingEnabled) warn("Online ordering is turned off in Settings > Orders.");
  }
  const methods = await db.paymentMethod.count({ where: { isEnabled: true } });
  methods > 0 ? ok(`${methods} payment method(s) enabled`) : warn("No payment method is enabled (Settings > Payment methods).");
  const products = await db.product.count({ where: { isActive: true, category: { isActive: true } } });
  products > 0 ? ok(`${products} sellable product(s)`) : warn("No active products in an active category, so there is nothing to order.");
  const owner = await db.user.count({ where: { isActive: true, role: { name: "OWNER" } } });
  owner > 0 ? ok("An active owner account exists") : warn("No active owner account.");

  // 5. Realtime keys
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? ok("Realtime keys are set")
    : warn("Realtime keys are not set. Everything works, but screens check for updates every few seconds instead of instantly.");

  console.log(problems === 0 ? "\nAll good.\n" : `\n${problems} thing(s) to look at.\n`);
}

main()
  .catch((e) => {
    console.error("\nCould not finish the check:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
