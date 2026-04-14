-- Add VOLUME_CHANGE value to VideoEventType enum.
-- Postgres requires ALTER TYPE ... ADD VALUE to run outside a transaction
-- when IF NOT EXISTS is used, but Prisma wraps migrations in a transaction
-- so we use the unconditional form (safe: rerunning migrations is prevented
-- by Prisma's _prisma_migrations table).

ALTER TYPE "VideoEventType" ADD VALUE 'VOLUME_CHANGE';
