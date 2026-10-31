import { db } from "@/lib/db";
import { getSession, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatInZone } from "@/lib/dates";
import { changePassword, signOutOtherSessions } from "@/lib/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";

export const metadata = { title: "Profile & security" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  const session = await getSession();
  const settings = await getSettings();
  const sessions = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">{user.name}</h2>
        <p className="text-sm text-ink-600">{user.email} · {user.roleLabel}</p>
      </div>

      <section className="panel p-4 sm:p-6">
        <h3 className="text-lg font-semibold">Change password</h3>
        <ActionForm action={changePassword} submitLabel="Change password" resetOnSuccess className="mt-3">
          <div className="grid gap-4">
            <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
            <Field label="New password" name="next" type="password" autoComplete="new-password" minLength={8} required />
            <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
          </div>
        </ActionForm>
      </section>

      <section className="panel p-4 sm:p-6">
        <h3 className="text-lg font-semibold">Signed-in devices</h3>
        <ul className="mt-3 divide-y divide-paper-200">
          {sessions.map((s) => (
            <li key={s.id} className="py-3 text-sm">
              <p className="font-medium">
                {s.id === session?.sessionId ? "This device" : "Another device"}
              </p>
              <p className="truncate text-xs text-ink-600">{s.userAgent ?? "Unknown browser"}</p>
              <p className="text-xs text-ink-600">Last active {formatInZone(s.lastSeenAt, settings.timezone)}</p>
            </li>
          ))}
        </ul>
        <ActionForm action={signOutOtherSessions} submitLabel="Sign out other devices" variant="secondary" />
      </section>
    </div>
  );
}
