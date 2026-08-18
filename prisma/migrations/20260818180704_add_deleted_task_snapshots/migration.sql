-- CreateTable
CREATE TABLE "deleted_tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deleted_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deleted_tasks_workspaceId_createdAt_idx" ON "deleted_tasks"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "deleted_tasks" ADD CONSTRAINT "deleted_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deleted_tasks" ADD CONSTRAINT "deleted_tasks_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
