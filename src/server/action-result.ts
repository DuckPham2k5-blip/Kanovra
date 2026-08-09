import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ForbiddenError } from "@/lib/auth";
import { logError } from "@/lib/logger";

/**
 * Uniform return shape for every server action. Clients only ever branch on
 * `success`, which keeps call sites in the UI short and consistent.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { success: false, error, fieldErrors };
}

/**
 * Wraps an action body, translating the errors we expect into friendly
 * messages. Anything unexpected is logged and reported generically so we never
 * leak internals to the browser.
 */
export async function withErrorHandling<T>(fn: () => Promise<ActionResult<T>>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail("That data is not valid.", error.flatten().fieldErrors as Record<string, string[]>);
    }
    if (error instanceof ForbiddenError) {
      return fail(error.message);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return fail("That value already exists — please choose another.");
      if (error.code === "P2025") return fail("The record you are acting on no longer exists.");
    }
    // Unexpected: log it with a reference and show the user that reference, so
    // a bug report or a screenshot points at exactly one line in the server log
    // instead of "it broke sometime this afternoon".
    const errorId = logError("action", error);
    return fail(`Something went wrong. Please try again. (ref: ${errorId})`);
  }
}

/** Parses input with a schema, throwing so `withErrorHandling` can format it. */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  return schema.parse(input);
}

/** Messages reused across actions so the wording stays consistent. */
export const NOT_FOUND = "Not found, or you do not have access to it.";
export const NO_PERMISSION = "You don't have permission to do that.";
