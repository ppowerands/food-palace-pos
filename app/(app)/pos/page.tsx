import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import type { OrderTypeKey } from "@/lib/pricing";
import type { PosCategory, PosConfig, PosDiscount } from "@/lib/pos-types";
import { PosClient } from "@/components/pos-client";

export const metadata = { title: "POS" };
export const dynamic = "force-dynamic";

export default async function PosPage() {
  const user = await requirePermission("pos.use");
  const settings = await getSettings();
  const now = new Date();

  if (!user.permissions.includes("orders.create")) {
    return <p className="panel mx-auto max-w-lg p-6 text-sm">Your role can't create orders.</p>;
  }

  const [rows, discounts, methods] = await Promise.all([
    db.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        products: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
            addons: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
            inventoryItem: true,
          },
        },
      },
    }),
    db.discount.findMany({
      where: {
        isActive: true,
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { name: "asc" },
    }),
    db.paymentMethod.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  // Plain numbers and strings only: this object is sent to the browser.
  const categories: PosCategory[] = rows
    .map((c) => ({
      id: c.id,
      name: c.name,
      products: c.products.map((p) => {
        const stock = p.trackStock ? p.inventoryItem?.quantity ?? 0 : null;
        return {
          id: p.id, name: p.name, description: p.description, imageUrl: p.imageUrl, price: Number(p.price.toString()),
          variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: Number(v.price.toString()) })),
          addons: p.addons.map((a) => ({ id: a.id, name: a.name, price: Number(a.price.toString()) })),
          trackStock: p.trackStock, stock,
          lowStock: stock !== null && stock <= (p.inventoryItem?.lowStockThreshold ?? 0),
          soldOut: settings.enforceStock && stock !== null && stock <= 0,
        };
      }),
    }))
    .filter((c) => c.products.length > 0);

  const posDiscounts: PosDiscount[] = discounts.map((d) => ({ id: d.id, name: d.name, type: d.type, value: Number(d.value.toString()) }));
  const config: PosConfig = {
    methods: methods.map((m) => ({ id: m.id, name: m.name, code: m.code, requiresReference: m.requiresReference })),
    canTakePayment: user.permissions.includes("payments.process") && methods.length > 0,
    symbol: settings.currencySymbol,
    enabledTypes: ([settings.enablePickup && "PICKUP", settings.enableDelivery && "DELIVERY", settings.enableDineIn && "DINE_IN"].filter(Boolean)) as OrderTypeKey[],
    pricing: {
      deliveryFee: Number(settings.defaultDeliveryFee.toString()),
      taxEnabled: settings.taxEnabled, taxRate: Number(settings.taxRate.toString()),
      serviceChargeEnabled: settings.serviceChargeEnabled, serviceChargeRate: Number(settings.serviceChargeRate.toString()),
    },
    taxName: settings.taxName,
    startsAs: settings.defaultOrderStatus === "ACCEPTED" ? "Accepted" : "Pending",
  };

  return <PosClient categories={categories} discounts={posDiscounts} config={config} />;
}
