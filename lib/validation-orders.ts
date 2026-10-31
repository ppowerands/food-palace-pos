import { z } from "zod";
import { bool } from "@/lib/validation";
import { ALL_ORDER_STATUSES } from "@/lib/status";

const amount = z.coerce.number({ invalid_type_error: "Enter an amount" }).positive("Enter an amount above zero").max(1_000_000_000);

export const paymentSchema = z.object({
  orderId: z.string().min(1),
  methodId: z.string().min(1, "Choose a payment method"),
  amount,
  reference: z.string().trim().max(80).default(""),
  failed: bool,
  idempotencyKey: z.string().min(10).max(80),
});

export const refundSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1, "Choose the payment"),
  amount,
  reason: z.string().trim().min(3, "Give a reason").max(300),
  type: z.enum(["REFUND", "VOID"]),
});

export const statusSchema = z.object({
  id: z.string().min(1),
  from: z.enum(ALL_ORDER_STATUSES as [string, ...string[]]),
  to: z.enum(ALL_ORDER_STATUSES as [string, ...string[]]),
});

export const cancelSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason").max(300),
  refund: bool,
});

export const stockSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(["RECEIVED", "WASTE", "ADJUSTMENT"]),
  quantity: z.coerce.number({ invalid_type_error: "Enter a quantity" }).int("Use a whole number").min(0, "Can't be negative").max(1_000_000),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});
