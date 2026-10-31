import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { NAV } from "@/lib/nav";
import { logout } from "@/lib/actions/auth";
import { Shell } from "@/components/shell";

export const metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  const nav = NAV.filter((i) => user.permissions.includes(i.permission)).map(({ label, href, icon, ready, phase }) => ({
    label, href, icon, ready, phase,
  }));

  const pendingCount = user.permissions.includes("orders.view") ? await db.order.count({ where: { status: "PENDING" } }) : 0;

  return (
    <Shell
      nav={nav}
      restaurantName={settings.name}
      timezone={settings.timezone}
      user={{ name: user.name, roleLabel: user.roleLabel }}
      pendingCount={pendingCount}
      listenOrders={user.permissions.includes("orders.view")}
      logoutAction={logout}
    >
      {children}
    </Shell>
  );
}
