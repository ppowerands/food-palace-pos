import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="panel max-w-md p-6 text-center">
        <h2 className="font-display text-2xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-ink-600">That page or record doesn't exist, or the link has changed.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/dashboard" className="btn btn-primary">Dashboard</Link>
          <Link href="/order" className="btn btn-secondary">Order online</Link>
        </div>
      </div>
    </div>
  );
}
