import { Field, TextAreaField } from "@/components/fields";

export function CustomerFields({
  customer,
}: { customer?: { id: string; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <Field label="Name" name="name" defaultValue={customer?.name} required />
      <Field label="Phone" name="phone" type="tel" defaultValue={customer?.phone ?? ""} hint="Used to recognise repeat customers." />
      <Field label="Email" name="email" type="email" defaultValue={customer?.email ?? ""} />
      <Field label="Address" name="address" defaultValue={customer?.address ?? ""} />
      <TextAreaField label="Notes" name="notes" defaultValue={customer?.notes ?? ""} className="sm:col-span-2" />
    </div>
  );
}
