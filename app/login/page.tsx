import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { login } from "@/lib/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  const settings = await getSettings();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="hidden flex-col justify-between bg-palm-900 p-12 text-paper-100 lg:flex">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gold-400 font-display text-lg font-bold text-palm-950">FP</div>
        <div>
          <p className="font-display text-6xl font-semibold leading-[1.05]">{settings.name}</p>
          <p className="mt-5 max-w-md text-lg text-paper-100/70">
            Every order, payment and change is recorded. Nothing gets lost between the counter and the kitchen.
          </p>
        </div>
        <p className="text-sm text-paper-100/50">Staff sign-in only</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-ink-600">Use the account your manager created for you.</p>
          <ActionForm action={login} submitLabel="Sign in" className="mt-6" buttonClassName="w-full">
            <div className="space-y-4">
              <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
              <Field label="Password" name="password" type="password" autoComplete="current-password" required />
            </div>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
