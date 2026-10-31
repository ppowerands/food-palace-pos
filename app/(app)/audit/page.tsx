import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatInZone } from "@/lib/dates";
import { resolveRange } from "@/lib/date-range";
import { Pagination } from "@/components/pagination";
import { RangeFields } from "@/components/range-fields";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

type SP = { q?: string; action?: string; entity?: string; user?: string; preset?: string; from?: string; to?: string; page?: string };

const ENTITY_LINK: Record<string, string> = { Order: "/orders", Product: "/products", Customer: "/customers" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const s = await getSettings();
  const q = sp.q?.trim() || undefined;
  const user = sp.user?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const range = resolveRange(sp.preset, sp.from, sp.to, s.timezone);

  const where: Prisma.AuditLogWhereInput = {
    ...(q ? { summary: { contains: q, mode: "insensitive" } } : {}),
    ...(sp.action ? { action: sp.action } : {}),
    ...(sp.entity ? { entityType: sp.entity } : {}),
    ...(user ? { userName: { contains: user, mode: "insensitive" } } : {}),
    ...(range.from && range.to ? { createdAt: { gte: range.from, lte: range.to } } : {}),
  };
  const [total, logs, actions, entities] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
    db.auditLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold">Audit log</h2>
        <p className="text-sm text-ink-600">{total} entr{total === 1 ? "y" : "ies"}. Every important action is recorded here. Entries can't be edited or deleted, not even by the owner.</p>
      </div>

      <form className="panel grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
        <input name="q" defaultValue={q} placeholder="Search the description" className="input sm:col-span-2" aria-label="Search" />
        <input name="user" defaultValue={user} placeholder="Person" className="input" aria-label="Person" />
        <select name="action" defaultValue={sp.action ?? ""} className="input" aria-label="Action">
          <option value="">Any action</option>
          {actions.map((a) => <option key={a.action} value={a.action}>{a.action.toLowerCase().replace(/_/g, " ")}</option>)}
        </select>
        <select name="entity" defaultValue={sp.entity ?? ""} className="input" aria-label="Record type">
          <option value="">Any record</option>
          {entities.map((e) => <option key={e.entityType} value={e.entityType}>{e.entityType}</option>)}
        </select>
        <RangeFields preset={range.preset} from={range.fromStr} to={range.toStr} />
        <button className="btn btn-primary">Apply filters</button>
        <Link href="/audit" className="btn btn-secondary">Clear</Link>
      </form>

      <div className="panel divide-y divide-paper-200">
        {logs.length === 0 && <p className="p-6 text-sm text-ink-600">No entries match.</p>}
        {logs.map((l) => {
          const base = ENTITY_LINK[l.entityType];
          return (
            <div key={l.id} className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm">{l.summary}</p>
                <span className="rounded bg-paper-200 px-1.5 py-0.5 text-[11px] font-semibold">{l.action.toLowerCase().replace(/_/g, " ")}</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-600">
                {formatInZone(l.createdAt, s.timezone, "d MMM yyyy, h:mm:ss a")} · {l.userName}{l.ip ? ` · ${l.ip}` : ""}
                {base && l.entityId && <> · <Link href={`${base}/${l.entityId}`} className="text-palm-700 hover:underline">Open {l.entityType.toLowerCase()}</Link></>}
              </p>
              {Boolean(l.oldValue || l.newValue) && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-medium text-palm-700">Before and after</summary>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {l.oldValue != null && <pre className="overflow-x-auto rounded bg-paper-100 p-2 text-[11px]"><b>Before</b>{"\n"}{JSON.stringify(l.oldValue, null, 2)}</pre>}
                    {l.newValue != null && <pre className="overflow-x-auto rounded bg-paper-100 p-2 text-[11px]"><b>After</b>{"\n"}{JSON.stringify(l.newValue, null, 2)}</pre>}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
      <Pagination page={page} pages={Math.ceil(total / PAGE_SIZE)} basePath="/audit" params={{ q, user, action: sp.action, entity: sp.entity, preset: range.preset === "all" ? undefined : range.preset, from: sp.from, to: sp.to }} />
    </div>
  );
}
