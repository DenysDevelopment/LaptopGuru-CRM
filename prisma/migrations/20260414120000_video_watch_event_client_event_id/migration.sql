-- Add clientEventId for idempotent ingestion of video watch events.
-- Step 1: add as nullable, backfill with the existing primary key (already unique per row),
-- then mark NOT NULL and add the (landingVisitId, clientEventId) unique constraint.

ALTER TABLE "VideoWatchEvent" ADD COLUMN "clientEventId" TEXT;

UPDATE "VideoWatchEvent" SET "clientEventId" = "id" WHERE "clientEventId" IS NULL;

ALTER TABLE "VideoWatchEvent" ALTER COLUMN "clientEventId" SET NOT NULL;

CREATE UNIQUE INDEX "VideoWatchEvent_landingVisitId_clientEventId_key"
  ON "VideoWatchEvent"("landingVisitId", "clientEventId");
