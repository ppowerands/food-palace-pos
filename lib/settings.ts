import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

export const getSettings = cache(async () => {
  const existing = await db.restaurantSettings.findUnique({ where: { id: 1 } });
  return existing ?? db.restaurantSettings.create({ data: { id: 1 } });
});
