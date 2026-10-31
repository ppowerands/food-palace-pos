"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children?: ReactNode;
  resetOnSuccess?: boolean;
  confirmMessage?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  buttonClassName?: string;
};

// Submits through a server action without resetting the fields on error,
// and shows the result (success, error, per-field problems) under the fields.
export function ActionForm({
  action, submitLabel, children, resetOnSuccess, confirmMessage, variant = "primary", className, buttonClassName,
}: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(data);
    });
  }

  const fieldProblems = Object.entries(state?.fieldErrors ?? {}).filter(([, v]) => v && v.length > 0);

  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      {children}
      {state?.error && (
        <div role="alert" className="mt-3 rounded-lg bg-chili-50 px-3 py-2 text-sm text-chili-600">
          {state.error}
          {fieldProblems.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {fieldProblems.map(([field, msgs]) => (
                <li key={field}>
                  <span className="font-medium">{field}</span>: {msgs?.[0]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state?.ok && state.message && (
        <div role="status" className="mt-3 rounded-lg bg-leaf-50 px-3 py-2 text-sm text-leaf-700">{state.message}</div>
      )}
      <button
        type="submit"
        disabled={pending}
        className={cn("btn mt-3", variant === "primary" && "btn-primary", variant === "secondary" && "btn-secondary", variant === "danger" && "btn-danger", buttonClassName)}
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
