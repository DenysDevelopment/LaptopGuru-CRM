-- AlterTable
ALTER TABLE "Company" ADD COLUMN "customDomain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_customDomain_key" ON "Company"("customDomain");
