"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

export function PrintButton({ auto }: { auto?: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <button className="btn btn-primary" onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> Print receipt
    </button>
  );
}
