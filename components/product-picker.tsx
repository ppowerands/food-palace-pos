"use client";

import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import type { PosAddon, PosProduct, PosVariant } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export function Picker({
  product, money, onClose, onAdd,
}: {
  product: PosProduct; money: (n: number) => string; onClose: () => void;
  onAdd: (v: PosVariant | null, a: PosAddon[], qty: number, note: string) => void;
}) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  const variant = product.variants.find((v) => v.id === variantId) ?? null;
  const addons = product.addons.filter((a) => addonIds.includes(a.id));
  const needsVariant = product.variants.length > 0 && !variant;
  const unit = (variant?.price ?? product.price) + addons.reduce((s, a) => s + a.price, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={product.name}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold">{product.name}</h3>
            {product.description && <p className="text-sm text-ink-600">{product.description}</p>}
          </div>
          <button aria-label="Close" className="rounded p-2 hover:bg-paper-100" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {product.variants.length > 0 && (
          <fieldset className="mt-4">
            <legend className="label">Choose a size</legend>
            <div className="grid grid-cols-2 gap-2">
              {product.variants.map((v) => (
                <button key={v.id} onClick={() => setVariantId(v.id)} className={cn("min-h-[48px] rounded-lg px-3 py-2 text-left text-sm ring-1", variantId === v.id ? "bg-gold-50 ring-2 ring-gold-500" : "ring-paper-300 hover:bg-paper-100")}>
                  <span className="block font-semibold">{v.name}</span><span className="text-ink-600">{money(v.price)}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {product.addons.length > 0 && (
          <fieldset className="mt-4">
            <legend className="label">Add-ons</legend>
            <div className="space-y-1">
              {product.addons.map((a) => (
                <label key={a.id} className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg px-3 ring-1 ring-paper-300 hover:bg-paper-100">
                  <span className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-palm-700" checked={addonIds.includes(a.id)} onChange={(e) => setAddonIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))} />
                    {a.name}
                  </span>
                  <span className="text-sm text-ink-600">+{money(a.price)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <input className="input mt-4" placeholder="Note for the kitchen (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button aria-label="Decrease quantity" className="grid h-10 w-10 place-items-center rounded-lg ring-1 ring-paper-300" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></button>
            <span className="w-10 text-center font-semibold">{qty}</span>
            <button aria-label="Increase quantity" className="grid h-10 w-10 place-items-center rounded-lg ring-1 ring-paper-300" onClick={() => setQty((q) => Math.min(99, q + 1))}><Plus className="h-4 w-4" /></button>
          </div>
          <button className="btn btn-primary" disabled={needsVariant} onClick={() => onAdd(variant, addons, qty, note)}>
            {needsVariant ? "Choose a size" : `Add · ${money(unit * qty)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
