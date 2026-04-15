import { beforeEach } from 'vitest';

// ioredis-mock shares an in-memory context across instances keyed by host:port/db.
// Flush all keys before each test so tests are isolated from one another.
beforeEach(async () => {
  const { default: Redis } = await import('ioredis-mock');
  const r = new Redis();
  await r.flushall();
});
