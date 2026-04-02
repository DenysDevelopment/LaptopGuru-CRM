-- Fix analytics unique constraints: add companyId to prevent cross-tenant collisions

-- AnalyticsMessageDaily
DROP INDEX IF EXISTS "AnalyticsMessageDaily_date_channelType_direction_key";
CREATE UNIQUE INDEX "AnalyticsMessageDaily_companyId_date_channelType_direction_key"
  ON "AnalyticsMessageDaily"("companyId", "date", "channelType", "direction");

-- AnalyticsConversationDaily
DROP INDEX IF EXISTS "AnalyticsConversationDaily_date_channelType_status_key";
CREATE UNIQUE INDEX "AnalyticsConversationDaily_companyId_date_channelType_status_key"
  ON "AnalyticsConversationDaily"("companyId", "date", "channelType", "status");

-- AnalyticsResponseTime
DROP INDEX IF EXISTS "AnalyticsResponseTime_date_userId_channelType_key";
CREATE UNIQUE INDEX "AnalyticsResponseTime_companyId_date_userId_channelType_key"
  ON "AnalyticsResponseTime"("companyId", "date", "userId", "channelType");
