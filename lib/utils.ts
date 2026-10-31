import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function humanize(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/[._-]/g, " ").trim().toLowerCase();
}

/** Compare current values with proposed ones; returns only what actually changed. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = String(before[key] ?? "");
    const b = String(after[key] ?? "");
    if (a !== b) {
      oldValue[key] = before[key] ?? null;
      newValue[key] = after[key] ?? null;
    }
  }
  return { oldValue, newValue, changed: Object.keys(oldValue) };
}
