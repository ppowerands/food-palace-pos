import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { buildReport, parseReportRequest, REPORTS, type Column } from "@/lib/reports";
import { shortDay } from "@/lib/date-range";
import { BarChart } from "@/components/bar-chart";
import { RangeTabs } from "@/components/range-tabs";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

type SP = { report?: string; preset?: string; from?: string; to?: string; group?: string; by?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("reports.view");
  const sp = await searchParams;
  const s = await getSettings();
  const sym = s.currencySymbol;
  const { id, range, group, by, params } = parseReportRequest(sp, s.timezone);
  const report = await buildReport(id, params);

  const fmt = (v: string | number, kind: Column["kind"]) =>
    kind === "money" ? formatMoney(Number(v), sym) : kind === "percent" ? `${v}%` : kind === "int" ? Number(v).toLocaleString("en-NG") : String(v);
  const carry = { report: id, group: id === "sales" && group !== "day" ? group : undefined, by: id === "customers" && by !== "orders" ? by : undefined };
  const exportQs = new URLSearchParams({ report: id, preset: range.preset, group, by, ...(range.preset === "custom" ? { from: range.fromStr, to: range.toStr } : {}) });
  const link = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ report: id, preset: range.preset, group, by, ...(range.preset === "custom" ? { from: range.fromStr, to: range.toStr } : {}), ...extra });
    return `/reports?${q.toString()}`;
  };
  const pill = (active: boolean) => cn("rounded-lg px-3 py-1.5 text-sm font-medium", active ? "bg-palm-900 text-paper-100" : "bg-white ring-1 ring-paper-300 hover:bg-paper-100");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Reports</h2>
          <p className="text-sm text-ink-600">{shortDay(range.fromStr, true)} – {shortDay(range.toStr, true)}</p>
        </div>
        <a href={`/reports/export?${exportQs.toString()}`} className="btn btn-secondary">Download CSV</a>
      </div>

      <nav className="-mx-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:px-0" aria-label="Reports">
        {REPORTS.map((r) => <Link key={r.id} href={link({ report: r.id })} className={cn(pill(id === r.id), "whitespace-nowrap")}>{r.label}</Link>)}
      </nav>

      <RangeTabs basePath="/reports" current={range.preset} from={range.fromStr} to={range.toStr} extra={carry} />

      {id === "sales" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-600">Group by:</span>
          {(["day", "week", "month"] as const).map((g) => <Link key={g} href={link({ group: g })} className={pill(group === g)}>{g === "day" ? "Day" : g === "week" ? "Week" : "Month"}</Link>)}
        </div>
      )}
      {id === "customers" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-600">Rank by:</span>
          {(["orders", "spent"] as const).map((b) => <Link key={b} href={link({ by: b })} className={pill(by === b)}>{b === "orders" ? "Number of orders" : "Amount spent"}</Link>)}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{report.title}</h3>
          <p className="text-xs text-ink-600">{report.note}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {report.summary.map((c) => (
            <div key={c.label} className="panel p-4">
              <p className="text-sm text-ink-600">{c.label}</p>
              <p className="font-display text-xl font-semibold sm:text-2xl">{fmt(c.value, c.kind)}</p>
            </div>
          ))}
        </div>

        {report.chart && report.chart.length > 0 && (
          <div className="panel p-4">
            <h4 className="mb-2 font-semibold">{report.chartTitle}</h4>
            <BarChart data={report.chart.map((c) => ({ label: c.label.length > 14 ? `${c.label.slice(0, 13)}…` : c.label, value: c.value, title: `${c.label}: ${fmt(c.value, c.kind)}` }))} format={(n) => fmt(n, report.chart?.[0]?.kind ?? "int")} ariaLabel={report.chartTitle ?? report.title} color="bg-gold-500" />
          </div>
        )}

        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-paper-300 text-xs uppercase text-ink-600">
              <tr>{report.columns.map((c) => <th key={c.key} className={cn("p-3", c.kind !== "text" && "text-right")}>{c.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {report.rows.length === 0 && <tr><td colSpan={report.columns.length} className="p-6 text-ink-600">Nothing to report for this period.</td></tr>}
              {report.rows.map((row, i) => (
                <tr key={i}>
                  {report.columns.map((c) => <td key={c.key} className={cn("p-3", c.kind !== "text" && "text-right", c.key === "name" || c.key === "period" ? "font-medium" : "")}>{fmt(row[c.key] ?? "", c.kind)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
