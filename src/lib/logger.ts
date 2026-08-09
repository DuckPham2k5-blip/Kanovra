import "server-only";

/**
 * Structured error logging.
 *
 * Deliberately dependency-free. On a VPS the practical question is "the user
 * says it broke — which log line was that?", and the answer is a short
 * reference printed on screen and attached to one machine-readable log entry.
 * That works with nothing more than `docker logs` or `pm2 logs`.
 *
 * Every entry is a single JSON line in production so it can be grepped or
 * shipped without a parser; development gets a readable form instead.
 *
 * Set `ERROR_WEBHOOK_URL` to also push errors to Slack, Discord or anything
 * else that accepts a JSON POST. Reporting is fire-and-forget and can never
 * delay or fail the request that triggered it.
 */

const WEBHOOK_URL = process.env.ERROR_WEBHOOK_URL;
const IS_DEV = process.env.NODE_ENV !== "production";

/** Context keys whose values are never safe to print. */
const SECRET_KEY =
  /token|secret|password|passwd|api[-_]?key|authorization|cookie|session|credential|dsn/i;

/**
 * Credentials also have to be stripped out of strings, not just dropped by key
 * name. Two cases motivate this: a key like `DATABASE_URL` matches no sensible
 * name pattern yet embeds a password, and a thrown Prisma error puts the whole
 * connection string into its own message — so scrubbing only the context would
 * still leak it via the stack.
 */
const VALUE_SCRUBBERS: [RegExp, string][] = [
  // scheme://user:password@host  ->  keep the host, drop the password
  [/(\w+:\/\/[^/\s:@]+:)[^@\s]+@/g, "$1[redacted]@"],
  // Authorization headers quoted into a message.
  [/(bearer\s+)[\w.\-~+/]+=*/gi, "$1[redacted]"],
  // Provider key prefixes: Clerk, Stripe, Anthropic, Resend, GitHub, Slack.
  // The body has to allow separators, not just alphanumerics — an Anthropic
  // key is `sk-ant-api03-…`, so a pattern that stops at the first hyphen
  // matches three characters and leaves the secret in the log.
  [/\b(sk|pk|rk)[-_][A-Za-z0-9_-]{10,}/g, "$1_[redacted]"],
  [/\b(whsec|re|ghp|gho|ghs|xox[abprs])[-_][A-Za-z0-9_-]{8,}/g, "$1_[redacted]"],
];

function scrub(value: string) {
  let out = value;
  for (const [pattern, replacement] of VALUE_SCRUBBERS) out = out.replace(pattern, replacement);
  return out;
}

export type LogContext = Record<string, unknown>;

/**
 * Short, unambiguous, and easy to read back over the phone. Not a UUID: this
 * only has to be unique among recent errors, and users have to be able to
 * retype it.
 */
export function newErrorId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Drops secret-looking values and anything that cannot be serialised. */
function redact(context: LogContext | undefined): LogContext {
  if (!context) return {};
  const safe: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (SECRET_KEY.test(key)) {
      safe[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string") {
      safe[key] = scrub(value);
    } else if (value === null || typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    } else if (value !== undefined) {
      safe[key] = scrub(String(value));
    }
  }
  return safe;
}

function describe(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      // Scrubbed as well as the context: a Prisma connection failure quotes the
      // whole `DATABASE_URL` — password included — into its own message.
      message: scrub(error.message),
      // Stacks are the whole point of a server log; they never reach the client.
      stack: error.stack ? scrub(error.stack) : undefined,
      cause: error.cause ? scrub(String(error.cause)) : undefined,
    };
  }
  return { name: "NonError", message: scrub(String(error)) };
}

function emit(entry: Record<string, unknown>) {
  if (IS_DEV) {
    const { scope, errorId, error, ...rest } = entry as Record<string, never>;
    console.error(`[${scope}] ${errorId ? `(${errorId}) ` : ""}`, error ?? "", rest);
    return;
  }
  console.error(JSON.stringify(entry));
}

function forward(entry: Record<string, unknown>) {
  if (!WEBHOOK_URL) return;
  // Never awaited: an unreachable webhook must not slow a request down, and a
  // failure to report an error must not itself throw.
  void fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `[${entry.scope}] ${entry.errorId ?? ""}`, ...entry }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

/**
 * Records an error and returns the reference to show the user. Callers should
 * surface that string so a screenshot maps to exactly one log line.
 */
export function logError(scope: string, error: unknown, context?: LogContext): string {
  const errorId = newErrorId();
  const entry = {
    level: "error",
    scope,
    errorId,
    at: new Date().toISOString(),
    error: describe(error),
    ...redact(context),
  };
  emit(entry);
  forward(entry);
  return errorId;
}

/** For conditions worth noticing that did not break the request. */
export function logWarn(scope: string, message: string, context?: LogContext) {
  emit({ level: "warn", scope, at: new Date().toISOString(), message, ...redact(context) });
}
