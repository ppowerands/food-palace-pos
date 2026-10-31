import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label, hint, className, ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      <input className="input" {...props} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function TextAreaField({
  label, hint, className, ...props
}: { label: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      <textarea rows={2} className="input" {...props} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label, options, hint, className, ...props
}: { label: string; hint?: string; options: { value: string; label: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      <select className="input" {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function CheckField({
  label, hint, className, ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("flex items-start gap-3 py-1", className)}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-paper-300 accent-palm-700" {...props} />
      <span>
        <span className="text-sm font-medium text-ink-800">{label}</span>
        {hint && <span className="hint mt-0">{hint}</span>}
      </span>
    </label>
  );
}
