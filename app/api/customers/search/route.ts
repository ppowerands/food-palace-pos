import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !session.user.permissions.includes("customers.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  if (q.length < 2) return NextResponse.json({ customers: [] });

  const phoneQ = normalizePhone(q) ?? q.replace(/[\s\-]/g, "");
  const customers = await db.customer.findMany({
    where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: phoneQ } }] },
    orderBy: { name: "asc" },
    take: 6,
    select: { id: true, name: true, phone: true, address: true },
  });
  return NextResponse.json({ customers });
}
