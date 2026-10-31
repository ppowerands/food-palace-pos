import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { PERMISSION_DEFS, ROLE_LABELS } from "@/lib/permissions";
import {
  createDiscount, createPaymentMethod, saveBilling, saveOrderSettings, saveReceipt, saveRestaurant,
  saveRolePermissions, setDiscountActive, setPaymentMethodEnabled,
} from "@/lib/actions/settings";
import { ActionForm } from "@/components/action-form";
import { CheckField, Field, SelectField, TextAreaField } from "@/components/fields";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "restaurant", label: "Restaurant" },
  { id: "orders", label: "Orders" },
  { id: "payments", label: "Payment methods" },
  { id: "billing", label: "Billing & discounts" },
  { id: "receipt", label: "Receipts" },
  { id: "roles", label: "Roles & permissions" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("settings.view");
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some((t) => t.id === rawTab) ? rawTab! : "restaurant";
  const s = await getSettings();
  const canEdit = user.permissions.includes("settings.manage");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Settings</h2>
        {!canEdit && <p className="text-sm text-ink-600">You can view settings but not change them.</p>}
      </div>

      <nav className="-mx-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:px-0" aria-label="Settings sections">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/settings?tab=${t.id}`}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm",
              tab === t.id ? "bg-palm-900 font-semibold text-paper-100" : "text-ink-800 hover:bg-paper-100",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="panel p-4 sm:p-6">
        <fieldset disabled={!canEdit} className="min-w-0">
          {tab === "restaurant" && (
            <ActionForm action={saveRestaurant} submitLabel="Save restaurant details">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Restaurant name" name="name" defaultValue={s.name} required className="sm:col-span-2" />
                <Field label="Address" name="address" defaultValue={s.address ?? ""} className="sm:col-span-2" />
                <Field label="Phone" name="phone" defaultValue={s.phone ?? ""} type="tel" />
                <Field label="Email" name="email" defaultValue={s.email ?? ""} type="email" />
                <Field label="Logo link" name="logoUrl" defaultValue={s.logoUrl ?? ""} placeholder="https://…" hint="Image upload comes with product images in phase 2." className="sm:col-span-2" />
                <Field label="Currency code" name="currency" defaultValue={s.currency} maxLength={3} />
                <Field label="Currency symbol" name="currencySymbol" defaultValue={s.currencySymbol} maxLength={4} />
                <Field label="Timezone" name="timezone" defaultValue={s.timezone} hint="Times are stored in UTC and shown in this timezone." className="sm:col-span-2" />
              </div>
            </ActionForm>
          )}

          {tab === "orders" && (
            <ActionForm action={saveOrderSettings} submitLabel="Save order settings">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Order number prefix" name="orderPrefix" defaultValue={s.orderPrefix} maxLength={10} hint="Shown before the number, e.g. FP-000124. Only affects new orders." />
                <Field label="Number length" name="orderNumberPadding" type="number" min={3} max={10} defaultValue={s.orderNumberPadding} />
                <Field label="Next order number" name="nextOrderNumber" type="number" min={s.nextOrderNumber} defaultValue={s.nextOrderNumber} hint="Can only go up. Numbers are never reused, even for cancelled orders." />
                <SelectField label="New orders start as" name="defaultOrderStatus" defaultValue={s.defaultOrderStatus} options={[{ value: "PENDING", label: "Pending" }, { value: "ACCEPTED", label: "Accepted" }]} />
                <Field label="Default delivery fee" name="defaultDeliveryFee" type="number" step="0.01" min={0} defaultValue={s.defaultDeliveryFee.toString()} />
              </div>
              <div className="mt-4 space-y-1 border-t border-paper-200 pt-4">
                <CheckField label="Pickup" name="enablePickup" defaultChecked={s.enablePickup} />
                <CheckField label="Delivery" name="enableDelivery" defaultChecked={s.enableDelivery} />
                <CheckField label="Dine-in" name="enableDineIn" defaultChecked={s.enableDineIn} />
                <CheckField label="Accept online orders on the website" name="onlineOrderingEnabled" defaultChecked={s.onlineOrderingEnabled} hint="Customers order at /order on your site. No online payment: they pay the restaurant. Orders arrive as pending and unpaid." />
                <CheckField label="Block sales when stock runs out" name="enforceStock" defaultChecked={s.enforceStock} hint="Applies to products with stock tracking turned on." />
              </div>
            </ActionForm>
          )}

          {tab === "payments" && <PaymentMethodsTab />}

          {tab === "billing" && (
            <div className="space-y-8">
              <ActionForm action={saveBilling} submitLabel="Save billing settings">
                <div className="grid gap-4 sm:grid-cols-2">
                  <CheckField label="Charge tax" name="taxEnabled" defaultChecked={s.taxEnabled} className="sm:col-span-2" />
                  <Field label="Tax name" name="taxName" defaultValue={s.taxName} />
                  <Field label="Tax rate (%)" name="taxRate" type="number" step="0.01" min={0} max={100} defaultValue={s.taxRate.toString()} />
                  <CheckField label="Add a service charge" name="serviceChargeEnabled" defaultChecked={s.serviceChargeEnabled} className="sm:col-span-2" />
                  <Field label="Service charge (%)" name="serviceChargeRate" type="number" step="0.01" min={0} max={100} defaultValue={s.serviceChargeRate.toString()} hint="Applied to dine-in orders only." />
                </div>
              </ActionForm>
              <DiscountsSection symbol={s.currencySymbol} />
            </div>
          )}

          {tab === "receipt" && (
            <ActionForm action={saveReceipt} submitLabel="Save receipt settings">
              <div className="space-y-4">
                <TextAreaField label="Header" name="receiptHeader" defaultValue={s.receiptHeader ?? ""} hint="Printed under the restaurant name." />
                <TextAreaField label="Footer" name="receiptFooter" defaultValue={s.receiptFooter ?? ""} />
                <div className="space-y-1">
                  <CheckField label="Show restaurant address" name="receiptShowAddress" defaultChecked={s.receiptShowAddress} />
                  <CheckField label="Show customer phone" name="receiptShowPhone" defaultChecked={s.receiptShowPhone} />
                  <CheckField label="Open the print dialog automatically" name="receiptAutoPrint" defaultChecked={s.receiptAutoPrint} />
                </div>
              </div>
            </ActionForm>
          )}
        </fieldset>

        {tab === "roles" && <RolesTab canEdit={user.roleName === "OWNER"} />}
      </div>
    </div>
  );
}

async function PaymentMethodsTab() {
  const methods = await db.paymentMethod.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="space-y-6">
      <ul className="divide-y divide-paper-200">
        {methods.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{m.name}</p>
              <p className="text-xs text-ink-600">{m.requiresReference ? "Asks for a reference" : "No reference needed"}</p>
            </div>
            <ActionForm
              action={setPaymentMethodEnabled}
              submitLabel={m.isEnabled ? "Turn off" : "Turn on"}
              variant="secondary"
              buttonClassName="mt-0"
            >
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="isEnabled" value={String(!m.isEnabled)} />
            </ActionForm>
          </li>
        ))}
      </ul>
      <ActionForm action={createPaymentMethod} submitLabel="Add payment method" resetOnSuccess className="border-t border-paper-200 pt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New method name" name="name" placeholder="e.g. POS terminal" required />
          <CheckField label="Ask for a reference number" name="requiresReference" className="self-end" />
        </div>
      </ActionForm>
    </div>
  );
}

async function DiscountsSection({ symbol }: { symbol: string }) {
  const discounts = await db.discount.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <section className="border-t border-paper-200 pt-6">
      <h3 className="text-lg font-semibold">Discounts</h3>
      <p className="text-sm text-ink-600">Cashiers pick from these at checkout.</p>
      {discounts.length === 0 ? (
        <p className="mt-3 rounded-lg bg-paper-100 p-3 text-sm text-ink-600">No discounts yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-paper-200">
          {discounts.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-xs text-ink-600">{d.type === "PERCENT" ? `${d.value.toString()}% off` : `${formatMoney(d.value, symbol)} off`}</p>
              </div>
              <ActionForm action={setDiscountActive} submitLabel={d.isActive ? "Turn off" : "Turn on"} variant="secondary" buttonClassName="mt-0">
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="isActive" value={String(!d.isActive)} />
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={createDiscount} submitLabel="Add discount" resetOnSuccess className="mt-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" name="name" placeholder="e.g. Staff meal" required />
          <SelectField label="Type" name="type" options={[{ value: "PERCENT", label: "Percentage" }, { value: "FIXED", label: "Fixed amount" }]} />
          <Field label="Value" name="value" type="number" step="0.01" min={0} required />
        </div>
      </ActionForm>
    </section>
  );
}

async function RolesTab({ canEdit }: { canEdit: boolean }) {
  const roles = await db.role.findMany({
    where: { name: { in: ["MANAGER", "CASHIER"] } },
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-8">
      <p className="text-sm text-ink-600">
        The {ROLE_LABELS.OWNER} role always has full access. Changes apply the next time the person loads a page.
        {!canEdit && " Only the owner can change these."}
      </p>
      {roles.map((role) => {
        const granted = new Set(role.permissions.map((p) => p.permission.key));
        return (
          <fieldset key={role.id} disabled={!canEdit} className="min-w-0">
            <ActionForm action={saveRolePermissions} submitLabel={`Save ${role.label} permissions`}>
              <input type="hidden" name="roleName" value={role.name} />
              <h3 className="mb-2 text-lg font-semibold">{role.label}</h3>
              <div className="grid gap-x-6 sm:grid-cols-2">
                {PERMISSION_DEFS.map((p) => (
                  <CheckField
                    key={p.key}
                    label={p.description}
                    name="perm"
                    value={p.key}
                    defaultChecked={granted.has(p.key) || p.key === "dashboard.view"}
                    disabled={p.key === "dashboard.view"}
                  />
                ))}
              </div>
            </ActionForm>
          </fieldset>
        );
      })}
    </div>
  );
}
