import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

// Next loads `.env` for us at runtime, but Vitest does not — without this the
// integration tests find no DATABASE_URL and quietly skip themselves, which
// looks exactly like "no database available". The empty prefix loads every
// key, not just the VITE_-prefixed ones.
//
// This has to go through `test.env` below rather than mutating `process.env`
// here: tests run in their own worker, which does not inherit a mutation made
// while the config was being evaluated.
const env = loadEnv("test", root, "");

export default defineConfig({
  test: {
    // Node, not jsdom: what is worth testing here is server-side logic — the
    // permission matrix, ordering maths, upload sanitising — none of which
    // needs a DOM. Component tests can add their own environment later.
    environment: "node",
    include: ["src/**/*.test.ts"],
    env,
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // `server-only` exists to throw if a module is pulled into a client
      // bundle. That guard is exactly wrong under a test runner, which is
      // neither client nor server, so it is stubbed out here.
      "server-only": path.resolve(root, "src/test/server-only-stub.ts"),
    },
  },
});
