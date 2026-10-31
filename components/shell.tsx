"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell, Boxes, ClipboardList, CreditCard, LayoutDashboard, LogOut, Menu, Package, Radio, ScrollText,
  ListChecks, Settings, ShoppingCart, Tags, TrendingUp, UserCog, UserRound, Users, X, BarChart3,
} from "lucide-react";
import { formatInZone } from "@/lib/dates";
import type { NavIcon } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { beep } from "@/lib/beep";
import { ORDERS_CHANGED, useBroadcast } from "@/lib/realtime-client";
import { POS_EVENT, POS_TOPIC } from "@/lib/realtime-topics";

const ICONS: Record<NavIcon, typeof Menu> = {
  dashboard: LayoutDashboard, items: ListChecks, orders: ClipboardList, live: Radio, pos: ShoppingCart, sales: TrendingUp,
  products: Package, categories: Tags, customers: Users, inventory: Boxes, payments: CreditCard,
  reports: BarChart3, staff: UserCog, settings: Settings, audit: ScrollText,
};

export type NavEntry = { label: string; href: string; icon: NavIcon; ready: boolean; phase: number };

function Clock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="w-28" />;
  return (
    <time className="hidden text-right text-xs leading-tight text-ink-600 sm:block">
      <span className="block font-semibold text-ink-800">{formatInZone(now, timezone, "h:mm a")}</span>
      {formatInZone(now, timezone, "EEE d MMM")}
    </time>
  );
}

export function Shell({
  nav, restaurantName, timezone, user, pendingCount, listenOrders, logoutAction, children,
}: {
  nav: NavEntry[];
  restaurantName: string;
  timezone: string;
  user: { name: string; roleLabel: string };
  pendingCount: number;
  listenOrders: boolean;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  // Realtime: the POS listens once for order changes (new website orders, status changes, payments from any screen).
  const [pending, setPending] = useState(pendingCount);
  useEffect(() => setPending(pendingCount), [pendingCount]);
  const [toast, setToast] = useState<{ id: string; code: string; online: boolean } | null>(null);
  const realtime = useBroadcast(listenOrders ? POS_TOPIC : null, POS_EVENT, (p) => {
    window.dispatchEvent(new CustomEvent(ORDERS_CHANGED, { detail: p }));
    fetch("/api/orders/pending-count").then((r) => (r.ok ? r.json() : null)).then((j) => j && setPending(j.count)).catch(() => {});
    if (p.kind === "created") {
      setToast({ id: String(p.orderId), code: String(p.orderCode), online: p.source === "WEBSITE" });
      try { if (localStorage.getItem("fp_sound") === "1") beep(); } catch { /* ignore */ }
      setTimeout(() => setToast(null), 9000);
    }
  });

  const sidebar = (
    <div className="flex h-full flex-col bg-palm-900 text-paper-100">
      <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gold-400 font-display text-sm font-bold text-palm-950">FP</div>
        <span className="truncate font-display text-lg font-semibold">{restaurantName}</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const base = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm";
          if (!item.ready) {
            return (
              <span key={item.href} className={cn(base, "cursor-not-allowed text-paper-100/40")} title={`Coming in phase ${item.phase}`}>
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">Phase {item.phase}</span>
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(base, active ? "bg-gold-400 font-semibold text-palm-950" : "hover:bg-white/10")}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-60 print:pl-0">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block print:hidden">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            {sidebar}
            <button aria-label="Close menu" className="absolute right-2 top-3 rounded p-2 text-paper-100" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 print:hidden items-center gap-2 border-b border-paper-300 bg-paper-50/95 px-3 backdrop-blur sm:gap-4 sm:px-6">
        <button aria-label="Open menu" className="rounded-lg p-2 hover:bg-paper-100 lg:hidden" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="flex-1 truncate font-display text-base font-semibold sm:text-lg">{restaurantName}</h1>
        {realtime !== "off" && (
          <span title={realtime === "live" ? "Realtime connected" : "Realtime reconnecting"} className={cn("hidden h-2.5 w-2.5 rounded-full sm:block", realtime === "live" ? "bg-leaf-500" : "bg-gold-400")} />
        )}
        <Clock timezone={timezone} />
        <Link
          href="/live"
          aria-label={pending > 0 ? `${pending} pending orders` : "No pending orders"}
          className="relative rounded-lg p-2 text-ink-600 hover:bg-paper-100"
        >
          <Bell className="h-5 w-5" />
          {pending > 0 && (
            <span className="absolute right-0.5 top-0.5 grid min-w-[1.1rem] place-items-center rounded-full bg-chili-500 px-1 text-[10px] font-bold leading-4 text-white">
              {pending > 99 ? "99+" : pending}
            </span>
          )}
        </Link>
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1.5 hover:bg-paper-100 [&::-webkit-details-marker]:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-palm-800 text-xs font-semibold text-paper-100">
              {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <span className="hidden text-left text-xs leading-tight sm:block">
              <span className="block font-semibold">{user.name}</span>
              <span className="text-ink-600">{user.roleLabel}</span>
            </span>
          </summary>
          <div className="absolute right-0 mt-2 w-48 rounded-xl border border-paper-300 bg-white p-1 shadow-lg">
            <Link href="/account" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-paper-100">
              <UserRound className="h-4 w-4" /> Profile &amp; security
            </Link>
            <form action={logoutAction}>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-chili-600 hover:bg-chili-50">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        </details>
      </header>

      <main className="p-3 sm:p-6 print:p-0">{children}</main>

      {toast && (
        <Link
          href="/live"
          onClick={() => setToast(null)}
          className="fixed bottom-20 right-3 z-50 max-w-xs rounded-xl bg-palm-900 px-4 py-3 text-sm text-paper-100 shadow-lg ring-2 ring-gold-400 sm:bottom-6 sm:right-6 print:hidden"
        >
          <span className="block font-semibold">{toast.online ? "New online order" : "New order"} {toast.code}</span>
          <span className="text-paper-100/70">Tap to open the live board</span>
        </Link>
      )}
    </div>
  );
}
