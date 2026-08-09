import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logError, logWarn, newErrorId } from "./logger";

/**
 * A logger earns its keep only if it is safe to leave on. These tests cover
 * the two ways it could do harm — leaking a credential into the log, or
 * throwing from inside a failure path — plus the reference id that ties a
 * user's screenshot to a log line.
 */

let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("newErrorId()", () => {
  it("is short enough to read aloud and different every time", () => {
    const ids = new Set(Array.from({ length: 500 }, newErrorId));
    expect(ids.size).toBeGreaterThan(495); // collisions must be rare
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]{1,8}$/);
    }
  });
});

describe("logError()", () => {
  it("returns the reference it logged", () => {
    const id = logError("test", new Error("boom"));
    expect(lines.join(" ")).toContain(id);
  });

  it("keeps the stack, which never leaves the server", () => {
    logError("test", new Error("boom"));
    expect(lines.join(" ")).toContain("boom");
  });

  it("redacts anything whose key looks like a credential", () => {
    logError("test", new Error("boom"), {
      apiKey: "sk-live-should-never-appear",
      authorization: "Bearer super-secret",
      sessionToken: "tok_secret",
      userPassword: "hunter2",
      cookie: "session=abc",
      // Ordinary context must survive — redaction that eats everything is
      // just as useless as no logging.
      workspaceId: "ws_123",
      attempt: 2,
    });

    const output = lines.join(" ");
    for (const secret of [
      "sk-live-should-never-appear",
      "super-secret",
      "tok_secret",
      "hunter2",
      "session=abc",
    ]) {
      expect(output, `leaked ${secret}`).not.toContain(secret);
    }
    expect(output).toContain("ws_123");
    expect(output).toContain("[redacted]");
  });

  it("scrubs credentials out of the error message itself", () => {
    // This is the case that actually bites: nobody passes a password in the
    // context, but a Prisma connection failure puts the whole DATABASE_URL
    // into its own message, and a fetch failure can quote an Authorization
    // header. Key-based redaction never sees either of them.
    logError(
      "test",
      new Error(
        "Can't reach database server at postgresql://kanovra:hunter2@db:5432/kanovra " +
          "(retried with Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def)",
      ),
    );
    const output = lines.join(" ");
    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("eyJhbGciOiJIUzI1NiJ9.abc.def");
    // Still diagnosable: host, port and database name are all intact.
    expect(output).toContain("db:5432");
  });

  it("scrubs provider API keys wherever they appear", () => {
    logError("test", new Error("Anthropic rejected key sk-ant-api03-AAAABBBBCCCCDDDD"), {
      note: "resend said re_ABCdef123456 was revoked",
    });
    const output = lines.join(" ");
    expect(output).not.toContain("sk-ant-api03-AAAABBBBCCCCDDDD");
    expect(output).not.toContain("re_ABCdef123456");
    expect(output).toContain("[redacted]");
  });

  it("survives values that cannot be serialised", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => logError("test", new Error("boom"), { circular })).not.toThrow();
  });

  it("handles being given something that is not an Error", () => {
    expect(() => logError("test", "just a string")).not.toThrow();
    expect(() => logError("test", null)).not.toThrow();
    expect(lines.join(" ")).toContain("just a string");
  });
});

describe("production output", () => {
  it("is exactly one line of valid JSON per entry", async () => {
    // `IS_DEV` is read when the module is evaluated, so the environment has to
    // be set before a fresh copy is imported. `stubEnv` rather than a direct
    // assignment because Next types `NODE_ENV` as read-only.
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const prod = await import("./logger");

    const captured: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      captured.push(String(line));
    });

    const id = prod.logError("probe", new Error("connection refused"), {
      workspaceId: "ws_abc",
      DATABASE_URL: "postgresql://user:hunter2@host/db",
    });

    vi.unstubAllEnvs();
    vi.resetModules();

    expect(captured).toHaveLength(1);
    expect(captured[0]).not.toContain("\n"); // one line, or log shippers split it
    const parsed = JSON.parse(captured[0]);
    expect(parsed).toMatchObject({ level: "error", scope: "probe", errorId: id });
    expect(parsed.error.message).toBe("connection refused");
    expect(parsed.workspaceId).toBe("ws_abc");
    // A connection string carries a password; the key matches the secret
    // pattern, so the value must not survive.
    expect(captured[0]).not.toContain("hunter2");
    // The host survives — it is what makes the log useful — but the password
    // is gone. `DATABASE_URL` matches no sensible key pattern, so this is
    // caught by scrubbing the value rather than by dropping the key.
    expect(parsed.DATABASE_URL).toBe("postgresql://user:[redacted]@host/db");
    expect(typeof parsed.at).toBe("string");
  });
});

describe("logWarn()", () => {
  it("records the message and redacts context the same way", () => {
    logWarn("test", "disk is filling up", { freeMb: 120, adminToken: "nope" });
    const output = lines.join(" ");
    expect(output).toContain("disk is filling up");
    expect(output).toContain("120");
    expect(output).not.toContain("nope");
  });
});
