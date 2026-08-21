-- Removes the flow map type.
--
-- Same shape as the bridge and double bubble removal, and for the same reason:
-- the delete has to come first and has to live *inside* this migration. Postgres
-- cannot drop a value from an enum in place, so the swap below rebuilds the type
-- and casts the column across — and that cast fails while any row still holds a
-- value the new enum does not have. Doing the delete by hand beforehand would
-- work on this machine and fail on the VPS, where nobody has pre-cleaned the
-- data.
--
-- Fifteen rows go. Every one was listed first: all throwaway, at most six nodes,
-- and not one of them carried a comment. Comments would have gone with them
-- anyway — `mind_map_comments.mapId` is ON DELETE CASCADE — and so would the
-- read markers on those comments.
--
-- Activity rows are deliberately left alone. They have no foreign key to a map,
-- and "X started a flow map" is a true statement about something that did
-- happen. A log is not rewritten to match a later product decision.
DELETE FROM "mind_maps" WHERE "type" = 'FLOW';

-- AlterEnum
BEGIN;
CREATE TYPE "MindMapType_new" AS ENUM ('CIRCLE', 'BUBBLE', 'TREE', 'MULTI_FLOW', 'BRACE');
ALTER TABLE "mind_maps" ALTER COLUMN "type" TYPE "MindMapType_new" USING ("type"::text::"MindMapType_new");
ALTER TYPE "MindMapType" RENAME TO "MindMapType_old";
ALTER TYPE "MindMapType_new" RENAME TO "MindMapType";
DROP TYPE "MindMapType_old";
COMMIT;
