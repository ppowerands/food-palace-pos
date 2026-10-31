"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Minus, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { placeWebsiteOrder } from "@/lib/actions/public-orders";
import { computeTotals, type OrderTypeKey } from "@/lib/pricing";
import { formatMoney } from "@/lib/money";
import { newKey } from "@/lib/ids";
import { TYPE_LABEL } from "@/lib/status";
import type { PosAddon, PosCategory, PosProduct, PosVariant, WebConfig } from "@/lib/pos-types";
import { Picker } from "@/components/product-picker";
import { cn } from "@/lib/utils";

type CartLine = { key: string; product: PosProduct; variant: PosVariant | null; addons: PosAddon[]; quantity: number; note: string };
const lineKey = (p: PosProduct, v: PosVariant | null, a: PosAddon[], note: string) =>
  [p.id, v?.id ?? "", a.map((x) => x.id).sort().join(","), note.trim()].join("|");

export function WebOrderClient({ categories, config }: { categories: PosCategory[]; config: WebConfig }) {
  const router = useRouter();
  const money = (n: number) => formatMoney(n, config.symbol);

  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "all");
  const [search, setSearch] = useState("");
  const [picker, setPicker] = useState<PosProduct | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [step, setStep] = useState<"cart" | "details" | "review">("cart");

  const [type, setType] = useState<OrderTypeKey>(config.enabledTypes[0] ?? "PICKUP");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [table, setTable] = useState("");
  const [note, setNote] = useState("");
  const [company, setCompany] = useState(""); // honeypot: hidden from people, bots fill it in

  const [idempotencyKey] = useState(newKey);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lastOrder, setLastOrder] = useState<string | null>(null);
  useEffect(() => {
    try {
      setLastOrder(localStorage.getItem("fp_last_order"));
    } catch {
      /* private mode: no saved order link */
    }
  }, []);

  const totals = useMemo(
    () => computeTotals(cart.map((l) => ({ unitPrice: l.variant?.price ?? l.product.price, addonsPerUnit: l.addons.reduce((s, a) => s + a.price, 0), quantity: l.quantity })), config.pricing, type, null),
    [cart, config.pricing, type],
  );
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);

  const detailProblems: string[] = [];
  if (type !== "DINE_IN" && !name.trim()) detailProblems.push("Enter your name.");
  if (type !== "DINE_IN" && !phone.trim()) detailProblems.push("Enter your phone number.");
  if (type === "DELIVERY" && !address.trim()) detailProblems.push("Enter your delivery address.");
  if (type === "DINE_IN" && !table.trim()) detailProblems.push("Enter your table number.");

  function addToCart(product: PosProduct, variant: PosVariant | null, addons: PosAddon[], quantity: number, lineNote: string) {
    const key = lineKey(product, variant, addons, lineNote);
    setCart((c) => {
      const existing = c.find((l) => l.key === key);
      if (existing) return c.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, l.quantity + quantity) } : l));
      return [...c, { key, product, variant, addons, quantity, note: lineNote.trim() }];
    });
  }
  function clickProduct(p: PosProduct) {
    if (p.soldOut) return;
    if (p.variants.length > 0 || p.addons.length > 0) setPicker(p);
    else addToCart(p, null, [], 1, "");
  }
  const changeQty = (key: string, delta: number) =>
    setCart((c) => c.flatMap((l) => (l.key !== key ? [l] : l.quantity + delta <= 0 ? [] : [{ ...l, quantity: Math.min(99, l.quantity + delta) }])));

  function placeOrder() {
    setError(null);
    startTransition(async () => {
      const res = await placeWebsiteOrder({
        idempotencyKey, type, customerName: name, customerPhone: phone, deliveryAddress: address, deliveryInstructions: instructions,
        tableNumber: table, note, expectedTotal: totals.total, company,
        items: cart.map((l) => ({ productId: l.product.id, variantId: l.variant?.id ?? null, addonIds: l.addons.map((a) => a.id), quantity: l.quantity, note: l.note })),
      });
      if (res.ok) {
        try {
          localStorage.setItem("fp_last_order", res.trackingToken);
        } catch {
          /* ignore */
        }
        router.push(`/track/${res.trackingToken}?placed=1`);
      } else {
        setError(res.error);
      }
    });
  }

  const q = search.trim().toLowerCase();
  const visible = q
    ? categories.flatMap((c) => c.products).filter((p) => p.name.toLowerCase().includes(q))
    : categoryId === "all" ? categories.flatMap((c) => c.products) : categories.find((c) => c.id === categoryId)?.products ?? [];

  const Totals = () => (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between"><dt className="text-ink-600">Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
      {config.pricing.serviceChargeEnabled && type === "DINE_IN" && <div className="flex justify-between"><dt className="text-ink-600">Service charge</dt><dd>{money(totals.serviceChargeAmount)}</dd></div>}
      {config.pricing.taxEnabled && <div className="flex justify-between"><dt className="text-ink-600">{config.taxName} ({config.pricing.taxRate}%)</dt><dd>{money(totals.taxAmount)}</dd></div>}
      {type === "DELIVERY" && <div className="flex justify-between"><dt className="text-ink-600">Delivery fee</dt><dd>{money(totals.deliveryFee)}</dd></div>}
      <div className="flex justify-between border-t border-paper-300 pt-2 font-display text-xl font-semibold"><dt>Total</dt><dd>{money(totals.total)}</dd></div>
    </dl>
  );

  if (categories.length === 0) return <p className="panel mx-auto max-w-lg p-6 text-center text-sm">The menu isn't available right now. Please check back soon.</p>;

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 space-y-3">
        {lastOrder && <Link href={`/track/${lastOrder}`} className="block rounded-lg bg-gold-50 px-3 py-2 text-sm font-medium text-gold-600 ring-1 ring-gold-200">Track your last order</Link>}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-600" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu" className="input pl-9" aria-label="Search the menu" />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ id: "all", name: "All" }, ...categories].map((c) => (
            <button key={c.id} onClick={() => { setCategoryId(c.id); setSearch(""); }} className={cn("min-h-[44px] whitespace-nowrap rounded-full px-4 text-sm font-semibold", !q && categoryId === c.id ? "bg-palm-900 text-paper-100" : "bg-white ring-1 ring-paper-300")}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 pb-24 sm:grid-cols-3 lg:pb-0">
          {visible.length === 0 && <p className="col-span-full p-4 text-sm text-ink-600">Nothing matches your search.</p>}
          {visible.map((p) => {
            const from = p.variants.length > 0 ? Math.min(...p.variants.map((v) => v.price)) : p.price;
            return (
              <button key={p.id} onClick={() => clickProduct(p)} disabled={p.soldOut} className="overflow-hidden rounded-xl border border-paper-300 bg-white text-left transition hover:border-gold-500 disabled:opacity-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-paper-200 font-display text-3xl text-ink-600">{p.name[0]}</div>}
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</p>
                  {p.description && <p className="line-clamp-2 text-xs text-ink-600">{p.description}</p>}
                  <p className="mt-1 text-sm font-medium">{p.variants.length > 0 ? "from " : ""}{money(from)}</p>
                  {p.soldOut && <p className="text-xs font-semibold text-chili-600">Sold out</p>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <aside className={cn("flex min-h-0 flex-col bg-white lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:rounded-xl lg:border lg:border-paper-300", panelOpen ? "fixed inset-0 z-40" : "hidden lg:flex")}>
        <div className="flex items-center justify-between border-b border-paper-300 p-3">
          <h2 className="font-display text-lg font-semibold">{step === "cart" ? "Your order" : step === "details" ? "Your details" : "Review your order"}</h2>
          <button className="rounded p-2 hover:bg-paper-100 lg:hidden" aria-label="Close" onClick={() => setPanelOpen(false)}><X className="h-5 w-5" /></button>
        </div>

        {step === "cart" && (
          <>
            <div className="flex-1 overflow-y-auto p-3">
              {cart.length === 0 ? <p className="rounded-lg bg-paper-100 p-4 text-center text-sm text-ink-600">Your order is empty. Tap a dish to add it.</p> : (
                <ul className="divide-y divide-paper-200">
                  {cart.map((l) => {
                    const unit = (l.variant?.price ?? l.product.price) + l.addons.reduce((s, a) => s + a.price, 0);
                    return (
                      <li key={l.key} className="py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{l.product.name}{l.variant ? ` · ${l.variant.name}` : ""}</p>
                            {l.addons.length > 0 && <p className="text-xs text-ink-600">+ {l.addons.map((a) => a.name).join(", ")}</p>}
                            {l.note && <p className="text-xs italic text-ink-600">{l.note}</p>}
                          </div>
                          <p className="text-sm font-semibold">{money(unit * l.quantity)}</p>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <button aria-label="Decrease quantity" className="grid h-9 w-9 place-items-center rounded-lg ring-1 ring-paper-300" onClick={() => changeQty(l.key, -1)}><Minus className="h-4 w-4" /></button>
                          <span className="w-8 text-center text-sm font-semibold">{l.quantity}</span>
                          <button aria-label="Increase quantity" className="grid h-9 w-9 place-items-center rounded-lg ring-1 ring-paper-300" onClick={() => changeQty(l.key, 1)}><Plus className="h-4 w-4" /></button>
                          <button aria-label="Remove" className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-chili-600" onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="space-y-3 border-t border-paper-300 p-3">
              <p className="text-xs text-ink-600">Delivery fee, tax and service charge (if any) are added at the next steps.</p>
              <div className="flex justify-between font-display text-lg font-semibold"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
              <button className="btn btn-primary w-full" disabled={cart.length === 0} onClick={() => setStep("details")}>Continue</button>
            </div>
          </>
        )}

        {step === "details" && (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              <div>
                <p className="label">How would you like your order?</p>
                <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-paper-100 p-1">
                  {config.enabledTypes.map((t) => (
                    <button key={t} onClick={() => setType(t)} className={cn("min-h-[40px] rounded-md text-sm font-semibold", type === t ? "bg-white shadow-sm" : "text-ink-600")}>{TYPE_LABEL[t]}</button>
                  ))}
                </div>
              </div>
              <input className="input" placeholder={type === "DINE_IN" ? "Your name (optional)" : "Your name"} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              {type !== "DINE_IN" && <input className="input" type="tel" inputMode="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />}
              {type === "DELIVERY" && (
                <>
                  <input className="input" placeholder="Delivery address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
                  <input className="input" placeholder="Delivery instructions (optional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
                </>
              )}
              {type === "DINE_IN" && <input className="input" placeholder="Table number" value={table} onChange={(e) => setTable(e.target.value)} />}
              <input className="input" placeholder="Anything we should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" name="company" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="space-y-2 border-t border-paper-300 p-3">
              {detailProblems.length > 0 && <p className="text-xs text-chili-600">{detailProblems[0]}</p>}
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button className="btn btn-secondary" onClick={() => setStep("cart")}>Back</button>
                <button className="btn btn-primary" disabled={detailProblems.length > 0} onClick={() => setStep("review")}>Review order</button>
              </div>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
              <section>
                <p className="label">{TYPE_LABEL[type]}</p>
                <p className="font-medium">{name.trim() || (type === "DINE_IN" ? `Table ${table}` : "")}</p>
                {phone.trim() && type !== "DINE_IN" && <p className="text-ink-600">{phone}</p>}
                {type === "DELIVERY" && <p className="text-ink-600">{address}{instructions ? ` (${instructions})` : ""}</p>}
                {type === "DINE_IN" && <p className="text-ink-600">Table {table}</p>}
                {note && <p className="text-ink-600">Note: {note}</p>}
              </section>
              <section>
                <p className="label">Items</p>
                <ul className="divide-y divide-paper-200">
                  {cart.map((l) => {
                    const unit = (l.variant?.price ?? l.product.price) + l.addons.reduce((s, a) => s + a.price, 0);
                    return (
                      <li key={l.key} className="flex justify-between gap-2 py-1.5">
                        <span>{l.quantity} × {l.product.name}{l.variant ? ` (${l.variant.name})` : ""}{l.addons.length ? ` + ${l.addons.map((a) => a.name).join(", ")}` : ""}</span>
                        <span>{money(unit * l.quantity)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
              <p className="rounded-lg bg-gold-50 p-3 text-gold-600">No payment is needed here. Payment will be handled by the restaurant.</p>
            </div>
            <div className="space-y-3 border-t border-paper-300 p-3">
              <Totals />
              {error && <p role="alert" className="rounded-lg bg-chili-50 p-2 text-sm text-chili-600">{error}</p>}
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button className="btn btn-secondary" disabled={pending} onClick={() => setStep("details")}>Edit</button>
                <button className="btn btn-primary" disabled={pending} onClick={placeOrder}>{pending ? "Sending…" : "Place order"}</button>
              </div>
            </div>
          </>
        )}
      </aside>

      {!panelOpen && itemCount > 0 && (
        <button className="btn btn-primary fixed inset-x-3 bottom-3 z-30 justify-between lg:hidden" onClick={() => setPanelOpen(true)}>
          <span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> View order · {itemCount} item{itemCount === 1 ? "" : "s"}</span>
          <span>{money(totals.subtotal)}</span>
        </button>
      )}
      {picker && <Picker product={picker} money={money} onClose={() => setPicker(null)} onAdd={(v, a, qty, n) => { addToCart(picker, v, a, qty, n); setPicker(null); }} />}
    </div>
  );
}
