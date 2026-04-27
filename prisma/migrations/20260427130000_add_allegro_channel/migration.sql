-- Allegro Direct: new channel type
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'ALLEGRO';

-- Allegro link metadata on the landing record
ALTER TABLE "Landing"
  ADD COLUMN "allegroThreadId"   TEXT,
  ADD COLUMN "allegroBuyerLogin" TEXT;

CREATE INDEX "Landing_allegroThreadId_idx"   ON "Landing"("allegroThreadId");
CREATE INDEX "Landing_allegroBuyerLogin_idx" ON "Landing"("allegroBuyerLogin");
