-- One task waiting on another. Additive: a new table and nothing else touched.
--
-- Hand-written rather than generated, for the same reason the flow-map removal
-- was: `prisma migrate dev` also regenerates the client, and the client's engine
-- DLL is held open by a running dev server on this machine.

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL,
    "blockedTaskId" TEXT NOT NULL,
    "blockingTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Asking "what is waiting on this task?" has no index without it: the unique
-- pair below covers the blocked side only.
CREATE INDEX "task_dependencies_blockingTaskId_idx" ON "task_dependencies"("blockingTaskId");

-- CreateIndex
-- Makes "add the same link twice" a no-op decided by the database, rather than a
-- race between two people pressing the same button.
CREATE UNIQUE INDEX "task_dependencies_blockedTaskId_blockingTaskId_key" ON "task_dependencies"("blockedTaskId", "blockingTaskId");

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blockedTaskId_fkey" FOREIGN KEY ("blockedTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blockingTaskId_fkey" FOREIGN KEY ("blockingTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
