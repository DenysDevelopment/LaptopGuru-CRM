-- DropForeignKey
ALTER TABLE "VideoWatchEvent" DROP CONSTRAINT "VideoWatchEvent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "VideoWatchEvent" DROP CONSTRAINT "VideoWatchEvent_landingVisitId_fkey";

-- DropForeignKey
ALTER TABLE "VideoWatchEvent" DROP CONSTRAINT "VideoWatchEvent_videoId_fkey";

-- DropTable
DROP TABLE "VideoWatchEvent";

-- DropEnum
DROP TYPE "VideoEventType";
