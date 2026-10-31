"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

type Row = { id?: string; name: string; price: string; isActive: boolean };

// Edits a list of sizes or add-ons. Existing rows can be switched off but never removed
// (old orders still point at them); only rows added in this session can be taken out.
export function ListEditor({
  name, title, hint, initial, addLabel, namePlaceholder,
}: {
  name: string; title: string; hint: string; addLabel: string; namePlaceholder: string;
  initial: { id: string; name: string; price: string; isActive: boolean }[];
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const serialized = JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, price: r.price === "" ? 0 : Number(r.price), isActive: r.isActive })));

  return (
    <fieldset className="min-w-0 rounded-lg border border-paper-300 p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <p className="mb-2 text-xs text-ink-600">{hint}</p>
      <input type="hidden" name={name} value={serialized} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2">
            <input aria-label="Name" className="input min-w-[8rem] flex-1" placeholder={namePlaceholder} value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
            <input aria-label="Price" className="input w-28" type="number" min={0} step="0.01" placeholder="Price" value={r.price} onChange={(e) => update(i, { price: e.target.value })} />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-palm-700" checked={r.isActive} onChange={(e) => update(i, { isActive: e.target.checked })} />
              Offered
            </label>
            {!r.id && (
              <button type="button" aria-label="Remove" className="rounded p-2 text-ink-600 hover:bg-paper-100" onClick={() => setRows((x) => x.filter((_, n) => n !== i))}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary mt-3" onClick={() => setRows((r) => [...r, { name: "", price: "", isActive: true }])}>
        <Plus className="h-4 w-4" /> {addLabel}
      </button>
    </fieldset>
  );
}
