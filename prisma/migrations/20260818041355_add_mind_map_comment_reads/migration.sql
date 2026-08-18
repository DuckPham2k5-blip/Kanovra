-- CreateTable
CREATE TABLE "mind_map_comment_reads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mind_map_comment_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mind_map_comment_reads_mapId_userId_idx" ON "mind_map_comment_reads"("mapId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "mind_map_comment_reads_userId_mapId_nodeId_key" ON "mind_map_comment_reads"("userId", "mapId", "nodeId");

-- AddForeignKey
ALTER TABLE "mind_map_comment_reads" ADD CONSTRAINT "mind_map_comment_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mind_map_comment_reads" ADD CONSTRAINT "mind_map_comment_reads_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "mind_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
