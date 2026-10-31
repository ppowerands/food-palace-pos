import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { OrderTypeKey } from "@/lib/pricing";
import type { PosCategory, WebConfig } from "@/lib/pos-types";
import { WebOrderClient } from "@/components/web-order-client";

export const metadata = { title: "Order online" };
export const dynamic = "force-dynamic";

export default async function OrderPage() {
  const s = await getSettings();
  const header = (
    <header className="border-b border-paper-300 bg-palm-900 text-paper-100">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-400 font-display font-bold text-palm-950">FP</div>}
        <div>
          <h1 className="font-display text-xl font-semibold leading-tight">{s.name}</h1>
          <p className="text-xs text-paper-100/70">Order online. Pay the restaurant when you collect or receive your food.</p>
        </div>
      </div>
    </header>
  );

  const types = ([s.enablePickup && "PICKUP", s.enableDelivery && "DELIVERY", s.enableDineIn && "DINE_IN"].filter(Boolean)) as OrderTypeKey[];
  if (!s.onlineOrderingEnabled || types.length === 0) {
    return (
      <div className="min-h-screen bg-paper-50">
        {header}
        <p className="panel mx-auto mt-10 max-w-md p-6 text-center">Online ordering is closed right now.{s.phone ? ` Please call us on ${s.phone}.` : ""}</p>
      </div>
    );
  }

  const rows = await db.category.findMany({
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
  });
  // Only what customers need. No stock numbers, no cost prices.
  const categories: PosCategory[] = rows
    .map((c) => ({
      id: c.id, name: c.name,
      products: c.products.map((p) => {
        const stock = p.trackStock ? p.inventoryItem?.quantity ?? 0 : null;
        return {
          id: p.id, name: p.name, description: p.description, imageUrl: p.imageUrl, price: Number(p.price.toString()),
          variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: Number(v.price.toString()) })),
          addons: p.addons.map((a) => ({ id: a.id, name: a.name, price: Number(a.price.toString()) })),
          trackStock: false, stock: null, lowStock: false,
          soldOut: s.enforceStock && stock !== null && stock <= 0,
        };
      }),
    }))
    .filter((c) => c.products.length > 0);

  const config: WebConfig = {
    symbol: s.currencySymbol, enabledTypes: types, taxName: s.taxName,
    pricing: {
      deliveryFee: Number(s.defaultDeliveryFee.toString()), taxEnabled: s.taxEnabled, taxRate: Number(s.taxRate.toString()),
      serviceChargeEnabled: s.serviceChargeEnabled, serviceChargeRate: Number(s.serviceChargeRate.toString()),
    },
  };

  return (
    <div className="min-h-screen bg-paper-50">
      {header}
      <main className="p-3 sm:p-6"><WebOrderClient categories={categories} config={config} /></main>
    </div>
  );
}
