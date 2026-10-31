import "server-only";
import type { z } from "zod";
import { AuthError } from "@/lib/auth";
import { BusinessError } from "@/lib/errors";
import type { ActionState } from "@/lib/types";

/** Wraps an action body: turns auth problems and unexpected failures into friendly messages. */
export async function handle(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError || e instanceof BusinessError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong and nothing was saved. Please try again." };
  }
}

export function validationError(error: z.ZodError): ActionState {
  return {
    error: "Please fix the fields below.",
    fieldErrors: error.flatten().fieldErrors as Record<string, string[] | undefined>,
  };
}
