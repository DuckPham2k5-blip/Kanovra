-- Removes the bridge and double bubble map types.
--
-- The delete has to come first and has to live *inside* this migration. Postgres
-- cannot drop a value from an enum in place, so the swap below rebuilds the type
-- and casts the column across — and that cast fails while any row still holds a
-- value the new enum does not have. Doing the delete by hand beforehand would work
-- on this machine and fail on the VPS, where nobody has pre-cleaned the data.
--
-- Comments on these maps go with them: `mind_map_comments.mapId` is ON DELETE
-- CASCADE. Activity rows are deliberately left alone — they have no foreign key to
-- a map, and "X started a bridge map" is a true statement about something that did
-- happen.
DELETE FROM "mind_maps" WHERE "type" IN ('BRIDGE', 'DOUBLE_BUBBLE');

-- AlterEnum
BEGIN;
CREATE TYPE "MindMapType_new" AS ENUM ('CIRCLE', 'BUBBLE', 'TREE', 'FLOW', 'MULTI_FLOW', 'BRACE');
ALTER TABLE "mind_maps" ALTER COLUMN "type" TYPE "MindMapType_new" USING ("type"::text::"MindMapType_new");
ALTER TYPE "MindMapType" RENAME TO "MindMapType_old";
ALTER TYPE "MindMapType_new" RENAME TO "MindMapType";
DROP TYPE "MindMapType_old";
COMMIT;
