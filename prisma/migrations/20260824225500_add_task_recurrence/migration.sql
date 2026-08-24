-- How often a task comes back. Additive: one nullable column, nothing rewritten.
--
-- Null means "does not repeat", which is every row that exists today, so there
-- is no backfill and no default to argue about.
--
-- Hand-written for the reason the last three were: `prisma migrate dev` also
-- regenerates the client, and the client's engine DLL is held open by a running
-- dev server on this machine.

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "recurrence" TEXT;
