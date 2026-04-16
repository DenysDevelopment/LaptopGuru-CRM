-- CreateTable
CREATE TABLE "MobileUploadToken" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "videoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileUploadToken_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileUploadToken_videoId_key" ON "MobileUploadToken"("videoId");

-- CreateIndex
CREATE INDEX "MobileUploadToken_expiresAt_idx" ON "MobileUploadToken"("expiresAt");

-- CreateIndex
CREATE INDEX "MobileUploadToken_companyId_idx" ON "MobileUploadToken"("companyId");

-- CreateIndex
CREATE INDEX "MobileUploadToken_userId_idx" ON "MobileUploadToken"("userId");

-- AddForeignKey
ALTER TABLE "MobileUploadToken" ADD CONSTRAINT "MobileUploadToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileUploadToken" ADD CONSTRAINT "MobileUploadToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileUploadToken" ADD CONSTRAINT "MobileUploadToken_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;
