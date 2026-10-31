import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatInZone } from "@/lib/dates";
import { ROLE_LABELS, ROLE_NAMES } from "@/lib/permissions";
import { changeStaffRole, createStaff, revokeStaffSessions, setStaffActive } from "@/lib/actions/staff";
import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/fields";
import { cn } from "@/lib/utils";

export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

const roleOptions = ROLE_NAMES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default async function StaffPage() {
  const me = await requirePermission("staff.manage");
  const settings = await getSettings();
  const staff = await db.user.findMany({
    include: { role: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Staff</h2>
        <p className="text-sm text-ink-600">Accounts are never deleted. Deactivate someone to stop them signing in; their past work stays on record.</p>
      </div>

      <div className="panel divide-y divide-paper-200">
        {staff.map((u) => (
          <div key={u.id} className={cn("flex flex-wrap items-center justify-between gap-3 p-4", !u.isActive && "bg-paper-100")}>
            <div className="min-w-0">
              <p className="font-medium">
                {u.name} {u.id === me.id && <span className="text-xs text-ink-600">(you)</span>}
                {!u.isActive && <span className="ml-2 rounded bg-paper-300 px-1.5 py-0.5 text-xs">Inactive</span>}
              </p>
              <p className="truncate text-sm text-ink-600">{u.email}</p>
              <p className="text-xs text-ink-600">
                {u.lastLoginAt ? `Last sign-in ${formatInZone(u.lastLoginAt, settings.timezone)}` : "Hasn't signed in yet"}
              </p>
            </div>
            {u.id !== me.id && (
              <div className="flex flex-wrap items-end gap-2">
                <ActionForm action={changeStaffRole} submitLabel="Change role" variant="secondary" className="flex items-end gap-2" buttonClassName="mt-0">
                  <input type="hidden" name="userId" value={u.id} />
                  <SelectField label="Role" name="role" defaultValue={u.role.name} options={roleOptions} />
                </ActionForm>
                <ActionForm action={revokeStaffSessions} submitLabel="Sign out everywhere" variant="secondary" buttonClassName="mt-0" confirmMessage={`Sign ${u.name} out of every device?`}>
                  <input type="hidden" name="userId" value={u.id} />
                </ActionForm>
                <ActionForm
                  action={setStaffActive}
                  submitLabel={u.isActive ? "Deactivate" : "Reactivate"}
                  variant={u.isActive ? "danger" : "secondary"}
                  confirmMessage={u.isActive ? `Deactivate ${u.name}? They will be signed out everywhere.` : undefined}
                  buttonClassName="mt-0"
                >
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="isActive" value={String(!u.isActive)} />
                </ActionForm>
              </div>
            )}
            {u.id === me.id && <span className="text-sm text-ink-600">{u.role.label}</span>}
          </div>
        ))}
      </div>

      <section className="panel p-4 sm:p-6">
        <h3 className="text-lg font-semibold">Add staff</h3>
        <ActionForm action={createStaff} submitLabel="Create account" resetOnSuccess className="mt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="name" required />
            <Field label="Email" name="email" type="email" autoComplete="off" required />
            <Field label="Temporary password" name="password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters. They can change it from their profile." />
            <SelectField label="Role" name="role" defaultValue="CASHIER" options={roleOptions} />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
