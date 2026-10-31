import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";
import { buildReport, parseReportRequest, toCsv } from "@/lib/reports";

export const dynamic = "force-dynamic";

// GET /reports/export?report=sales&preset=30d → a CSV download. Same data and same permission as the Reports page.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !session.user.permissions.includes("reports.view")) return new Response("Forbidden", { status: 403 });

  const sp = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string | undefined>;
  const s = await getSettings();
  const { id, range, params } = parseReportRequest(sp, s.timezone);
  const report = await buildReport(id, params);
  await writeAudit({
    user: session.user, action: "REPORT_EXPORTED", entityType: "Report", entityId: id,
    summary: `${session.user.name} downloaded the ${report.title.toLowerCase()} report (${range.fromStr} to ${range.toStr})`,
  }).catch(() => {});

  return new Response(toCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="food-palace-${id}-${range.fromStr}-to-${range.toStr}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
