-- VideoSecondStats is a derived aggregate (rebuildable from
-- VideoPlaybackSession.trace), so we TRUNCATE instead of backfilling.
-- Pre-existing rows had no landingId and bled retention across landings
-- on the per-landing analytics view.
TRUNCATE TABLE "VideoSecondStats";

-- DropPrimaryKey
ALTER TABLE "VideoSecondStats" DROP CONSTRAINT "VideoSecondStats_pkey";

-- AddColumn
ALTER TABLE "VideoSecondStats" ADD COLUMN "landingId" TEXT NOT NULL;

-- AddPrimaryKey
ALTER TABLE "VideoSecondStats" ADD CONSTRAINT "VideoSecondStats_pkey" PRIMARY KEY ("videoId", "landingId", "second");

-- CreateIndex
CREATE INDEX "VideoSecondStats_videoId_second_idx" ON "VideoSecondStats"("videoId", "second");

-- AddForeignKey
ALTER TABLE "VideoSecondStats" ADD CONSTRAINT "VideoSecondStats_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "Landing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
