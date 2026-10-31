// Shared (safe for client and server). The database is the source of truth at runtime;
// ROLE_DEFAULTS only seeds a role the first time it is created.

export const PERMISSION_DEFS = [
  { key: "dashboard.view", description: "View the dashboard" },
  { key: "orders.view", description: "View orders" },
  { key: "orders.create", description: "Create orders" },
  { key: "orders.manage", description: "Move orders through statuses" },
  { key: "orders.cancel", description: "Cancel orders" },
  { key: "pos.use", description: "Use the POS screen" },
  { key: "payments.view", description: "View payments" },
  { key: "payments.process", description: "Take payments" },
  { key: "payments.refund", description: "Issue refunds and voids" },
  { key: "receipts.print", description: "Print receipts" },
  { key: "sales.view", description: "View sales" },
  { key: "reports.view", description: "View and export reports" },
  { key: "products.view", description: "View products" },
  { key: "products.manage", description: "Create and edit products" },
  { key: "categories.manage", description: "Manage categories" },
  { key: "customers.view", description: "View customers" },
  { key: "customers.manage", description: "Create and edit customers" },
  { key: "inventory.view", description: "View inventory" },
  { key: "inventory.manage", description: "Adjust inventory" },
  { key: "staff.manage", description: "Manage staff accounts and roles" },
  { key: "settings.view", description: "View settings" },
  { key: "settings.manage", description: "Change settings" },
  { key: "audit.view", description: "View the audit log" },
] as const;

export type PermissionKey = (typeof PERMISSION_DEFS)[number]["key"];
export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_DEFS.map((p) => p.key);

export const ROLE_NAMES = ["OWNER", "MANAGER", "CASHIER"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  OWNER: "Owner / Admin",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  OWNER: "Full access, including staff, settings, refunds and the audit log.",
  MANAGER: "Runs the floor: orders, products, customers, inventory, sales and reports.",
  CASHIER: "Creates orders, takes payments and prints receipts.",
};

export const ROLE_DEFAULTS: Record<RoleName, PermissionKey[]> = {
  OWNER: ALL_PERMISSIONS,
  MANAGER: [
    "dashboard.view", "orders.view", "orders.create", "orders.manage", "orders.cancel",
    "pos.use", "payments.view", "payments.process", "payments.refund", "receipts.print",
    "sales.view", "reports.view", "products.view", "products.manage", "categories.manage",
    "customers.view", "customers.manage", "inventory.view", "inventory.manage",
  ],
  CASHIER: [
    "dashboard.view", "orders.view", "orders.create", "orders.manage", "pos.use",
    "payments.view", "payments.process", "receipts.print", "products.view", "customers.view",
  ],
};
