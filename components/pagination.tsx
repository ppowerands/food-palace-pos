import Link from "next/link";

export function Pagination({
  page, pages, basePath, params,
}: { page: number; pages: number; basePath: string; params: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav className="flex items-center justify-between pt-2 text-sm" aria-label="Pagination">
      {page > 1 ? <Link className="btn btn-secondary" href={href(page - 1)}>Previous</Link> : <span />}
      <span className="text-ink-600">Page {page} of {pages}</span>
      {page < pages ? <Link className="btn btn-secondary" href={href(page + 1)}>Next</Link> : <span />}
    </nav>
  );
}
