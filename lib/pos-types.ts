import type { OrderTypeKey, PricingConfig } from "@/lib/pricing";

export type PosAddon = { id: string; name: string; price: number };
export type PosVariant = { id: string; name: string; price: number };
export type PosProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  variants: PosVariant[];
  addons: PosAddon[];
  trackStock: boolean;
  stock: number | null;
  lowStock: boolean;
  soldOut: boolean; // only true when stock enforcement is on
};
export type PosCategory = { id: string; name: string; products: PosProduct[] };
export type PosDiscount = { id: string; name: string; type: "PERCENT" | "FIXED"; value: number };
export type PosPaymentMethod = { id: string; name: string; code: string; requiresReference: boolean };
export type PosConfig = {
  methods: PosPaymentMethod[];
  canTakePayment: boolean;
  symbol: string;
  enabledTypes: OrderTypeKey[];
  pricing: PricingConfig;
  taxName: string;
  startsAs: string;
};

export type WebConfig = {
  symbol: string;
  enabledTypes: OrderTypeKey[];
  pricing: PricingConfig;
  taxName: string;
};
