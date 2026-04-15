-- AlterEnum
ALTER TYPE "VideoEventType" ADD VALUE 'BUFFERING';

-- AlterTable
ALTER TABLE "LandingVisit" ADD COLUMN     "videoBufferCount" INTEGER,
ADD COLUMN     "videoBufferTime" INTEGER,
ADD COLUMN     "videoDroppedFrames" INTEGER,
ADD COLUMN     "videoTimeToPlay" INTEGER;
