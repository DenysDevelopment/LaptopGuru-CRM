-- CreateEnum
CREATE TYPE "VideoSource" AS ENUM ('YOUTUBE', 'S3');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoEventType" AS ENUM ('PLAY', 'PAUSE', 'SEEK', 'ENDED', 'HEARTBEAT', 'RATE_CHANGE', 'QUALITY_CHANGE', 'FULLSCREEN', 'ERROR');

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "cloudFrontThumbUrl" TEXT,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "fileSize" BIGINT,
ADD COLUMN     "mediaConvertJobId" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "s3Bucket" TEXT,
ADD COLUMN     "s3KeyOriginal" TEXT,
ADD COLUMN     "s3KeyOutput" TEXT,
ADD COLUMN     "s3KeyThumb" TEXT,
ADD COLUMN     "source" "VideoSource" NOT NULL DEFAULT 'YOUTUBE',
ADD COLUMN     "status" "VideoStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "uploadError" TEXT,
ADD COLUMN     "youtubeQuotaRetryAt" TIMESTAMP(3),
ADD COLUMN     "youtubeUploadError" TEXT,
ADD COLUMN     "youtubeUploadStatus" TEXT,
ALTER COLUMN "youtubeId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "VideoWatchEvent" (
    "id" TEXT NOT NULL,
    "landingVisitId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "eventType" "VideoEventType" NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "seekFrom" DOUBLE PRECISION,
    "seekTo" DOUBLE PRECISION,
    "playbackRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "volume" DOUBLE PRECISION,
    "isFullscreen" BOOLEAN,
    "errorMessage" TEXT,
    "clientTimestamp" TIMESTAMP(3) NOT NULL,
    "serverTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "VideoWatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoWatchEvent_videoId_serverTimestamp_idx" ON "VideoWatchEvent"("videoId", "serverTimestamp");

-- CreateIndex
CREATE INDEX "VideoWatchEvent_videoId_eventType_idx" ON "VideoWatchEvent"("videoId", "eventType");

-- CreateIndex
CREATE INDEX "VideoWatchEvent_landingVisitId_idx" ON "VideoWatchEvent"("landingVisitId");

-- CreateIndex
CREATE INDEX "VideoWatchEvent_companyId_idx" ON "VideoWatchEvent"("companyId");

-- CreateIndex
CREATE INDEX "Video_companyId_status_idx" ON "Video"("companyId", "status");

-- AddForeignKey
ALTER TABLE "VideoWatchEvent" ADD CONSTRAINT "VideoWatchEvent_landingVisitId_fkey" FOREIGN KEY ("landingVisitId") REFERENCES "LandingVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoWatchEvent" ADD CONSTRAINT "VideoWatchEvent_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoWatchEvent" ADD CONSTRAINT "VideoWatchEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
