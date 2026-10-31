import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createCustomer } from "@/lib/actions/customers";
import { ActionForm } from "@/components/action-form";
import { CustomerFields } from "@/components/customer-fields";

export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  await requirePermission("customers.manage");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/customers" className="text-sm text-palm-700">← Customers</Link>
      <h2 className="font-display text-2xl font-semibold">Add customer</h2>
      <div className="panel p-4 sm:p-6">
        <ActionForm action={createCustomer} submitLabel="Add customer">
          <CustomerFields />
        </ActionForm>
      </div>
    </div>
  );
}
