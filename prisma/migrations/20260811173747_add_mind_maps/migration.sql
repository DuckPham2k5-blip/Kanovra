-- CreateEnum
CREATE TYPE "MindMapType" AS ENUM ('CIRCLE', 'BUBBLE', 'DOUBLE_BUBBLE', 'TREE', 'FLOW', 'MULTI_FLOW', 'BRACE', 'BRIDGE');

-- CreateTable
CREATE TABLE "mind_maps" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" "MindMapType" NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mind_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mind_maps_workspaceId_idx" ON "mind_maps"("workspaceId");

-- CreateIndex
CREATE INDEX "mind_maps_projectId_idx" ON "mind_maps"("projectId");

-- AddForeignKey
ALTER TABLE "mind_maps" ADD CONSTRAINT "mind_maps_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mind_maps" ADD CONSTRAINT "mind_maps_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mind_maps" ADD CONSTRAINT "mind_maps_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
