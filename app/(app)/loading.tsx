// Shown instantly while a page loads its data, so the screen never looks frozen.
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-lg bg-paper-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-paper-200" />)}
      </div>
      <div className="h-64 rounded-xl bg-paper-200" />
    </div>
  );
}
