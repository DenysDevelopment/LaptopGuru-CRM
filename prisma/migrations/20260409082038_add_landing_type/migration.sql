-- AlterTable
ALTER TABLE "Landing" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'email';

-- RenameIndex
ALTER INDEX "AnalyticsConversationDaily_companyId_date_channelType_status_ke" RENAME TO "AnalyticsConversationDaily_companyId_date_channelType_statu_key";
