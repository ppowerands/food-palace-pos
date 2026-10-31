"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const realtimeConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export type RealtimeState = "off" | "connecting" | "live" | "offline";

let client: SupabaseClient | null = null;
function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Listens to a Supabase Realtime broadcast channel. Pass topic = null to stay disconnected. */
export function useBroadcast(topic: string | null, event: string, onMessage: (payload: Record<string, unknown>) => void): RealtimeState {
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });
  const [state, setState] = useState<RealtimeState>("off");

  useEffect(() => {
    const c = topic ? getClient() : null;
    if (!c || !topic) {
      setState("off");
      return;
    }
    setState("connecting");
    const channel = c
      .channel(topic)
      .on("broadcast", { event }, (msg) => handler.current((msg.payload ?? {}) as Record<string, unknown>))
      .subscribe((status) => {
        const st = String(status);
        setState(st === "SUBSCRIBED" ? "live" : st === "CLOSED" || st === "CHANNEL_ERROR" || st === "TIMED_OUT" ? "offline" : "connecting");
      });
    return () => {
      void c.removeChannel(channel);
    };
  }, [topic, event]);

  return state;
}

/** The app shell holds the one POS subscription and re-announces it on the window, so any page can react. */
export const ORDERS_CHANGED = "fp:orders-changed";
export function useOrdersChanged(cb: (detail: Record<string, unknown>) => void) {
  const handler = useRef(cb);
  useEffect(() => {
    handler.current = cb;
  });
  useEffect(() => {
    const fn = (e: Event) => handler.current((e as CustomEvent<Record<string, unknown>>).detail ?? {});
    window.addEventListener(ORDERS_CHANGED, fn);
    return () => window.removeEventListener(ORDERS_CHANGED, fn);
  }, []);
}
