-- Time actually spent on a task, beside the `estimate` that was guessed before
-- starting. Purely additive: one new table, no existing column touched, so it
-- carries no data-loss warning and applies the same on an empty VPS as here.
--
-- Hand-written rather than produced by `prisma migrate dev`, for the reason
-- already recorded in CLAUDE.md: `migrate dev` regenerates the client, and the
-- generator cannot take `query_engine-windows.dll.node` from a running dev
-- server.
--
-- No `minutes` column. A duration is `endedAt - startedAt`, computed where it is
-- read; a stored copy beside the interval is a second source of truth that
-- drifts the first time a row is edited or a clock is corrected.

CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    -- NULL means the timer is still running.
    "endedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "time_entries_taskId_idx" ON "time_entries"("taskId");

-- Finding the one entry a person still has running.
CREATE INDEX "time_entries_userId_endedAt_idx" ON "time_entries"("userId", "endedAt");

-- Cascades on both sides: a deleted task takes its time with it, and so does a
-- deleted account. Time logged against a task that no longer exists cannot be
-- read, reported or corrected, so keeping it would only make the totals wrong.
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
