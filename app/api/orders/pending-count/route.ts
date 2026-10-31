import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || !session.user.permissions.includes("orders.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ count: await db.order.count({ where: { status: "PENDING" } }) });
}
