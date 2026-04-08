-- DropIndex
DROP INDEX "IncomingEmail_messageId_key";

-- CreateIndex
CREATE UNIQUE INDEX "IncomingEmail_messageId_companyId_key" ON "IncomingEmail"("messageId", "companyId");
