"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { createOrder } from "@/lib/actions/orders";
import { computeTotals, type OrderTypeKey } from "@/lib/pricing";
import { formatMoney } from "@/lib/money";
import { newKey } from "@/lib/ids";
import type { PosAddon, PosCategory, PosConfig, PosDiscount, PosProduct, PosVariant } from "@/lib/pos-types";
import { cn } from "@/lib/utils";
import { Picker } from "@/components/product-picker";

type CartLine = { key: string; product: PosProduct; variant: PosVariant | null; addons: PosAddon[]; quantity: number; note: string };
type FoundCustomer = { id: string; name: string; phone: string | null; address: string | null };

const TYPE_LABEL: Record<OrderTypeKey, string> = { PICKUP: "Pickup", DELIVERY: "Delivery", DINE_IN: "Dine-in" };

const lineKey = (p: PosProduct, v: PosVariant | null, a: PosAddon[], note: string) =>
  [p.id, v?.id ?? "", a.map((x) => x.id).sort().join(","), note.trim()].join("|");

export function PosClient({ categories, discounts, config }: { categories: PosCategory[]; discounts: PosDiscount[]; config: PosConfig }) {
  const router = useRouter();
  const money = (n: number) => formatMoney(n, config.symbol);

  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "all");
  const [search, setSearch] = useState("");
  const [picker, setPicker] = useState<PosProduct | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [type, setType] = useState<OrderTypeKey>(config.enabledTypes[0] ?? "PICKUP");
  const [customer, setCustomer] = useState<FoundCustomer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState<FoundCustomer[]>([]);
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [table, setTable] = useState("");
  const [note, setNote] = useState("");
  const [discountId, setDiscountId] = useState("");
  const [payNow, setPayNow] = useState(true);
  const [methodId, setMethodId] = useState(config.methods[0]?.id ?? "");
  const [payAmount, setPayAmount] = useState(""); // blank = the full total
  const [reference, setReference] = useState("");
  const [tendered, setTendered] = useState("");

  const [step, setStep] = useState<"build" | "review" | "done">("build");
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ orderId: string; orderCode: string; total: number; paid: number } | null>(null);
  const [pending, startTransition] = useTransition();

  // ── Customer lookup (name or phone) ──
  useEffect(() => {
    if (customer) {
      setResults([]);
      return;
    }
    const q = (phone.trim().length >= 3 ? phone : name).trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`);
        if (!r.ok) return;
        const j = (await r.json()) as { customers: FoundCustomer[] };
        if (!cancelled) setResults(j.customers);
      } catch {
        /* lookup is a convenience; ordering still works without it */
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name, phone, customer]);

  // ── Money (preview only: the server recalculates everything) ──
  const discount = discounts.find((d) => d.id === discountId) ?? null;
  const totals = useMemo(
    () =>
      computeTotals(
        cart.map((l) => ({ unitPrice: l.variant?.price ?? l.product.price, addonsPerUnit: l.addons.reduce((s, a) => s + a.price, 0), quantity: l.quantity })),
        config.pricing, type, discount ? { type: discount.type, value: discount.value } : null,
      ),
    [cart, config.pricing, type, discount],
  );
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);

  const displayName = customer?.name ?? (name.trim() || (type === "DINE_IN" ? (table.trim() ? `Table ${table.trim()}` : "Walk-in") : ""));
  const displayPhone = customer?.phone ?? phone.trim();
  const problems: string[] = [];
  if (cart.length === 0) problems.push("Add at least one item.");
  if (type !== "DINE_IN" && !displayName) problems.push("Enter the customer's name.");
  if (type === "DELIVERY") {
    if (!displayPhone) problems.push("A phone number is needed for delivery.");
    if (!address.trim()) problems.push("A delivery address is needed.");
  }

  const selectedMethod = config.methods.find((m) => m.id === methodId) ?? null;
  const payAmountNum = payAmount === "" ? totals.total : Number(payAmount);
  const payProblems: string[] = [];
  if (config.canTakePayment && payNow) {
    if (!selectedMethod) payProblems.push("Choose a payment method.");
    if (!(payAmountNum > 0)) payProblems.push("Enter the amount received.");
    else if (Math.round(payAmountNum * 100) > Math.round(totals.total * 100)) payProblems.push("The payment can't be more than the total.");
    if (selectedMethod?.requiresReference && !reference.trim()) payProblems.push(`${selectedMethod.name} needs a reference number.`);
  }
  const change = selectedMethod?.code === "cash" && Number(tendered) > payAmountNum ? Number(tendered) - payAmountNum : 0;

  // ── Cart actions ──
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

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await createOrder({
        idempotencyKey, type,
        customerId: customer?.id ?? null,
        customerName: customer ? "" : name, customerPhone: customer ? "" : phone,
        deliveryAddress: address, deliveryInstructions: instructions, tableNumber: table, note,
        discountId: discountId || null, expectedTotal: totals.total,
        payment: config.canTakePayment && payNow ? { methodId, amount: payAmountNum, reference: reference.trim() } : null,
        items: cart.map((l) => ({ productId: l.product.id, variantId: l.variant?.id ?? null, addonIds: l.addons.map((a) => a.id), quantity: l.quantity, note: l.note })),
      });
      if (res.ok) {
        setCreated({ orderId: res.orderId, orderCode: res.orderCode, total: res.total, paid: res.paid });
        setStep("done");
      } else {
        setError(res.error);
      }
    });
  }

  function startNewOrder() {
    setCart([]); setCustomer(null); setName(""); setPhone(""); setAddress(""); setInstructions(""); setTable(""); setNote("");
    setDiscountId(""); setPayNow(true); setPayAmount(""); setReference(""); setTendered(""); setError(null); setCreated(null); setStep("build"); setCartOpen(false);
    setIdempotencyKey(newKey());
    router.refresh(); // pick up new stock levels
  }

  // ── Products shown ──
  const q = search.trim().toLowerCase();
  const visible = q
    ? categories.flatMap((c) => c.products).filter((p) => p.name.toLowerCase().includes(q))
    : categoryId === "all"
      ? categories.flatMap((c) => c.products)
      : categories.find((c) => c.id === categoryId)?.products ?? [];

  if (categories.length === 0) {
    return (
      <div className="panel mx-auto max-w-lg p-6 text-sm">
        <p className="font-medium">There is nothing to sell yet.</p>
        <p className="mt-1 text-ink-600">Add a category and some active products first, then they will appear here.</p>
        <div className="mt-4 flex gap-2">
          <Link href="/categories" className="btn btn-secondary">Categories</Link>
          <Link href="/products/new" className="btn btn-primary">Add product</Link>
        </div>
      </div>
    );
  }

  const TotalsTable = () => (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between"><dt className="text-ink-600">Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
      {discount && <div className="flex justify-between"><dt className="text-ink-600">Discount ({discount.name})</dt><dd>−{money(totals.discountAmount)}</dd></div>}
      {config.pricing.serviceChargeEnabled && type === "DINE_IN" && <div className="flex justify-between"><dt className="text-ink-600">Service charge</dt><dd>{money(totals.serviceChargeAmount)}</dd></div>}
      {config.pricing.taxEnabled && <div className="flex justify-between"><dt className="text-ink-600">{config.taxName} ({config.pricing.taxRate}%)</dt><dd>{money(totals.taxAmount)}</dd></div>}
      {type === "DELIVERY" && <div className="flex justify-between"><dt className="text-ink-600">Delivery</dt><dd>{money(totals.deliveryFee)}</dd></div>}
      <div className="flex justify-between border-t border-paper-300 pt-2 font-display text-xl font-semibold"><dt>Total</dt><dd>{money(totals.total)}</dd></div>
    </dl>
  );

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 lg:h-[calc(100vh-6rem)] lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* ── Products ── */}
      <section className="flex min-h-0 flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-600" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all products" className="input pl-9" aria-label="Search products" />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ id: "all", name: "All" }, ...categories].map((c) => (
            <button
              key={c.id} onClick={() => { setCategoryId(c.id); setSearch(""); }}
              className={cn("min-h-[44px] whitespace-nowrap rounded-lg px-4 text-sm font-semibold", !q && categoryId === c.id ? "bg-palm-900 text-paper-100" : "bg-white text-ink-800 ring-1 ring-paper-300 hover:bg-paper-100")}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto pb-24 sm:grid-cols-3 xl:grid-cols-4 lg:pb-0">
          {visible.length === 0 && <p className="col-span-full p-4 text-sm text-ink-600">No products match.</p>}
          {visible.map((p) => {
            const from = p.variants.length > 0 ? Math.min(...p.variants.map((v) => v.price)) : p.price;
            return (
              <button
                key={p.id} onClick={() => clickProduct(p)} disabled={p.soldOut}
                className="group overflow-hidden rounded-xl border border-paper-300 bg-white text-left transition hover:border-gold-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-paper-200 font-display text-3xl text-ink-600">{p.name[0]}</div>}
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-sm">{p.variants.length > 0 ? "from " : ""}{money(from)}</p>
                    {p.soldOut ? <span className="rounded bg-chili-50 px-1.5 py-0.5 text-[11px] font-semibold text-chili-600">Sold out</span>
                      : p.lowStock && p.stock !== null ? <span className="rounded bg-gold-50 px-1.5 py-0.5 text-[11px] font-semibold text-gold-600">{p.stock} left</span> : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Order panel ── */}
      <aside className={cn("flex min-h-0 flex-col bg-white lg:rounded-xl lg:border lg:border-paper-300", cartOpen ? "fixed inset-0 z-40" : "hidden lg:flex")}>
        <div className="flex items-center justify-between border-b border-paper-300 p-3">
          <h2 className="font-display text-lg font-semibold">{step === "build" ? "Current order" : step === "review" ? "Review order" : "Order placed"}</h2>
          <button className="rounded p-2 hover:bg-paper-100 lg:hidden" aria-label="Close order panel" onClick={() => setCartOpen(false)}><X className="h-5 w-5" /></button>
        </div>

        {step === "build" && (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-3">
              {cart.length === 0 ? <p className="rounded-lg bg-paper-100 p-4 text-center text-sm text-ink-600">Tap a product to add it.</p> : (
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
                            <p className="text-xs text-ink-600">{money(unit)} each</p>
                          </div>
                          <p className="text-sm font-semibold">{money(unit * l.quantity)}</p>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <button aria-label="Decrease quantity" className="grid h-9 w-9 place-items-center rounded-lg ring-1 ring-paper-300 hover:bg-paper-100" onClick={() => changeQty(l.key, -1)}><Minus className="h-4 w-4" /></button>
                          <span className="w-8 text-center text-sm font-semibold">{l.quantity}</span>
                          <button aria-label="Increase quantity" className="grid h-9 w-9 place-items-center rounded-lg ring-1 ring-paper-300 hover:bg-paper-100" onClick={() => changeQty(l.key, 1)}><Plus className="h-4 w-4" /></button>
                          <button aria-label="Remove item" className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-chili-600 hover:bg-chili-50" onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div>
                <p className="label">Order type</p>
                <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-paper-100 p-1">
                  {config.enabledTypes.map((t) => (
                    <button key={t} onClick={() => setType(t)} className={cn("min-h-[40px] rounded-md text-sm font-semibold", type === t ? "bg-white shadow-sm" : "text-ink-600")}>{TYPE_LABEL[t]}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="label">Customer</p>
                {customer ? (
                  <div className="flex items-start justify-between rounded-lg bg-paper-100 p-3 text-sm">
                    <div><p className="font-medium">{customer.name}</p><p className="text-ink-600">{customer.phone ?? "No phone saved"}</p></div>
                    <button className="font-medium text-palm-700" onClick={() => setCustomer(null)}>Change</button>
                  </div>
                ) : (
                  <>
                    <input className="input" placeholder={type === "DINE_IN" ? "Customer name (optional)" : "Customer name"} value={name} onChange={(e) => setName(e.target.value)} />
                    <input className="input" type="tel" inputMode="tel" placeholder={type === "DELIVERY" ? "Phone number (required)" : "Phone number"} value={phone} onChange={(e) => setPhone(e.target.value)} />
                    {results.length > 0 && (
                      <ul className="overflow-hidden rounded-lg border border-paper-300 text-sm">
                        <li className="bg-paper-100 px-3 py-1 text-xs text-ink-600">Existing customers. Tap to use.</li>
                        {results.map((r) => (
                          <li key={r.id}>
                            <button className="w-full px-3 py-2.5 text-left hover:bg-gold-50" onClick={() => { setCustomer(r); setAddress(r.address ?? ""); setName(""); setPhone(""); }}>
                              <span className="font-medium">{r.name}</span> <span className="text-ink-600">{r.phone}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="hint">New customers are saved automatically when you enter a phone number.</p>
                  </>
                )}
              </div>

              {type === "DELIVERY" && (
                <div className="space-y-2">
                  <input className="input" placeholder="Delivery address (required)" value={address} onChange={(e) => setAddress(e.target.value)} />
                  <input className="input" placeholder="Delivery instructions (optional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
                </div>
              )}
              {type === "DINE_IN" && <input className="input" placeholder="Table number (optional)" value={table} onChange={(e) => setTable(e.target.value)} />}
              <input className="input" placeholder="Order note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

              {discounts.length > 0 && (
                <select className="input" value={discountId} onChange={(e) => setDiscountId(e.target.value)} aria-label="Discount">
                  <option value="">No discount</option>
                  {discounts.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type === "PERCENT" ? `${d.value}%` : money(d.value)})</option>)}
                </select>
              )}
            </div>

            <div className="space-y-3 border-t border-paper-300 p-3">
              <TotalsTable />
              {problems.length > 0 && cart.length > 0 && <p className="text-xs text-chili-600">{problems[0]}</p>}
              <button className="btn btn-primary w-full" disabled={problems.length > 0} onClick={() => setStep("review")}>Review order</button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
              <section>
                <p className="label">Customer</p>
                <p className="font-medium">{displayName || "Walk-in"}</p>
                {displayPhone && <p className="text-ink-600">{displayPhone}</p>}
                {type === "DELIVERY" && <p className="text-ink-600">{address}{instructions ? ` (${instructions})` : ""}</p>}
              </section>
              <section>
                <p className="label">Order type</p>
                <p className="font-medium">{TYPE_LABEL[type]}{type === "DINE_IN" && table ? ` · Table ${table}` : ""}</p>
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
              <section>
                <p className="label">Payment</p>
                {config.canTakePayment ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-paper-100 p-1">
                      <button className={cn("min-h-[40px] rounded-md font-semibold", payNow ? "bg-white shadow-sm" : "text-ink-600")} onClick={() => setPayNow(true)}>Pay now</button>
                      <button className={cn("min-h-[40px] rounded-md font-semibold", !payNow ? "bg-white shadow-sm" : "text-ink-600")} onClick={() => setPayNow(false)}>Pay later</button>
                    </div>
                    {payNow ? (
                      <>
                        <select className="input" value={methodId} onChange={(e) => setMethodId(e.target.value)} aria-label="Payment method">
                          {config.methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        <input className="input" type="number" min="0" step="0.01" inputMode="decimal" placeholder={`Amount (full total ${money(totals.total)})`} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} aria-label="Amount received" />
                        {selectedMethod?.code === "cash" && (
                          <>
                            <input className="input" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Cash received (optional)" value={tendered} onChange={(e) => setTendered(e.target.value)} aria-label="Cash received" />
                            {change > 0 && <p className="font-semibold text-leaf-700">Change to give: {money(change)}</p>}
                          </>
                        )}
                        {selectedMethod?.requiresReference && <input className="input" placeholder="Reference number (required)" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />}
                        {payAmount !== "" && payAmountNum > 0 && payAmountNum < totals.total && <p className="text-xs text-amber-700">Part payment. {money(totals.total - payAmountNum)} will stay unpaid.</p>}
                      </>
                    ) : (
                      <p className="text-ink-600">Unpaid for now. Take payment later from the order page.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-ink-600">Unpaid. Payment can be taken from the order page.</p>
                )}
                <p className="mt-2 text-xs text-ink-600">The order starts as <strong>{config.startsAs}</strong>.</p>
              </section>
            </div>
            <div className="space-y-3 border-t border-paper-300 p-3">
              <TotalsTable />
              {payProblems.length > 0 && !error && <p className="text-xs text-chili-600">{payProblems[0]}</p>}
              {error && <p role="alert" className="rounded-lg bg-chili-50 p-2 text-sm text-chili-600">{error}</p>}
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button className="btn btn-secondary" disabled={pending} onClick={() => setStep("build")}>Edit</button>
                <button className="btn btn-primary" disabled={pending || payProblems.length > 0} onClick={confirm}>{pending ? "Saving…" : "Confirm order"}</button>
              </div>
            </div>
          </>
        )}

        {step === "done" && created && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-leaf-50 text-leaf-700"><Check className="h-7 w-7" /></div>
            <p className="font-display text-3xl font-semibold">{created.orderCode}</p>
            <p className="text-sm text-ink-600">
              Order saved · {money(created.total)} ·{" "}
              {created.paid >= created.total ? "paid in full" : created.paid > 0 ? `${money(created.paid)} paid, ${money(created.total - created.paid)} due` : "unpaid"}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <a className="btn btn-secondary" href={`/orders/${created.orderId}/receipt?fresh=1`} target="_blank" rel="noreferrer">Print receipt</a>
              <Link className="btn btn-secondary" href={`/orders/${created.orderId}`}>View order</Link>
            </div>
            <button className="btn btn-primary" onClick={startNewOrder}>Start new order</button>
          </div>
        )}
      </aside>

      {step === "build" && !cartOpen && itemCount > 0 && (
        <button className="btn btn-primary fixed inset-x-3 bottom-3 z-30 justify-between lg:hidden" onClick={() => setCartOpen(true)}>
          <span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> {itemCount} item{itemCount === 1 ? "" : "s"}</span>
          <span>{money(totals.total)}</span>
        </button>
      )}

      {picker && (
        <Picker
          product={picker} money={money} onClose={() => setPicker(null)}
          onAdd={(v, a, qty, n) => { addToCart(picker, v, a, qty, n); setPicker(null); }}
        />
      )}
    </div>
  );
}
