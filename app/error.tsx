"use client";

import { useEffect } from "react";

// Shown if a page crashes. Nothing is lost: orders and payments are already saved in the database.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="panel max-w-md p-6 text-center">
        <h2 className="font-display text-2xl font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-ink-600">This page couldn't load. Anything you already saved is safe. Try again, and if it keeps happening, tell your manager.</p>
        {error.digest && <p className="mt-2 text-xs text-ink-600">Reference: {error.digest}</p>}
        <button className="btn btn-primary mt-4" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
