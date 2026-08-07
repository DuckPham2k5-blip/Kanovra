import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ForbiddenError } from "@/lib/auth";

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
      return fail("Dữ liệu không hợp lệ.", error.flatten().fieldErrors as Record<string, string[]>);
    }
    if (error instanceof ForbiddenError) {
      return fail(error.message);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return fail("Giá trị này đã tồn tại, vui lòng chọn giá trị khác.");
      if (error.code === "P2025") return fail("Không tìm thấy dữ liệu cần thao tác.");
    }
    console.error("[action] unhandled error", error);
    return fail("Đã có lỗi xảy ra. Vui lòng thử lại.");
  }
}

/** Parses input with a schema, throwing so `withErrorHandling` can format it. */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  return schema.parse(input);
}

/** Messages reused across actions so the wording stays consistent. */
export const NOT_FOUND = "Không tìm thấy dữ liệu hoặc bạn không có quyền truy cập.";
export const NO_PERMISSION = "Bạn không có quyền thực hiện thao tác này.";
