"use client";

import { useState } from "react";
import { recordPayment } from "@/lib/actions/payments";
import { newKey } from "@/lib/ids";
import { formatMoney } from "@/lib/money";
import { ActionForm } from "@/components/action-form";
import { CheckField, Field } from "@/components/fields";

type Method = { id: string; name: string; code: string; requiresReference: boolean };

export function PaymentForm({ orderId, balance, symbol, methods }: { orderId: string; balance: number; symbol: string; methods: Method[] }) {
  const [key] = useState(newKey); // one key per mount: a double tap can't record the payment twice
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [amount, setAmount] = useState(String(balance));
  const [tendered, setTendered] = useState("");
  const method = methods.find((m) => m.id === methodId);
  const change = method?.code === "cash" && Number(tendered) > Number(amount) ? Number(tendered) - Number(amount) : 0;

  return (
    <ActionForm action={recordPayment} submitLabel="Record payment">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="space-y-3">
        <label className="block">
          <span className="label">Method</span>
          <select name="methodId" className="input" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <Field label={`Amount (${symbol})`} name="amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required hint={`Balance due ${formatMoney(balance, symbol)}. Enter less for a part payment.`} />
        {method?.code === "cash" && (
          <div>
            <Field label="Cash received (optional)" type="number" step="0.01" min="0" value={tendered} onChange={(e) => setTendered(e.target.value)} />
            {change > 0 && <p className="mt-1 text-sm font-semibold text-leaf-700">Change to give: {formatMoney(change, symbol)}</p>}
          </div>
        )}
        {method?.requiresReference && <Field label="Reference number" name="reference" maxLength={80} required />}
        <CheckField label="This payment failed" name="failed" hint="Logs the attempt without adding to the amount paid." />
      </div>
    </ActionForm>
  );
}
