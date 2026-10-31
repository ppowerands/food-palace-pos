import { z } from "zod";
import { bool, emptyToNull, money, optionalText } from "@/lib/validation";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Required").max(60),
  description: optionalText(200),
});

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Required").max(120),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional().transform(emptyToNull),
  address: optionalText(300),
  notes: optionalText(500),
});

const listItem = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Every size/add-on needs a name").max(60),
  price: z.coerce.number().min(0, "Price can't be negative").max(100_000_000).transform((n) => Math.round(n * 100) / 100),
  isActive: z.boolean(),
});

const jsonList = z
  .string()
  .optional()
  .default("[]")
  .transform((s, ctx) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid list" });
      return z.NEVER;
    }
  })
  .pipe(z.array(listItem).max(30));

const optionalMoney = z.preprocess((v) => (v === "" || v === undefined ? undefined : v), money.optional()).transform((v) => v ?? null);

export const productSchema = z.object({
  name: z.string().trim().min(1, "Required").max(120),
  description: optionalText(500),
  categoryId: z.string().min(1, "Choose a category"),
  imageUrl: z.string().trim().url("Enter a full link starting with https://").or(z.literal("")).optional().transform(emptyToNull),
  price: money,
  costPrice: optionalMoney,
  trackStock: bool,
  isActive: bool,
  lowStockThreshold: z.coerce.number().int().min(0).max(100000).default(5),
  openingStock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  variants: jsonList,
  addons: jsonList,
});

export const orderInputSchema = z.object({
  idempotencyKey: z.string().min(10).max(80),
  type: z.enum(["PICKUP", "DELIVERY", "DINE_IN"]),
  customerId: z.string().nullable().optional(),
  customerName: z.string().trim().max(120).default(""),
  customerPhone: z.string().trim().max(30).default(""),
  deliveryAddress: z.string().trim().max(300).default(""),
  deliveryInstructions: z.string().trim().max(300).default(""),
  tableNumber: z.string().trim().max(20).default(""),
  note: z.string().trim().max(300).default(""),
  discountId: z.string().nullable().optional(),
  payment: z
    .object({
      methodId: z.string().min(1),
      amount: z.number().positive().max(1_000_000_000),
      reference: z.string().trim().max(80).default(""),
    })
    .nullable()
    .optional(),
  expectedTotal: z.number().min(0).max(1_000_000_000),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().nullable().optional(),
        addonIds: z.array(z.string()).max(30).default([]),
        quantity: z.number().int().min(1).max(99),
        note: z.string().trim().max(200).default(""),
      }),
    )
    .min(1, "Add at least one item")
    .max(100),
});

// What a customer can send from the public website: no customer id, no discount, no payment.
export const websiteOrderSchema = orderInputSchema
  .omit({ customerId: true, discountId: true, payment: true })
  .extend({ company: z.string().max(200).optional() });
