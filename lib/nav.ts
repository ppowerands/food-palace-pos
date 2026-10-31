import type { PermissionKey } from "@/lib/permissions";

export type NavIcon =
  | "dashboard" | "items" | "orders" | "live" | "pos" | "sales" | "products" | "categories"
  | "customers" | "inventory" | "payments" | "reports" | "staff" | "settings" | "audit";

export const NAV: { label: string; href: string; icon: NavIcon; permission: PermissionKey; phase: number; ready: boolean }[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: "dashboard.view", phase: 6, ready: true },
  { label: "Orders", href: "/orders", icon: "orders", permission: "orders.view", phase: 5, ready: true },
  { label: "Live orders", href: "/live", icon: "live", permission: "orders.view", phase: 5, ready: true },
  { label: "POS", href: "/pos", icon: "pos", permission: "pos.use", phase: 3, ready: true },
  { label: "Sales", href: "/sales", icon: "sales", permission: "sales.view", phase: 6, ready: true },
  { label: "Items sold", href: "/items", icon: "items", permission: "sales.view", phase: 6, ready: true },
  { label: "Products", href: "/products", icon: "products", permission: "products.view", phase: 2, ready: true },
  { label: "Categories", href: "/categories", icon: "categories", permission: "categories.manage", phase: 2, ready: true },
  { label: "Customers", href: "/customers", icon: "customers", permission: "customers.view", phase: 2, ready: true },
  { label: "Inventory", href: "/inventory", icon: "inventory", permission: "inventory.view", phase: 7, ready: true },
  { label: "Payments", href: "/payments", icon: "payments", permission: "payments.view", phase: 4, ready: true },
  { label: "Reports", href: "/reports", icon: "reports", permission: "reports.view", phase: 8, ready: true },
  { label: "Staff", href: "/staff", icon: "staff", permission: "staff.manage", phase: 1, ready: true },
  { label: "Settings", href: "/settings", icon: "settings", permission: "settings.view", phase: 1, ready: true },
  { label: "Audit log", href: "/audit", icon: "audit", permission: "audit.view", phase: 8, ready: true },
];
