-- AlterTable
ALTER TABLE "users" ADD COLUMN     "focus" TEXT;

-- CreateTable
CREATE TABLE "mind_map_comments" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mind_map_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mind_map_comments_mapId_idx" ON "mind_map_comments"("mapId");

-- CreateIndex
CREATE INDEX "mind_map_comments_mapId_nodeId_idx" ON "mind_map_comments"("mapId", "nodeId");

-- AddForeignKey
ALTER TABLE "mind_map_comments" ADD CONSTRAINT "mind_map_comments_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "mind_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mind_map_comments" ADD CONSTRAINT "mind_map_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
