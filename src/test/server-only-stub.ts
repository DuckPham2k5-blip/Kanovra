/**
 * Stands in for the `server-only` package under Vitest.
 *
 * That package throws on import so a server module can never be bundled into
 * client code. A test runner is neither, so importing the real thing would
 * fail every suite that touches a server module; aliasing it here (see
 * vitest.config.mts) keeps the guard in the real build and out of the tests.
 */
export {};
