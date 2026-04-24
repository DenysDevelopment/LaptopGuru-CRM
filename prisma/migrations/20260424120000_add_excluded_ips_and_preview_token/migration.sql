-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Per-company allowlist of IPs to exclude from landing/quicklink analytics
ALTER TABLE "Company"
  ADD COLUMN "excludedIps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Per-landing preview token; random uuid-text default covers existing rows
ALTER TABLE "Landing"
  ADD COLUMN "previewToken" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX "Landing_previewToken_key" ON "Landing"("previewToken");
