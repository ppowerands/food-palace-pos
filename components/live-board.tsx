"use client";

import { useEffect, useRef, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";
import { cancelOrder, changeOrderStatus } from "@/lib/actions/order-flow";
import { formatInZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { OrderTypeKey } from "@/lib/pricing";
import { realtimeConfigured, useOrdersChanged } from "@/lib/realtime-client";
import {
  BOARD_COLUMNS, effectiveStatus, FLOW, isFinal, nextStatus, NEXT_ACTION_LABEL, ORDER_STATUS_LABEL, TYPE_LABEL,
  type OrderStatusKey, type PaymentStatusKey,
} from "@/lib/status";
import { beep } from "@/lib/beep";
import { Elapsed } from "@/components/elapsed";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export type BoardOrder = {
  id: string; code: string; name: string; phone: string | null; type: OrderTypeKey; address: string | null; table: string | null;
  note: string | null; status: OrderStatusKey; payment: PaymentStatusKey; total: number; paid: number; balance: number;
  source: "POS" | "WEBSITE"; createdAt: string; items: { name: string; qty: number }[];
};

export function LiveBoard({
  orders, canManage, canCancel, canRefund, symbol, timezone,
}: { orders: BoardOrder[]; canManage: boolean; canCancel: boolean; canRefund: boolean; symbol: string; timezone: string }) {
  const router = useRouter();
  const money = (n: number) => formatMoney(n, symbol);
  const [overrides, setOverrides] = useState<Record<string, OrderStatusKey>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<OrderStatusKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<BoardOrder | null>(null);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(true);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [sound, setSound] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setOverrides({}); // fresh data from the server replaces any optimistic moves
  }, [orders]);

  useEffect(() => {
    try {
      setSound(localStorage.getItem("fp_sound") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  // Highlight orders that arrive while the board is open.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(orders.map((o) => o.id));
    if (seen.current) {
      const added = orders.filter((o) => !seen.current!.has(o.id) && o.status === "PENDING").map((o) => o.id);
      if (added.length) {
        setFresh((p) => new Set([...p, ...added]));
        setTimeout(() => setFresh((p) => { const n = new Set(p); added.forEach((i) => n.delete(i)); return n; }), 12_000);
      }
    }
    seen.current = ids;
  }, [orders]);

  // Realtime: reload when any screen or the customer website changes an order. Polling is the safety net.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useOrdersChanged(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 250);
  });
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, realtimeConfigured ? 45_000 : 8_000);
    return () => clearInterval(id);
  }, [router]);

  const statusOf = (o: BoardOrder): OrderStatusKey => overrides[o.id] ?? effectiveStatus(o.status);
  const targetsFor = (o: BoardOrder): OrderStatusKey[] => {
    if (!canManage || isFinal(statusOf(o))) return [];
    const i = FLOW.indexOf(statusOf(o));
    const t: OrderStatusKey[] = [FLOW[i + 1], FLOW[i - 1]].filter((x): x is OrderStatusKey => !!x);
    if (canCancel) t.push("CANCELLED");
    return t;
  };

  function move(o: BoardOrder, to: OrderStatusKey) {
    setMessage(null);
    if (to === "CANCELLED") {
      setReason(""); setRefund(true); setDialogError(null); setCancelFor(o);
      return;
    }
    if (to === "COMPLETED" && o.balance > 0 && !window.confirm(`${o.code} still has ${money(o.balance)} unpaid. Complete it anyway?`)) return;
    setOverrides((p) => ({ ...p, [o.id]: to }));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", o.id); fd.set("from", o.status); fd.set("to", to);
      const res = await changeOrderStatus(undefined, fd);
      if (res?.error) {
        setOverrides((p) => { const n = { ...p }; delete n[o.id]; return n; });
        setMessage(res.error);
      }
      router.refresh();
    });
  }

  function submitCancel() {
    if (!cancelFor) return;
    setDialogError(null);
    const o = cancelFor;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", o.id); fd.set("reason", reason);
      if (refund && o.paid > 0 && canRefund) fd.set("refund", "on");
      const res = await cancelOrder(undefined, fd);
      if (res?.error) setDialogError(res.error);
      else {
        setCancelFor(null);
        setMessage(res?.message ?? null);
        router.refresh();
      }
    });
  }

  const onDragStart = (e: DragEvent, o: BoardOrder) => {
    e.dataTransfer.setData("text/plain", o.id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(o.id);
  };
  const dragging = orders.find((o) => o.id === dragId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-ink-600">
          <span className={cn("inline-block h-2 w-2 rounded-full", realtimeConfigured ? "animate-pulse bg-leaf-500" : "bg-gold-400")} />
          {realtimeConfigured ? "Live: new orders and changes appear by themselves." : "Realtime isn't set up yet. Checking for new orders every 8 seconds."}
          {canManage && " Drag a card to another column, or use its buttons."}
        </p>
        <button
          className="btn btn-secondary"
          onClick={() => {
            const next = !sound;
            setSound(next);
            try { localStorage.setItem("fp_sound", next ? "1" : "0"); } catch { /* ignore */ }
            if (next) beep();
          }}
        >
          {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} New-order sound {sound ? "on" : "off"}
        </button>
      </div>
      {message && <p role="status" className="rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-600">{message}</p>}

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-3 sm:mx-0 sm:px-0">
        {BOARD_COLUMNS.map((col) => {
          const list = orders.filter((o) => statusOf(o) === col);
          const canDrop = !!dragging && targetsFor(dragging).includes(col);
          return (
            <section
              key={col}
              onDragOver={(e) => { if (canDrop) { e.preventDefault(); setOver(col); } }}
              onDragLeave={() => setOver((c) => (c === col ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                const o = orders.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                setOver(null); setDragId(null);
                if (o && targetsFor(o).includes(col)) move(o, col);
              }}
              className={cn("w-[280px] shrink-0 rounded-xl bg-paper-100 p-2 transition", canDrop && "ring-2 ring-gold-400/60", over === col && canDrop && "bg-gold-50 ring-gold-500")}
            >
              <header className="mb-2 flex items-center justify-between px-1">
                <OrderStatusBadge status={col} />
                <span className="text-sm font-semibold text-ink-600">{list.length}</span>
              </header>
              <div className="min-h-[120px] space-y-2">
                {list.length === 0 && <p className="px-1 py-6 text-center text-xs text-ink-600">{canDrop ? "Drop here" : "Nothing here"}</p>}
                {list.map((o) => {
                  const st = statusOf(o);
                  const next = !canManage || isFinal(st) ? null : nextStatus(o.type, st);
                  const draggable = canManage && !isFinal(st);
                  return (
                    <article
                      key={o.id}
                      draggable={draggable}
                      onDragStart={(e) => onDragStart(e, o)}
                      onDragEnd={() => { setDragId(null); setOver(null); }}
                      className={cn("rounded-xl border bg-white p-3 shadow-sm", draggable && "cursor-grab active:cursor-grabbing", fresh.has(o.id) ? "border-gold-500 ring-2 ring-gold-400" : "border-paper-300", dragId === o.id && "opacity-50")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/orders/${o.id}`} className="font-display text-lg font-semibold text-palm-700 hover:underline">{o.code}</Link>
                        <div className="flex flex-wrap justify-end gap-1">
                          {o.source === "WEBSITE" && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">Online</span>}
                          <span className="rounded bg-paper-200 px-1.5 py-0.5 text-[11px] font-semibold">{TYPE_LABEL[o.type]}{o.table ? ` ${o.table}` : ""}</span>
                        </div>
                      </div>
                      <p className="truncate text-sm font-medium">{o.name}</p>
                      {o.phone && <p className="text-xs text-ink-600">{o.phone}</p>}
                      {o.type === "DELIVERY" && o.address && <p className="text-xs text-ink-800">📍 {o.address}</p>}
                      <ul className="mt-1 space-y-0.5 text-xs text-ink-800">
                        {o.items.slice(0, 5).map((it, i) => <li key={i}>{it.qty}× {it.name}</li>)}
                        {o.items.length > 5 && <li className="text-ink-600">+{o.items.length - 5} more</li>}
                      </ul>
                      {o.note && <p className="mt-1 text-xs italic text-ink-600">Note: {o.note}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{money(o.total)}</span>
                        <PaymentStatusBadge status={o.payment} />
                      </div>
                      <p className="mt-1 text-xs text-ink-600">
                        Received {formatInZone(new Date(o.createdAt), timezone, "h:mm a")}
                        {!isFinal(st) && <> · <Elapsed since={o.createdAt} /></>}
                      </p>
                      {(next || (canCancel && !isFinal(st))) && (
                        <div className="mt-2 flex gap-2">
                          {next && <button className="btn btn-primary flex-1" disabled={pending} onClick={() => move(o, next)}>{NEXT_ACTION_LABEL[next] ?? ORDER_STATUS_LABEL[next]}</button>}
                          {canCancel && !isFinal(st) && <button className="btn btn-secondary" disabled={pending} onClick={() => move(o, "CANCELLED")}>Cancel</button>}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {cancelFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Cancel order">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <h3 className="font-display text-xl font-semibold">Cancel {cancelFor.code}?</h3>
            <p className="text-sm text-ink-600">The order stays on record as cancelled, with who cancelled it and why.</p>
            <label className="mt-3 block">
              <span className="label">Reason</span>
              <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={300} />
            </label>
            {cancelFor.paid > 0 && canRefund && (
              <label className="mt-3 flex items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-palm-700" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
                Also refund {money(cancelFor.paid)} paid so far
              </label>
            )}
            {dialogError && <p role="alert" className="mt-3 rounded-lg bg-chili-50 p-2 text-sm text-chili-600">{dialogError}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn btn-secondary" disabled={pending} onClick={() => setCancelFor(null)}>Keep order</button>
              <button className="btn btn-danger" disabled={pending || reason.trim().length < 3} onClick={submitCancel}>{pending ? "Cancelling…" : "Cancel order"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
