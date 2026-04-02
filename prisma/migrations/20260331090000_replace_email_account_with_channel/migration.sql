-- AlterTable: Add channelId to IncomingEmail
ALTER TABLE "IncomingEmail" ADD COLUMN "channelId" TEXT;

-- Migrate data: map accountId -> channelId
UPDATE "IncomingEmail" SET "channelId" = 'email-main' WHERE "accountId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "IncomingEmail" ADD CONSTRAINT "IncomingEmail_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "IncomingEmail_channelId_idx" ON "IncomingEmail"("channelId");

-- Drop old accountId
ALTER TABLE "IncomingEmail" DROP CONSTRAINT IF EXISTS "IncomingEmail_accountId_fkey";
DROP INDEX IF EXISTS "IncomingEmail_accountId_idx";
ALTER TABLE "IncomingEmail" DROP COLUMN "accountId";

-- DropTable
DROP TABLE IF EXISTS "EmailAccount";
