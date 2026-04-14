-- CreateEnum
CREATE TYPE "VideoSessionEndReason" AS ENUM ('ENDED', 'PAUSED_LONG', 'CLOSED', 'NAVIGATED', 'ERROR', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "VideoPlaybackSession" (
    "id" TEXT NOT NULL,
    "landingVisitId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" "VideoSessionEndReason",
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "videoDurationMs" INTEGER NOT NULL,
    "trace" JSONB NOT NULL DEFAULT '[]',
    "chunksReceived" INTEGER NOT NULL DEFAULT 0,
    "durationWatchedMs" INTEGER,
    "uniqueSecondsWatched" INTEGER,
    "maxPositionMs" INTEGER,
    "completionPercent" DOUBLE PRECISION,
    "playCount" INTEGER,
    "pauseCount" INTEGER,
    "seekCount" INTEGER,
    "bufferCount" INTEGER,
    "bufferTimeMs" INTEGER,
    "errorCount" INTEGER,

    CONSTRAINT "VideoPlaybackSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSessionChunk" (
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoSessionChunk_pkey" PRIMARY KEY ("sessionId","seq")
);

-- CreateTable
CREATE TABLE "VideoSecondStats" (
    "videoId" TEXT NOT NULL,
    "second" INTEGER NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "replays" INTEGER NOT NULL DEFAULT 0,
    "pauseCount" INTEGER NOT NULL DEFAULT 0,
    "seekAwayCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VideoSecondStats_pkey" PRIMARY KEY ("videoId","second")
);

-- CreateIndex
CREATE INDEX "VideoPlaybackSession_videoId_startedAt_idx" ON "VideoPlaybackSession"("videoId", "startedAt");

-- CreateIndex
CREATE INDEX "VideoPlaybackSession_companyId_startedAt_idx" ON "VideoPlaybackSession"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "VideoPlaybackSession_finalized_updatedAt_idx" ON "VideoPlaybackSession"("finalized", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoPlaybackSession_landingVisitId_videoId_startedAt_key" ON "VideoPlaybackSession"("landingVisitId", "videoId", "startedAt");

-- CreateIndex
CREATE INDEX "VideoSecondStats_videoId_idx" ON "VideoSecondStats"("videoId");

-- AddForeignKey
ALTER TABLE "VideoPlaybackSession" ADD CONSTRAINT "VideoPlaybackSession_landingVisitId_fkey" FOREIGN KEY ("landingVisitId") REFERENCES "LandingVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoPlaybackSession" ADD CONSTRAINT "VideoPlaybackSession_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSecondStats" ADD CONSTRAINT "VideoSecondStats_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
