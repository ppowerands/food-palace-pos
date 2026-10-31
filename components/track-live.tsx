"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ORDER_EVENT, orderTopic } from "@/lib/realtime-topics";
import { realtimeConfigured, useBroadcast } from "@/lib/realtime-client";

// Keeps the customer's tracking page up to date without a refresh.
export function TrackLive({ token }: { token: string }) {
  const router = useRouter();
  const state = useBroadcast(orderTopic(token), ORDER_EVENT, () => router.refresh());
  useEffect(() => {
    const ms = realtimeConfigured && state === "live" ? 60_000 : 8_000; // realtime when connected, quick polling otherwise
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(id);
  }, [router, state]);
  return (
    <p className="flex items-center justify-center gap-2 text-xs text-ink-600">
      <span className={`inline-block h-2 w-2 rounded-full ${state === "live" ? "animate-pulse bg-leaf-500" : "bg-gold-400"}`} />
      {state === "live" ? "Live: this page updates by itself." : "This page checks for updates every few seconds."}
    </p>
  );
}
