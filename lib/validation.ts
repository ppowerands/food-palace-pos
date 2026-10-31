import { z } from "zod";
import { ROLE_NAMES } from "@/lib/permissions";

// Unticked checkboxes are absent from FormData, so absent = false.
export const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const emptyToNull = (v: string | undefined) => (v ? v : null);
export const optionalText = (max: number) => z.string().trim().max(max).optional().transform(emptyToNull);

export const money = z.coerce
  .number({ invalid_type_error: "Enter a valid amount" })
  .min(0, "Cannot be negative")
  .max(100_000_000, "Amount is too large")
  .transform((n) => Math.round(n * 100) / 100);

const rate = z.coerce.number({ invalid_type_error: "Enter a valid percentage" }).min(0).max(100);

const timezone = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, "Unknown timezone, e.g. Africa/Lagos");

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const restaurantSchema = z.object({
  name: z.string().trim().min(1, "Required").max(120),
  address: optionalText(300),
  phone: optionalText(40),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional().transform(emptyToNull),
  logoUrl: z.string().trim().url("Enter a full link starting with https://").or(z.literal("")).optional().transform(emptyToNull),
  currency: z.string().trim().length(3, "Use a 3-letter code, e.g. NGN").transform((v) => v.toUpperCase()),
  currencySymbol: z.string().trim().min(1).max(4),
  timezone,
});

export const orderSettingsSchema = z.object({
  orderPrefix: z.string().trim().max(10).regex(/^[A-Za-z0-9-]*$/, "Letters, numbers and dashes only"),
  orderNumberPadding: z.coerce.number().int().min(3).max(10),
  nextOrderNumber: z.coerce.number().int().min(1).max(999_999_999),
  defaultOrderStatus: z.enum(["PENDING", "ACCEPTED"]),
  enablePickup: bool,
  enableDelivery: bool,
  enableDineIn: bool,
  onlineOrderingEnabled: bool,
  defaultDeliveryFee: money,
  enforceStock: bool,
});

export const billingSchema = z.object({
  taxEnabled: bool,
  taxName: z.string().trim().min(1, "Required").max(30),
  taxRate: rate,
  serviceChargeEnabled: bool,
  serviceChargeRate: rate,
});

export const receiptSchema = z.object({
  receiptHeader: optionalText(200),
  receiptFooter: optionalText(300),
  receiptShowPhone: bool,
  receiptShowAddress: bool,
  receiptAutoPrint: bool,
});

export const discountSchema = z
  .object({
    name: z.string().trim().min(1, "Required").max(60),
    type: z.enum(["PERCENT", "FIXED"]),
    value: money,
  })
  .refine((d) => d.type !== "PERCENT" || d.value <= 100, { message: "A percentage can't exceed 100", path: ["value"] });

export const paymentMethodSchema = z.object({
  name: z.string().trim().min(1, "Required").max(40),
  requiresReference: bool,
});

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").max(72, "At most 72 characters"),
  role: z.enum(ROLE_NAMES),
});

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Required"),
    next: z.string().min(8, "At least 8 characters").max(72, "At most 72 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { message: "Passwords don't match", path: ["confirm"] });
