"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function Elapsed({ since, className }: { since: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  const text = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return <span className={cn(mins >= 45 ? "font-semibold text-chili-600" : mins >= 30 ? "font-semibold text-amber-700" : "", className)}>{text}</span>;
}
