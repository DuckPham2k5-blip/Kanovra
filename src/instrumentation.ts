import type { Instrumentation } from "next";

/**
 * Catches server-side errors that no `try/catch` of ours saw — a throw inside
 * a Server Component, a route handler, or rendering itself. Without this they
 * only ever appear as an unstructured stack in stdout, with nothing tying them
 * to the request that caused them.
 *
 * The logger is imported lazily: `instrumentation.ts` is evaluated in the Edge
 * runtime as well as Node, and `logger.ts` is server-only.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const { logError } = await import("@/lib/logger");

  logError("request", error, {
    // Query strings are dropped on purpose: they routinely carry ids and
    // filters that are not worth persisting into a log.
    path: request.path?.split("?")[0],
    method: request.method,
    router: context.routerKind,
    route: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
  });
};
