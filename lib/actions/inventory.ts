"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { BusinessError } from "@/lib/errors";
import { stockSchema } from "@/lib/validation-orders";
import { handle, validationError } from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/types";

const LABEL = { RECEIVED: "received", WASTE: "wasted or damaged", ADJUSTMENT: "adjusted" } as const;

/** Every stock change is a recorded movement with a quantity, a reason, who did it and when. Stock is never changed silently. */
export async function adjustStock(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await authorize("inventory.manage");
    const parsed = stockSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return validationError(parsed.error);
    const { productId, type, quantity, reason } = parsed.data;

    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE "productId" = ${productId} FOR UPDATE`;
      const item = await tx.inventoryItem.findUnique({ where: { productId }, include: { product: { select: { name: true } } } });
      if (!item) throw new BusinessError("That product doesn't track stock. Turn on stock tracking in the product first.");

      let change: number;
      if (type === "RECEIVED") {
        if (quantity <= 0) throw new BusinessError("Enter how many were received.");
        change = quantity;
      } else if (type === "WASTE") {
        if (quantity <= 0) throw new BusinessError("Enter how many were wasted or damaged.");
        change = -quantity;
      } else {
        change = quantity - item.quantity; // "quantity" is the counted amount
        if (change === 0) throw new BusinessError("The counted quantity matches the current stock, so there is nothing to adjust.");
      }
      const after = item.quantity + change;
      if (after < 0) throw new BusinessError(`That would take stock below zero (currently ${item.quantity}).`);

      await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: after } });
      await tx.inventoryMovement.create({
        data: { inventoryItemId: item.id, type, quantityChange: change, quantityAfter: after, reason, createdById: user.id },
      });
      await writeAudit(
        {
          user, action: "INVENTORY_ADJUSTED", entityType: "Product", entityId: productId,
          summary: `${user.name} ${LABEL[type]} ${Math.abs(change)} × ${item.product.name} (stock ${item.quantity} → ${after}): ${reason}`,
          oldValue: { quantity: item.quantity }, newValue: { quantity: after, type, reason },
        },
        tx,
      );
      return { name: item.product.name, after };
    });
    for (const p of ["/inventory", "/pos", "/products"]) revalidatePath(p);
    return { ok: true, message: `${result.name}: stock is now ${result.after}.` };
  });
}
