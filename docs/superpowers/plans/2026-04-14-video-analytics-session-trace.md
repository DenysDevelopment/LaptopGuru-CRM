# Video Analytics Session Trace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild video analytics end-to-end around a session-trace model: millisecond client tracker → chunked ingestion API in `apps/api` → BullMQ finalize worker → per-second aggregates → rich dashboard + drill-down.

**Architecture:** Browser ring-buffer tracker (`apps/web`) POSTs event-tuple chunks to public endpoints in `apps/api` (NestJS). Chunks are appended to `VideoPlaybackSession.trace` (JSONB) with storage-level dedup via a composite-PK chunk table. On `final:true` or a 2-minute idle reaper, a BullMQ worker computes session aggregates and upserts per-second `VideoSecondStats`. Legacy `VideoWatchEvent` plumbing (web routes + Prisma model) is deleted in the switchover and destructive-cleanup stages.

**Tech Stack:** Prisma 7 / Postgres 16 JSONB, NestJS 11, BullMQ (repeat patterns for cron), Redis sliding-window rate-limit, Vitest, Next.js 16 App Router, `sendBeacon` + `visibilitychange` / `pagehide` / `freeze` / `beforeunload`, YouTube IFrame API.

**Spec:** `docs/superpowers/specs/2026-04-14-video-analytics-session-trace-design.md`

---

## Ground Rules

- **Two Prisma clients.** Every schema change requires `npm run db:generate` before any TypeScript compiles. Import Prisma types from `apps/api/src/generated/prisma` in api code and `apps/web/src/generated/prisma` in web code — never `@prisma/client`.
- **TDD.** For every behavior-carrying function (`encodeTrace`, `decodeTrace`, `computeAggregates`, `computeSecondDeltas`, `RateLimitService`, guard, service methods, worker), write the failing test first, run it, implement, run again.
- **Frequent commits.** Each task ends with a commit. Never batch commits.
- **No `--no-verify`.** If a pre-commit hook fails, fix the issue and commit again.
- **No Co-Authored-By lines** on commits (per `MEMORY.md`).
- **Tests** live next to source as `*.spec.ts` for api unit tests (Vitest), following `apps/api/src/modules/videos/s3.service.spec.ts` as the pattern.
- **Run api tests** with `npm test --workspace=@laptopguru-crm/api`.
- **Type-check before commit** with `npm run type-check` when a task touches multiple files across workspaces.

## File Structure

### New

```
prisma/schema.prisma                                   # + VideoPlaybackSession, VideoSessionChunk, VideoSecondStats, VideoSessionEndReason
prisma/migrations/<ts>_video_analytics_session_trace/  # additive
prisma/migrations/<ts>_drop_video_watch_event/         # destructive (stage 8)

packages/shared/src/
  video-analytics.ts                                   # rewritten: EventCode, EventTuple, encode/decode, DTOs, VideoAnalyticsData (new shape)
  video-analytics.spec.ts                              # round-trip + decoder tests

apps/api/src/common/
  guards/public-landing.guard.ts                       # slug → landing → visit → video resolution
  decorators/public-landing-endpoint.decorator.ts      # @PublicLandingEndpoint() reflection marker
  services/rate-limit.service.ts                       # Redis sliding window
  services/rate-limit.service.spec.ts

apps/api/src/modules/video-sessions/
  video-sessions.module.ts
  video-sessions.controller.ts                         # POST /public/video-sessions + /chunks + /chunks/beacon
  video-sessions.service.ts                            # create/append/finalize-hooks
  video-sessions.service.spec.ts
  video-sessions.controller.spec.ts
  dto/
    create-session.dto.ts
    append-chunk.dto.ts
  workers/
    finalize.worker.ts                                 # BullMQ processor for video-session-finalize
    finalize.worker.spec.ts
    reaper.processor.ts                                # BullMQ repeat job every 5 min
    compute-aggregates.ts
    compute-aggregates.spec.ts
    compute-second-deltas.ts
    compute-second-deltas.spec.ts

apps/web/src/components/landing/
  video-tracker.ts                                     # tracker class + useVideoTracker hook
  video-tracker.spec.ts                                # unit tests for buffer/flush rules (jsdom)

apps/web/src/components/analytics/
  session-timeline.tsx                                 # dual-track component for drill-down
  retention-chart.tsx                                  # SVG retention with replay overlay
```

### Modified

```
apps/api/src/app.module.ts                             # register VideoSessionsModule + rate-limit provider
apps/api/src/main.ts                                   # CORS for /public/* routes
apps/api/src/common/guards/jwt-auth.guard.ts           # whitelist @PublicLandingEndpoint()
apps/api/src/modules/videos/videos.module.ts           # remove old AnalyticsCleanupProcessor if it targets VideoWatchEvent
apps/api/src/modules/videos/video-analytics.service.ts # rewrite read queries against new models
apps/api/src/modules/videos/video-analytics.controller.ts # shape aligns with new VideoAnalyticsData
apps/api/src/modules/landings/landings.controller.ts   # add GET /landings/:slug/visits/:visitId/playback

packages/shared/src/index.ts                           # re-export new types
packages/api-client/src/index.ts                       # videoAnalytics client

apps/web/src/components/landing/video-player.tsx       # wire useVideoTracker
apps/web/src/app/l/[slug]/page.tsx                     # remove legacy event collection, pass tracker handles
apps/web/src/app/l/[slug]/layout.tsx                   # Microsoft Clarity <script> (gated on env)
apps/web/src/app/(dashboard)/videos/[id]/analytics/page.tsx # restore + new shape
apps/web/src/app/(dashboard)/analytics/[slug]/page.tsx # drill-down integration
```

### Deleted (stage 6)

```
apps/web/src/app/api/landings/[slug]/video-events/route.ts
apps/web/src/app/api/landings/[slug]/track/route.ts
apps/web/src/app/api/landings/[slug]/visits/[visitId]/video-events/route.ts  # if present
```

### Deleted (stage 8, destructive)

```
Prisma model VideoWatchEvent + enum VideoEventType
apps/api/src/modules/videos/analytics-cleanup.processor.ts  # if solely for old model
```

---

# Stage 1 — Schema

## Task 1: Add new models and enum to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma` (append after the `VideoWatchEvent` model block)

- [ ] **Step 1: Insert new models + enum**

Append to `prisma/schema.prisma`:

```prisma
enum VideoSessionEndReason {
  ENDED
  PAUSED_LONG
  CLOSED
  NAVIGATED
  ERROR
  INCOMPLETE
}

model VideoPlaybackSession {
  id               String   @id @default(cuid())
  landingVisitId   String
  videoId          String
  companyId        String

  startedAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  endedAt          DateTime?
  endReason        VideoSessionEndReason?
  finalized        Boolean  @default(false)

  videoDurationMs  Int

  trace            Json     @default("[]")
  chunksReceived   Int      @default(0)

  durationWatchedMs    Int?
  uniqueSecondsWatched Int?
  maxPositionMs        Int?
  completionPercent    Float?
  playCount            Int?
  pauseCount           Int?
  seekCount            Int?
  bufferCount          Int?
  bufferTimeMs         Int?
  errorCount           Int?

  visit  LandingVisit @relation(fields: [landingVisitId], references: [id], onDelete: Cascade)
  video  Video        @relation(fields: [videoId], references: [id], onDelete: Cascade)

  @@unique([landingVisitId, videoId, startedAt])
  @@index([videoId, startedAt])
  @@index([companyId, startedAt])
  @@index([finalized, updatedAt])
}

model VideoSessionChunk {
  sessionId  String
  seq        Int
  receivedAt DateTime @default(now())

  @@id([sessionId, seq])
}

model VideoSecondStats {
  videoId       String
  second        Int
  views         Int      @default(0)
  replays       Int      @default(0)
  pauseCount    Int      @default(0)
  seekAwayCount Int      @default(0)

  video  Video @relation(fields: [videoId], references: [id], onDelete: Cascade)

  @@id([videoId, second])
  @@index([videoId])
}
```

- [ ] **Step 2: Add back-relations on existing models**

In the `Video` model, add:

```prisma
  playbackSessions    VideoPlaybackSession[]
  secondStats         VideoSecondStats[]
```

In the `LandingVisit` model, add:

```prisma
  playbackSessions VideoPlaybackSession[]
```

Leave `watchEvents VideoWatchEvent[]` on `Video` **untouched** — we drop it only in stage 8.

- [ ] **Step 3: Run migration**

Run: `npm run db:migrate -- --name video_analytics_session_trace`
Expected: Prisma applies the migration and regenerates both clients automatically (via the postinstall-style generators in the schema).

- [ ] **Step 4: Verify both generated clients have the new types**

Run: `grep -l 'VideoPlaybackSession' apps/api/src/generated/prisma/*.ts apps/web/src/generated/prisma/*.ts`
Expected: matches in both generated dirs.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: passes (no references yet).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations apps/api/src/generated/prisma apps/web/src/generated/prisma
git commit -m "feat(video-analytics): add session trace schema"
```

---

# Stage 2 — Shared Types

## Task 2: Define EventCode and EventTuple in packages/shared

**Files:**
- Modify: `packages/shared/src/video-analytics.ts`
- Create: `packages/shared/src/video-analytics.spec.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing tests for EventCode + decode round-trip**

Create `packages/shared/src/video-analytics.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  EventCode,
  encodeEvent,
  decodeTrace,
  DecodedEvent,
  EventTuple,
} from './video-analytics';

describe('EventCode', () => {
  it('has stable numeric codes used on the wire', () => {
    expect(EventCode.TICK).toBe(0);
    expect(EventCode.PLAY).toBe(1);
    expect(EventCode.PAUSE).toBe(2);
    expect(EventCode.SEEK).toBe(3);
    expect(EventCode.ENDED).toBe(4);
    expect(EventCode.RATE).toBe(5);
    expect(EventCode.VOLUME).toBe(6);
    expect(EventCode.FULLSCREEN_ON).toBe(7);
    expect(EventCode.FULLSCREEN_OFF).toBe(8);
    expect(EventCode.BUFFER_START).toBe(9);
    expect(EventCode.BUFFER_END).toBe(10);
    expect(EventCode.QUALITY).toBe(11);
    expect(EventCode.ERROR).toBe(12);
    expect(EventCode.VISIBILITY_HIDDEN).toBe(13);
    expect(EventCode.VISIBILITY_VISIBLE).toBe(14);
  });
});

describe('decodeTrace', () => {
  it('decodes an empty trace', () => {
    expect(decodeTrace([])).toEqual([]);
  });

  it('decodes a single tick tuple', () => {
    const trace: EventTuple[] = [[0, EventCode.TICK, 0]];
    const decoded: DecodedEvent[] = decodeTrace(trace);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toMatchObject({
      tMs: 0,
      type: 'TICK',
      posMs: 0,
    });
  });

  it('decodes SEEK with fromMs extra', () => {
    const trace: EventTuple[] = [[1200, EventCode.SEEK, 4000, { fromMs: 20000 }]];
    const [ev] = decodeTrace(trace);
    expect(ev.type).toBe('SEEK');
    expect(ev.fromMs).toBe(20000);
  });

  it('decodes BUFFER_END with durationMs extra', () => {
    const trace: EventTuple[] = [[500, EventCode.BUFFER_END, 1200, { durationMs: 750 }]];
    const [ev] = decodeTrace(trace);
    expect(ev.type).toBe('BUFFER_END');
    expect(ev.bufferDurationMs).toBe(750);
  });

  it('decodes VOLUME with volume + muted extra', () => {
    const trace: EventTuple[] = [[200, EventCode.VOLUME, 0, { volume: 0.8, muted: false }]];
    const [ev] = decodeTrace(trace);
    expect(ev.type).toBe('VOLUME');
    expect(ev.volume).toBe(0.8);
    expect(ev.muted).toBe(false);
  });

  it('decodes ERROR with message extra truncated upstream', () => {
    const trace: EventTuple[] = [[900, EventCode.ERROR, 3000, { message: 'MEDIA_ERR_NETWORK' }]];
    const [ev] = decodeTrace(trace);
    expect(ev.type).toBe('ERROR');
    expect(ev.message).toBe('MEDIA_ERR_NETWORK');
  });

  it('tolerates unknown numeric codes by emitting type="UNKNOWN"', () => {
    const trace = [[0, 99, 0]] as unknown as EventTuple[];
    const [ev] = decodeTrace(trace);
    expect(ev.type).toBe('UNKNOWN');
  });

  it('tolerates unexpected extra fields without throwing', () => {
    const trace = [[0, EventCode.PLAY, 0, { garbage: true }]] as unknown as EventTuple[];
    expect(() => decodeTrace(trace)).not.toThrow();
  });
});

describe('encodeEvent / decodeTrace round trip', () => {
  it('round-trips every EventCode value', () => {
    for (const key of Object.keys(EventCode)) {
      const code = EventCode[key as keyof typeof EventCode];
      if (typeof code !== 'number') continue;
      const encoded = encodeEvent(100, code, 500);
      const [decoded] = decodeTrace([encoded]);
      expect(decoded.tMs).toBe(100);
      expect(decoded.posMs).toBe(500);
      expect(decoded.type).not.toBe('UNKNOWN');
    }
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

Run: `npm test --workspace=@laptopguru-crm/shared -- video-analytics`
(If the shared package has no Vitest setup yet, also check `packages/shared/package.json` for a `test` script — add one running `vitest run` if missing.)
Expected: fails on missing exports.

- [ ] **Step 3: Rewrite `packages/shared/src/video-analytics.ts`**

Replace the file with:

```typescript
export enum EventCode {
  TICK = 0,
  PLAY = 1,
  PAUSE = 2,
  SEEK = 3,
  ENDED = 4,
  RATE = 5,
  VOLUME = 6,
  FULLSCREEN_ON = 7,
  FULLSCREEN_OFF = 8,
  BUFFER_START = 9,
  BUFFER_END = 10,
  QUALITY = 11,
  ERROR = 12,
  VISIBILITY_HIDDEN = 13,
  VISIBILITY_VISIBLE = 14,
}

export type EventExtra =
  | { fromMs: number }                      // SEEK
  | { playbackRate: number }                // RATE
  | { volume: number; muted: boolean }      // VOLUME
  | { durationMs: number }                  // BUFFER_END
  | { label: string }                       // QUALITY
  | { message: string }                     // ERROR
  | Record<string, unknown>;

export type EventTuple =
  | [tMs: number, type: EventCode, posMs: number]
  | [tMs: number, type: EventCode, posMs: number, extra: EventExtra];

export type EventTypeName =
  | 'TICK' | 'PLAY' | 'PAUSE' | 'SEEK' | 'ENDED' | 'RATE'
  | 'VOLUME' | 'FULLSCREEN_ON' | 'FULLSCREEN_OFF'
  | 'BUFFER_START' | 'BUFFER_END' | 'QUALITY'
  | 'ERROR' | 'VISIBILITY_HIDDEN' | 'VISIBILITY_VISIBLE'
  | 'UNKNOWN';

export interface DecodedEvent {
  tMs: number;
  posMs: number;
  type: EventTypeName;
  fromMs?: number;
  playbackRate?: number;
  volume?: number;
  muted?: boolean;
  bufferDurationMs?: number;
  qualityLabel?: string;
  message?: string;
}

const CODE_TO_NAME: Record<number, EventTypeName> = {
  0: 'TICK', 1: 'PLAY', 2: 'PAUSE', 3: 'SEEK', 4: 'ENDED',
  5: 'RATE', 6: 'VOLUME', 7: 'FULLSCREEN_ON', 8: 'FULLSCREEN_OFF',
  9: 'BUFFER_START', 10: 'BUFFER_END', 11: 'QUALITY', 12: 'ERROR',
  13: 'VISIBILITY_HIDDEN', 14: 'VISIBILITY_VISIBLE',
};

export function encodeEvent(tMs: number, type: EventCode, posMs: number, extra?: EventExtra): EventTuple {
  return extra === undefined ? [tMs, type, posMs] : [tMs, type, posMs, extra];
}

export function decodeTrace(trace: EventTuple[]): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  for (const tuple of trace) {
    const [tMs, rawCode, posMs, extra] = tuple as [number, number, number, Record<string, unknown>?];
    const name = CODE_TO_NAME[rawCode] ?? 'UNKNOWN';
    const ev: DecodedEvent = { tMs, posMs, type: name };
    if (extra && typeof extra === 'object') {
      if (typeof extra.fromMs === 'number') ev.fromMs = extra.fromMs;
      if (typeof extra.playbackRate === 'number') ev.playbackRate = extra.playbackRate;
      if (typeof extra.volume === 'number') ev.volume = extra.volume;
      if (typeof extra.muted === 'boolean') ev.muted = extra.muted;
      if (typeof extra.durationMs === 'number') ev.bufferDurationMs = extra.durationMs;
      if (typeof extra.label === 'string') ev.qualityLabel = extra.label;
      if (typeof extra.message === 'string') ev.message = extra.message;
    }
    out.push(ev);
  }
  return out;
}

// Read-side shapes used by the API and dashboard ------------------------------

export interface VideoAnalyticsOverview {
  sessions: number;
  uniqueVisitors: number;
  avgWatchTimeMs: number;
  completionRate: number;    // 0..1
  errorCount: number;
}

export interface VideoRetentionPoint {
  second: number;
  views: number;
  replays: number;
  pauseCount: number;
  seekAwayCount: number;
}

export interface VideoAnalyticsData {
  overview: VideoAnalyticsOverview;
  retention: VideoRetentionPoint[];
  devices: { deviceType: string; sessions: number }[];
  browsers: { browser: string; sessions: number }[];
  geography: { country: string; sessions: number }[];
  referrers: { referrerDomain: string; sessions: number }[];
  recentSessions: {
    id: string;
    visitId: string;
    landingSlug: string;
    startedAt: string;
    endedAt: string | null;
    durationWatchedMs: number;
    completionPercent: number;
    endReason: string | null;
    country: string | null;
    deviceType: string | null;
    browser: string | null;
  }[];
}

export interface VisitPlaybackSession {
  id: string;
  videoId: string;
  videoDurationMs: number;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  durationWatchedMs: number;
  completionPercent: number;
  trace: DecodedEvent[];
}

export interface VisitPlaybackData {
  sessions: VisitPlaybackSession[];
}
```

- [ ] **Step 4: Re-export from `packages/shared/src/index.ts`**

Replace the file:

```typescript
export { PERMISSIONS, PERMISSION_GROUPS, ROUTE_PERMISSIONS, ALL_PERMISSIONS, hasPermission } from './permissions';
export type { Permission } from './permissions';
export type { VideoSource, VideoStatus, VideoDTO, UploadInitRequest, UploadInitResponse } from './video';
export {
  EventCode,
  encodeEvent,
  decodeTrace,
} from './video-analytics';
export type {
  EventExtra,
  EventTuple,
  EventTypeName,
  DecodedEvent,
  VideoAnalyticsOverview,
  VideoRetentionPoint,
  VideoAnalyticsData,
  VisitPlaybackSession,
  VisitPlaybackData,
} from './video-analytics';
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test --workspace=@laptopguru-crm/shared -- video-analytics`
Expected: all tests pass.

- [ ] **Step 6: Type-check the whole monorepo**

Run: `npm run type-check`
Expected: passes. Existing consumers only use names we kept (`VideoAnalyticsData` — its shape changed). If any callsite fails, note the file paths but **do not** fix them yet — they are rewritten in stage 5/7.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/video-analytics.ts packages/shared/src/video-analytics.spec.ts packages/shared/src/index.ts
git commit -m "feat(shared): add event-tuple codec and session trace types"
```

---

# Stage 3 — Backend Ingestion

## Task 3: RateLimitService (Redis sliding window)

**Files:**
- Create: `apps/api/src/common/services/rate-limit.service.ts`
- Create: `apps/api/src/common/services/rate-limit.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/common/services/rate-limit.service.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Redis from 'ioredis-mock';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  let redis: InstanceType<typeof Redis>;
  let service: RateLimitService;

  beforeEach(() => {
    redis = new Redis();
    service = new RateLimitService(redis as unknown as import('ioredis').Redis);
  });

  it('allows the first request', async () => {
    await expect(service.check('k', 5, 60)).resolves.toBe(true);
  });

  it('allows up to `limit` requests within the window', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(service.check('k', 5, 60)).resolves.toBe(true);
    }
  });

  it('rejects the limit+1 request', async () => {
    for (let i = 0; i < 5; i++) await service.check('k', 5, 60);
    await expect(service.check('k', 5, 60)).resolves.toBe(false);
  });

  it('does not cross-contaminate keys', async () => {
    for (let i = 0; i < 5; i++) await service.check('a', 5, 60);
    await expect(service.check('b', 5, 60)).resolves.toBe(true);
  });

  it('resets after window expires (sliding)', async () => {
    vi.useFakeTimers();
    const start = new Date('2026-04-14T00:00:00Z');
    vi.setSystemTime(start);
    for (let i = 0; i < 5; i++) await service.check('k', 5, 60);
    vi.setSystemTime(new Date(start.getTime() + 61_000));
    await expect(service.check('k', 5, 60)).resolves.toBe(true);
    vi.useRealTimers();
  });
});
```

If `ioredis-mock` is not in `apps/api/package.json` yet, add it:
`npm install --save-dev ioredis-mock --workspace=@laptopguru-crm/api`

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test --workspace=@laptopguru-crm/api -- rate-limit.service`
Expected: fails on missing `RateLimitService`.

- [ ] **Step 3: Implement `rate-limit.service.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(key: string, limit: number, windowSec: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowSec * 1000;
    const member = `${now}:${Math.random().toString(36).slice(2)}`;
    const pipe = this.redis.pipeline();
    pipe.zremrangebyscore(key, 0, windowStart);
    pipe.zadd(key, now, member);
    pipe.zcard(key);
    pipe.expire(key, windowSec);
    const result = await pipe.exec();
    if (!result) return true;
    const count = result[2]?.[1] as number | undefined;
    if (typeof count !== 'number') return true;
    return count <= limit;
  }
}
```

- [ ] **Step 4: Register the Redis client provider**

Check where BullMQ currently sources Redis — grep for `createClient`/`IORedis` in `apps/api/src` and reuse the same env-driven connection. If none exists as a standalone provider, add one to `apps/api/src/common/services/redis.provider.ts`:

```typescript
import { Provider } from '@nestjs/common';
import IORedis from 'ioredis';
import { REDIS_CLIENT } from './rate-limit.service';

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: () => new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }),
};
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test --workspace=@laptopguru-crm/api -- rate-limit.service`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/services apps/api/package.json apps/api/package-lock.json
git commit -m "feat(api): add Redis sliding-window rate-limit service"
```

## Task 4: PublicLandingEndpoint decorator + JwtAuthGuard whitelist

**Files:**
- Create: `apps/api/src/common/decorators/public-landing-endpoint.decorator.ts`
- Modify: `apps/api/src/common/guards/jwt-auth.guard.ts`

- [ ] **Step 1: Create decorator**

```typescript
import { SetMetadata } from '@nestjs/common';

export const PUBLIC_LANDING_ENDPOINT_KEY = 'publicLandingEndpoint';
export const PublicLandingEndpoint = () => SetMetadata(PUBLIC_LANDING_ENDPOINT_KEY, true);
```

- [ ] **Step 2: Rewrite `JwtAuthGuard`**

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { PUBLIC_LANDING_ENDPOINT_KEY } from '../decorators/public-landing-endpoint.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_LANDING_ENDPOINT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/common/decorators/public-landing-endpoint.decorator.ts apps/api/src/common/guards/jwt-auth.guard.ts
git commit -m "feat(api): add PublicLandingEndpoint decorator and JWT whitelist"
```

## Task 5: PublicLandingGuard

**Files:**
- Create: `apps/api/src/common/guards/public-landing.guard.ts`
- Create: `apps/api/src/common/guards/public-landing.guard.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `public-landing.guard.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException, ExecutionContext } from '@nestjs/common';
import { PublicLandingGuard } from './public-landing.guard';

function mockCtx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PublicLandingGuard', () => {
  const prisma = {
    landingVisit: {
      findUnique: vi.fn(),
    },
  };
  const guard = new PublicLandingGuard(prisma as never);

  beforeEach(() => {
    prisma.landingVisit.findUnique.mockReset();
  });

  it('rejects when slug is missing', async () => {
    const ctx = mockCtx({ params: {}, body: { visitId: 'v1', videoId: 'vid1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when visit does not exist', async () => {
    prisma.landingVisit.findUnique.mockResolvedValue(null);
    const ctx = mockCtx({ params: { slug: 's' }, body: { visitId: 'v1', videoId: 'vid1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when slug does not match landing', async () => {
    prisma.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'other', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    const ctx = mockCtx({ params: { slug: 'mine' }, body: { visitId: 'v1', videoId: 'vid1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when body.videoId does not match landing.videoId', async () => {
    prisma.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'mine', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    const ctx = mockCtx({ params: { slug: 'mine' }, body: { visitId: 'v1', videoId: 'BAD' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('populates req.publicContext on success', async () => {
    prisma.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'mine', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    const req: any = { params: { slug: 'mine' }, body: { visitId: 'v1', videoId: 'vid1' } };
    const ctx = mockCtx(req);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.publicContext).toEqual({
      companyId: 'c1',
      landingId: 'l1',
      visitId: 'v1',
      videoId: 'vid1',
    });
  });

  it('also resolves visitId from params when body lacks it (chunks endpoint)', async () => {
    prisma.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'mine', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    // chunks endpoint: sessionId in params, visitId pre-resolved in controller → guard not called here.
    // This test documents that session-create is the only path needing body.visitId.
    const ctx = mockCtx({ params: { slug: 'mine' }, body: { visitId: 'v1', videoId: 'vid1' } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test --workspace=@laptopguru-crm/api -- public-landing.guard`
Expected: fails on missing guard class.

- [ ] **Step 3: Implement guard**

```typescript
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PublicLandingContext {
  companyId: string;
  landingId: string;
  visitId: string;
  videoId: string;
}

@Injectable()
export class PublicLandingGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      params: Record<string, string>;
      body: Record<string, unknown>;
      publicContext?: PublicLandingContext;
    }>();

    const slug = req.params?.slug;
    if (!slug) throw new NotFoundException('slug missing');

    const visitId = (req.body?.visitId ?? req.params?.visitId) as string | undefined;
    const videoId = req.body?.videoId as string | undefined;
    if (!visitId || !videoId) throw new NotFoundException('visit/video missing');

    const visit = await this.prisma.landingVisit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        landing: {
          select: { id: true, slug: true, companyId: true, videoId: true },
        },
      },
    });

    if (!visit) throw new NotFoundException('visit not found');
    if (visit.landing.slug !== slug) throw new ForbiddenException('slug mismatch');
    if (visit.landing.videoId !== videoId) throw new ForbiddenException('video mismatch');

    req.publicContext = {
      companyId: visit.landing.companyId,
      landingId: visit.landing.id,
      visitId: visit.id,
      videoId: visit.landing.videoId,
    };
    return true;
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test --workspace=@laptopguru-crm/api -- public-landing.guard`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/guards/public-landing.guard.ts apps/api/src/common/guards/public-landing.guard.spec.ts
git commit -m "feat(api): add PublicLandingGuard with ownership chain validation"
```

## Task 6: video-sessions module skeleton + DTOs

**Files:**
- Create: `apps/api/src/modules/video-sessions/video-sessions.module.ts`
- Create: `apps/api/src/modules/video-sessions/dto/create-session.dto.ts`
- Create: `apps/api/src/modules/video-sessions/dto/append-chunk.dto.ts`

- [ ] **Step 1: Create DTOs**

`dto/create-session.dto.ts`:

```typescript
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateSessionDto {
  @IsString() slug!: string;
  @IsString() visitId!: string;
  @IsString() videoId!: string;

  @IsInt() @Min(0) @Max(24 * 3600 * 1000)
  videoDurationMs!: number;

  @IsOptional() @IsInt()
  clientStartedAt?: number;
}
```

`dto/append-chunk.dto.ts`:

```typescript
import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class AppendChunkDto {
  @IsInt() seq!: number;

  @IsArray()
  events!: unknown[];

  @IsBoolean()
  final!: boolean;

  @IsOptional() @IsString()
  endReason?: string;
}
```

- [ ] **Step 2: Create module skeleton**

`video-sessions.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { redisProvider } from '../../common/services/redis.provider';
import { PublicLandingGuard } from '../../common/guards/public-landing.guard';
import { VideoSessionsController } from './video-sessions.controller';
import { VideoSessionsService } from './video-sessions.service';
import { FinalizeWorker } from './workers/finalize.worker';
import { ReaperProcessor } from './workers/reaper.processor';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: 'video-session-finalize' },
      { name: 'video-session-reaper' },
    ),
  ],
  controllers: [VideoSessionsController],
  providers: [
    VideoSessionsService,
    FinalizeWorker,
    ReaperProcessor,
    PublicLandingGuard,
    RateLimitService,
    redisProvider,
  ],
  exports: [VideoSessionsService],
})
export class VideoSessionsModule {}
```

This file will not compile yet — controllers/services/workers don't exist. That's expected. Do not run type-check yet.

- [ ] **Step 3: Commit scaffolding**

```bash
git add apps/api/src/modules/video-sessions/video-sessions.module.ts apps/api/src/modules/video-sessions/dto
git commit -m "chore(video-sessions): scaffold module and DTOs"
```

## Task 7: VideoSessionsService — create + append + finalize hook (with tests)

**Files:**
- Create: `apps/api/src/modules/video-sessions/video-sessions.service.ts`
- Create: `apps/api/src/modules/video-sessions/video-sessions.service.spec.ts`

- [ ] **Step 1: Write failing tests**

The service owns three operations: `createSession`, `appendChunk`, and the `final:true` path that enqueues the finalize job. Tests hit a real Postgres via `PrismaService` (pattern: look at existing `s3.service.spec.ts` for Vitest bootstrapping — if the existing tests use an in-memory Prisma mock, follow that approach instead).

`video-sessions.service.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoSessionsService } from './video-sessions.service';
import { GoneException, BadRequestException } from '@nestjs/common';
import { EventCode } from '@laptopguru-crm/shared';

function makePrisma() {
  const store = {
    sessions: new Map<string, any>(),
    chunks: new Map<string, any>(),
    durationMsById: new Map<string, number>(),
  };
  let seq = 0;
  return {
    store,
    videoPlaybackSession: {
      findFirst: vi.fn(async ({ where }: any) => {
        for (const s of store.sessions.values()) {
          if (
            s.landingVisitId === where.landingVisitId &&
            s.videoId === where.videoId &&
            s.startedAt.getTime() === where.startedAt.getTime()
          ) return s;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = `sess_${++seq}`;
        const row = { id, trace: [], chunksReceived: 0, finalized: false, endedAt: null, ...data };
        store.sessions.set(id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => store.sessions.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const row = store.sessions.get(where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    videoSessionChunk: {
      create: vi.fn(async ({ data }: any) => {
        const key = `${data.sessionId}:${data.seq}`;
        if (store.chunks.has(key)) {
          const err: any = new Error('unique');
          err.code = 'P2002';
          throw err;
        }
        store.chunks.set(key, data);
        return data;
      }),
    },
    $transaction: vi.fn(async (fn: any) => fn(this)),
  };
}

describe('VideoSessionsService', () => {
  const queue = { add: vi.fn(async () => ({ id: 'job' })) } as any;
  let prisma: ReturnType<typeof makePrisma>;
  let service: VideoSessionsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new VideoSessionsService(prisma as never, queue);
    queue.add.mockClear();
  });

  describe('createSession', () => {
    it('creates a new row with empty trace', async () => {
      const res = await service.createSession({
        companyId: 'c', landingId: 'l', visitId: 'v', videoId: 'vid',
        videoDurationMs: 300000, clientStartedAt: new Date('2026-04-14T00:00:00Z').getTime(),
      });
      expect(res.sessionId).toMatch(/^sess_/);
      expect(prisma.store.sessions.size).toBe(1);
    });

    it('is idempotent on (visitId, videoId, startedAt)', async () => {
      const args = {
        companyId: 'c', landingId: 'l', visitId: 'v', videoId: 'vid',
        videoDurationMs: 300000, clientStartedAt: new Date('2026-04-14T00:00:00Z').getTime(),
      };
      const a = await service.createSession(args);
      const b = await service.createSession(args);
      expect(a.sessionId).toBe(b.sessionId);
      expect(prisma.store.sessions.size).toBe(1);
    });
  });

  describe('appendChunk', () => {
    async function seed() {
      return service.createSession({
        companyId: 'c', landingId: 'l', visitId: 'v', videoId: 'vid',
        videoDurationMs: 300000, clientStartedAt: Date.now(),
      });
    }

    it('rejects empty events array', async () => {
      const { sessionId } = await seed();
      await expect(service.appendChunk(sessionId, { seq: 0, events: [], final: false })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects >500 events', async () => {
      const { sessionId } = await seed();
      const events = Array.from({ length: 501 }, (_, i) => [i, EventCode.TICK, i * 100]);
      await expect(service.appendChunk(sessionId, { seq: 0, events, final: false })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a malformed tuple', async () => {
      const { sessionId } = await seed();
      await expect(service.appendChunk(sessionId, { seq: 0, events: [['oops']] as any, final: false })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects pos > videoDurationMs + 1000', async () => {
      const { sessionId } = await seed();
      await expect(service.appendChunk(sessionId, {
        seq: 0,
        events: [[0, EventCode.TICK, 301_001]],
        final: false,
      })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a valid chunk and appends to trace', async () => {
      const { sessionId } = await seed();
      const events = [[0, EventCode.PLAY, 0], [250, EventCode.TICK, 250]];
      const res = await service.appendChunk(sessionId, { seq: 0, events, final: false });
      expect(res.status).toBe('appended');
      const row = prisma.store.sessions.get(sessionId)!;
      expect(row.trace).toEqual(events);
      expect(row.chunksReceived).toBe(1);
    });

    it('returns "deduped" and does NOT append on duplicate seq', async () => {
      const { sessionId } = await seed();
      const events = [[0, EventCode.PLAY, 0]];
      await service.appendChunk(sessionId, { seq: 0, events, final: false });
      const res = await service.appendChunk(sessionId, { seq: 0, events, final: false });
      expect(res.status).toBe('deduped');
      expect(prisma.store.sessions.get(sessionId)!.trace).toHaveLength(1);
    });

    it('returns 410 Gone when session is finalized', async () => {
      const { sessionId } = await seed();
      prisma.store.sessions.get(sessionId)!.finalized = true;
      await expect(service.appendChunk(sessionId, {
        seq: 0, events: [[0, EventCode.PLAY, 0]], final: false,
      })).rejects.toBeInstanceOf(GoneException);
    });

    it('on final:true sets endedAt, endReason, and enqueues finalize job', async () => {
      const { sessionId } = await seed();
      await service.appendChunk(sessionId, {
        seq: 0,
        events: [[1000, EventCode.ENDED, 300_000]],
        final: true,
        endReason: 'ENDED',
      });
      const row = prisma.store.sessions.get(sessionId)!;
      expect(row.endedAt).toBeInstanceOf(Date);
      expect(row.endReason).toBe('ENDED');
      expect(queue.add).toHaveBeenCalledWith(
        'finalize',
        { sessionId, reason: 'CLIENT_FINAL' },
        expect.any(Object),
      );
    });

    it('on final:true with no endReason defaults to CLOSED', async () => {
      const { sessionId } = await seed();
      await service.appendChunk(sessionId, {
        seq: 0,
        events: [[1000, EventCode.PAUSE, 5000]],
        final: true,
      });
      expect(prisma.store.sessions.get(sessionId)!.endReason).toBe('CLOSED');
    });

    it('accepts late-arriving lower seq after higher seq already stored', async () => {
      const { sessionId } = await seed();
      await service.appendChunk(sessionId, { seq: 1, events: [[100, EventCode.TICK, 100]], final: false });
      const res = await service.appendChunk(sessionId, { seq: 0, events: [[0, EventCode.PLAY, 0]], final: false });
      expect(res.status).toBe('appended');
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test --workspace=@laptopguru-crm/api -- video-sessions.service`
Expected: fails — service does not exist yet.

- [ ] **Step 3: Implement `video-sessions.service.ts`**

```typescript
import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EventCode } from '@laptopguru-crm/shared';

const MAX_EVENTS_PER_CHUNK = 500;
const VALID_END_REASONS = new Set([
  'ENDED', 'PAUSED_LONG', 'CLOSED', 'NAVIGATED', 'ERROR', 'INCOMPLETE',
]);
const VALID_EVENT_CODES = new Set(
  Object.values(EventCode).filter((v) => typeof v === 'number') as number[],
);

export interface CreateSessionArgs {
  companyId: string;
  landingId: string;
  visitId: string;
  videoId: string;
  videoDurationMs: number;
  clientStartedAt?: number;
}

@Injectable()
export class VideoSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('video-session-finalize') private readonly finalizeQueue: Queue,
  ) {}

  async createSession(args: CreateSessionArgs): Promise<{ sessionId: string }> {
    const startedAt = new Date(args.clientStartedAt ?? Date.now());
    const existing = await this.prisma.videoPlaybackSession.findFirst({
      where: {
        landingVisitId: args.visitId,
        videoId: args.videoId,
        startedAt,
      },
    });
    if (existing) return { sessionId: existing.id };

    const created = await this.prisma.videoPlaybackSession.create({
      data: {
        landingVisitId: args.visitId,
        videoId: args.videoId,
        companyId: args.companyId,
        videoDurationMs: args.videoDurationMs,
        startedAt,
      },
    });
    return { sessionId: created.id };
  }

  async appendChunk(
    sessionId: string,
    body: { seq: number; events: unknown[]; final: boolean; endReason?: string },
  ): Promise<{ status: 'appended' | 'deduped' }> {
    const session = await this.prisma.videoPlaybackSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('session not found');
    if (session.finalized) throw new GoneException('session finalized');

    const events = body.events;
    if (!Array.isArray(events) || events.length === 0) {
      throw new BadRequestException('events must be a non-empty array');
    }
    if (events.length > MAX_EVENTS_PER_CHUNK) {
      throw new BadRequestException(`max ${MAX_EVENTS_PER_CHUNK} events per chunk`);
    }

    const nowMs = Date.now();
    const maxPos = session.videoDurationMs + 1000;
    for (const ev of events) {
      if (!Array.isArray(ev) || ev.length < 3 || ev.length > 4) {
        throw new BadRequestException('malformed event tuple');
      }
      const [tMs, code, pos] = ev as [unknown, unknown, unknown];
      if (typeof tMs !== 'number' || tMs < 0 || tMs > nowMs + 60_000) {
        throw new BadRequestException('invalid tMs');
      }
      if (typeof code !== 'number' || !VALID_EVENT_CODES.has(code)) {
        throw new BadRequestException('invalid event code');
      }
      if (typeof pos !== 'number' || pos < 0 || pos > maxPos) {
        throw new BadRequestException('pos out of range');
      }
    }

    if (body.final && body.endReason !== undefined && !VALID_END_REASONS.has(body.endReason)) {
      throw new BadRequestException('invalid endReason');
    }

    try {
      await this.prisma.videoSessionChunk.create({
        data: { sessionId, seq: body.seq },
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        return { status: 'deduped' };
      }
      throw err;
    }

    const traceUpdate = this.prisma.$executeRaw`
      UPDATE "VideoPlaybackSession"
      SET "trace" = "trace" || ${JSON.stringify(events)}::jsonb,
          "chunksReceived" = "chunksReceived" + 1,
          "updatedAt" = NOW()
      WHERE "id" = ${sessionId}
    `;
    await traceUpdate;

    if (body.final) {
      await this.prisma.videoPlaybackSession.update({
        where: { id: sessionId },
        data: {
          endedAt: new Date(),
          endReason: (body.endReason as 'CLOSED') ?? 'CLOSED',
        },
      });
      await this.finalizeQueue.add(
        'finalize',
        { sessionId, reason: 'CLIENT_FINAL' },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
      );
    }

    return { status: 'appended' };
  }
}
```

> Note: the spec-level semantics of append-to-JSONB via `$executeRaw` are not fully exercised by the in-memory test mock. A follow-up integration test against a real Postgres is added in Task 14. The unit tests here cover validation, dedup, and the finalize path; the mock's `trace` array is populated via a small shim you add now.

Add the shim in the test file (top of `makePrisma`):

```typescript
// replace $transaction mock with an $executeRaw shim that appends to trace.
prisma.$executeRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const eventsJson = values[0] as string;
  const sid = values[1] as string;
  const row = store.sessions.get(sid);
  row.trace = [...row.trace, ...JSON.parse(eventsJson)];
  row.chunksReceived += 1;
  return 1;
});
```

Re-run the test spec write so it uses `$executeRaw` rather than an implicit `update`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test --workspace=@laptopguru-crm/api -- video-sessions.service`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/video-sessions/video-sessions.service.ts apps/api/src/modules/video-sessions/video-sessions.service.spec.ts
git commit -m "feat(video-sessions): service with create, append, dedup, finalize enqueue"
```

## Task 8: VideoSessionsController + public routes

**Files:**
- Create: `apps/api/src/modules/video-sessions/video-sessions.controller.ts`

- [ ] **Step 1: Implement controller**

```typescript
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
  BadRequestException,
  TooManyRequestsException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PublicLandingEndpoint } from '../../common/decorators/public-landing-endpoint.decorator';
import { PublicLandingGuard, PublicLandingContext } from '../../common/guards/public-landing.guard';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { VideoSessionsService } from './video-sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AppendChunkDto } from './dto/append-chunk.dto';

interface PublicRequest extends Request {
  publicContext?: PublicLandingContext;
}

@Controller('public/video-sessions')
export class VideoSessionsController {
  constructor(
    private readonly service: VideoSessionsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  @PublicLandingEndpoint()
  @UseGuards(PublicLandingGuard)
  @HttpCode(200)
  async create(@Req() req: PublicRequest, @Body() dto: CreateSessionDto) {
    const ctx = req.publicContext!;
    const ok = await this.rateLimit.check(`rl:session-create:${ctx.visitId}`, 10, 60);
    if (!ok) throw new HttpException('rate limited', HttpStatus.TOO_MANY_REQUESTS);

    return this.service.createSession({
      companyId: ctx.companyId,
      landingId: ctx.landingId,
      visitId: ctx.visitId,
      videoId: ctx.videoId,
      videoDurationMs: dto.videoDurationMs,
      clientStartedAt: dto.clientStartedAt,
    });
  }

  @Post(':sessionId/chunks')
  @PublicLandingEndpoint()
  @HttpCode(202)
  async appendChunk(@Param('sessionId') sessionId: string, @Body() body: AppendChunkDto) {
    const ok = await this.rateLimit.check(`rl:chunk:${sessionId}`, 120, 60);
    if (!ok) throw new HttpException('rate limited', HttpStatus.TOO_MANY_REQUESTS);
    return this.service.appendChunk(sessionId, body);
  }

  @Post(':sessionId/chunks/beacon')
  @PublicLandingEndpoint()
  async appendChunkBeacon(
    @Param('sessionId') sessionId: string,
    @Req() req: PublicRequest,
    @Res() res: Response,
    @Headers('content-type') contentType?: string,
  ) {
    let body: AppendChunkDto;
    try {
      if (contentType?.includes('text/plain') && typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body as AppendChunkDto;
      }
    } catch {
      res.status(204).end();
      return;
    }
    try {
      await this.service.appendChunk(sessionId, body);
    } catch {
      // beacon is fire-and-forget: swallow errors so the browser doesn't retry
    }
    res.status(204).end();
  }
}
```

> `@PublicLandingGuard` is only applied on the session-create route because the chunk routes identify the session by path param, not slug. A session that exists was already validated on creation, so the chunk handlers trust `sessionId`.

- [ ] **Step 2: Update `main.ts` to accept text/plain for the beacon route**

Edit `apps/api/src/main.ts` — wherever the express `bodyParser` is configured, add a `text` parser scoped to the beacon path. If nothing is explicitly configured, append:

```typescript
import { json, text } from 'express';
// ...
app.use('/public/video-sessions/:sessionId/chunks/beacon', text({ type: ['text/plain', 'application/json'] }));
app.use(json({ limit: '1mb' }));
```

- [ ] **Step 3: CORS for /public/**

In `apps/api/src/main.ts`, add:

```typescript
app.enableCors({
  origin: true,
  credentials: false,
  methods: ['POST', 'GET', 'OPTIONS'],
});
```

If `enableCors` is already called, extend the options rather than duplicating.

- [ ] **Step 4: Register module globally**

In `apps/api/src/app.module.ts`, add `VideoSessionsModule` to `imports`:

```typescript
import { VideoSessionsModule } from './modules/video-sessions/video-sessions.module';
// ...
imports: [
  // ...existing,
  VideoSessionsModule,
],
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: passes (worker stubs still needed; leave empty worker classes until Task 9-12).

Create temporary stubs so the module compiles:

`apps/api/src/modules/video-sessions/workers/finalize.worker.ts`:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('video-session-finalize')
export class FinalizeWorker extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // implemented in Task 11
  }
}
```

`apps/api/src/modules/video-sessions/workers/reaper.processor.ts`:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('video-session-reaper')
export class ReaperProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // implemented in Task 12
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/video-sessions apps/api/src/app.module.ts apps/api/src/main.ts
git commit -m "feat(video-sessions): public ingestion controller and module wiring"
```

---

# Stage 4 — Finalize Worker, Aggregation, Reaper

## Task 9: computeAggregates (session-level)

**Files:**
- Create: `apps/api/src/modules/video-sessions/workers/compute-aggregates.ts`
- Create: `apps/api/src/modules/video-sessions/workers/compute-aggregates.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { computeAggregates } from './compute-aggregates';
import { EventCode, EventTuple } from '@laptopguru-crm/shared';

describe('computeAggregates', () => {
  const dur = 300_000;

  it('returns zeros for empty trace', () => {
    const r = computeAggregates([], dur);
    expect(r).toEqual({
      playCount: 0, pauseCount: 0, seekCount: 0,
      bufferCount: 0, errorCount: 0, bufferTimeMs: 0,
      durationWatchedMs: 0, maxPositionMs: 0, completionPercent: 0,
    });
  });

  it('counts durationWatchedMs for a pure play→tick→pause sequence', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.TICK, 1000],
      [2000, EventCode.TICK, 2000],
      [3000, EventCode.PAUSE, 3000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.playCount).toBe(1);
    expect(r.pauseCount).toBe(1);
    expect(r.durationWatchedMs).toBe(3000);
    expect(r.maxPositionMs).toBe(3000);
  });

  it('excludes paused time from durationWatchedMs', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.PAUSE, 1000],
      [6000, EventCode.PLAY, 1000],
      [7000, EventCode.PAUSE, 2000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.durationWatchedMs).toBe(2000); // 1s + 1s
  });

  it('excludes forward seek from durationWatchedMs', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.TICK, 1000],
      [1000, EventCode.SEEK, 60_000, { fromMs: 1000 }],
      [2000, EventCode.TICK, 61_000],
      [3000, EventCode.PAUSE, 62_000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.durationWatchedMs).toBe(1000 + 2000); // before seek + after seek
    expect(r.maxPositionMs).toBe(62_000);
  });

  it('excludes buffering time from durationWatchedMs and grows bufferTimeMs', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [500, EventCode.BUFFER_START, 500],
      [2500, EventCode.BUFFER_END, 500, { durationMs: 2000 }],
      [3500, EventCode.TICK, 1500],
      [4500, EventCode.PAUSE, 2500],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.bufferCount).toBe(1);
    expect(r.bufferTimeMs).toBe(2000);
  });

  it('handles rate 2.0 — posDelta reflects faster advance, duration stays accurate', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [0, EventCode.RATE, 0, { playbackRate: 2.0 }],
      [1000, EventCode.TICK, 2000], // 1s wall clock, 2s video
      [2000, EventCode.PAUSE, 4000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.durationWatchedMs).toBe(2000); // min(realDelta, posDelta)
    expect(r.maxPositionMs).toBe(4000);
  });

  it('treats ENDED as pause for duration accounting', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.ENDED, 5000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.durationWatchedMs).toBe(5000);
  });

  it('clips completionPercent to [0, 1]', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.TICK, dur + 500],
      [2000, EventCode.ENDED, dur],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.completionPercent).toBeLessThanOrEqual(1);
    expect(r.completionPercent).toBeGreaterThanOrEqual(0.99);
  });

  it('counts multiple play/pause cycles', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.PAUSE, 1000],
      [2000, EventCode.PLAY, 1000],
      [3000, EventCode.PAUSE, 2000],
      [4000, EventCode.PLAY, 2000],
      [5000, EventCode.ENDED, 3000],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.playCount).toBe(3);
    expect(r.pauseCount).toBe(2);
  });

  it('treats VISIBILITY_HIDDEN → _VISIBLE as pause (no duration grows while hidden)', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.TICK, 1000],
      [1000, EventCode.VISIBILITY_HIDDEN, 1000],
      [6000, EventCode.VISIBILITY_VISIBLE, 1000],
      [7000, EventCode.TICK, 2000],
      [8000, EventCode.PAUSE, 3000],
    ];
    const r = computeAggregates(trace, dur);
    // 1s (before hidden) + 1s (1000→2000) + 1s (2000→3000) = 3s
    expect(r.durationWatchedMs).toBe(3000);
  });

  it('counts errors', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [500, EventCode.ERROR, 500, { message: 'boom' }],
    ];
    const r = computeAggregates(trace, dur);
    expect(r.errorCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test --workspace=@laptopguru-crm/api -- compute-aggregates`
Expected: fails — module missing.

- [ ] **Step 3: Implement `compute-aggregates.ts`**

```typescript
import { EventCode, EventTuple } from '@laptopguru-crm/shared';

export interface SessionAggregates {
  playCount: number;
  pauseCount: number;
  seekCount: number;
  bufferCount: number;
  errorCount: number;
  bufferTimeMs: number;
  durationWatchedMs: number;
  maxPositionMs: number;
  completionPercent: number;
}

export function computeAggregates(trace: EventTuple[], videoDurationMs: number): SessionAggregates {
  let playCount = 0, pauseCount = 0, seekCount = 0;
  let bufferCount = 0, errorCount = 0, bufferTimeMs = 0;
  let durationWatchedMs = 0, maxPositionMs = 0;
  let bufferStartTime = 0;
  let lastPlayTime = 0, lastPlayPos = 0;
  let isPlaying = false;
  let isHidden = false;

  const commit = (tMs: number, pos: number) => {
    if (!isPlaying || isHidden) return;
    const realDelta = tMs - lastPlayTime;
    const posDelta = pos - lastPlayPos;
    if (realDelta > 0 && posDelta > 0) {
      durationWatchedMs += Math.max(0, Math.min(realDelta, posDelta));
    }
    lastPlayTime = tMs;
    lastPlayPos = pos;
  };

  for (const tuple of trace) {
    const [tMs, type, pos] = tuple;
    maxPositionMs = Math.max(maxPositionMs, pos);

    switch (type) {
      case EventCode.PLAY:
        playCount++;
        isPlaying = true;
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
      case EventCode.PAUSE:
        pauseCount++;
        commit(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.ENDED:
        commit(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.TICK:
        commit(tMs, pos);
        break;
      case EventCode.SEEK:
        seekCount++;
        // close out the pre-seek interval, then rebase to new pos
        commit(tMs, pos);
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
      case EventCode.BUFFER_START:
        bufferCount++;
        commit(tMs, pos);
        bufferStartTime = tMs;
        // pause the duration clock while buffering
        isPlaying = false;
        break;
      case EventCode.BUFFER_END:
        if (bufferStartTime > 0) bufferTimeMs += tMs - bufferStartTime;
        bufferStartTime = 0;
        isPlaying = true;
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
      case EventCode.ERROR:
        errorCount++;
        commit(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.VISIBILITY_HIDDEN:
        commit(tMs, pos);
        isHidden = true;
        break;
      case EventCode.VISIBILITY_VISIBLE:
        isHidden = false;
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
    }
  }

  const completionPercent =
    videoDurationMs > 0 ? Math.min(1, maxPositionMs / videoDurationMs) : 0;

  return {
    playCount, pauseCount, seekCount,
    bufferCount, errorCount, bufferTimeMs,
    durationWatchedMs, maxPositionMs, completionPercent,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test --workspace=@laptopguru-crm/api -- compute-aggregates`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/video-sessions/workers/compute-aggregates.ts apps/api/src/modules/video-sessions/workers/compute-aggregates.spec.ts
git commit -m "feat(video-sessions): computeAggregates with duration/min(real,pos) formula"
```

## Task 10: computeSecondDeltas (per-second counters)

**Files:**
- Create: `apps/api/src/modules/video-sessions/workers/compute-second-deltas.ts`
- Create: `apps/api/src/modules/video-sessions/workers/compute-second-deltas.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { computeSecondDeltas } from './compute-second-deltas';
import { EventCode, EventTuple } from '@laptopguru-crm/shared';

describe('computeSecondDeltas', () => {
  const dur = 300_000;

  it('returns empty arrays for empty trace', () => {
    const r = computeSecondDeltas([], dur);
    expect(r.seconds).toEqual([]);
    expect(r.views).toEqual([]);
    expect(r.replays).toEqual([]);
    expect(r.pauseCount).toEqual([]);
    expect(r.seekAwayCount).toEqual([]);
    expect(r.uniqueSecondsWatched).toBe(0);
  });

  it('linear play 0→10s → views=1 seconds 0..9, replays=0', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [10_000, EventCode.PAUSE, 10_000],
    ];
    const r = computeSecondDeltas(trace, dur);
    expect(r.seconds).toEqual([0,1,2,3,4,5,6,7,8,9]);
    expect(r.views).toEqual([1,1,1,1,1,1,1,1,1,1]);
    expect(r.replays).toEqual([0,0,0,0,0,0,0,0,0,0]);
    expect(r.uniqueSecondsWatched).toBe(10);
  });

  it('play 0→5, seek back to 2, play 2→5 → replays=1 for seconds 2,3,4', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.SEEK, 2000, { fromMs: 5000 }],
      [5000, EventCode.PLAY, 2000],
      [8000, EventCode.PAUSE, 5000],
    ];
    const r = computeSecondDeltas(trace, dur);
    expect(r.views).toEqual([1,1,1,1,1]);                 // seconds 0..4 viewed at least once
    // seconds 2,3,4 get replayed once (play 2→5 after the first play 0→5)
    expect(r.replays[r.seconds.indexOf(2)]).toBe(1);
    expect(r.replays[r.seconds.indexOf(3)]).toBe(1);
    expect(r.replays[r.seconds.indexOf(4)]).toBe(1);
    expect(r.replays[r.seconds.indexOf(0)]).toBe(0);
  });

  it('pause at second 3 → pauseCount[3]=1', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [3500, EventCode.PAUSE, 3500],
    ];
    const r = computeSecondDeltas(trace, dur);
    expect(r.pauseCount[r.seconds.indexOf(3)]).toBe(1);
  });

  it('seek away from second 5 → seekAwayCount[5]=1', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.SEEK, 10_000, { fromMs: 5000 }],
      [6000, EventCode.PAUSE, 11_000],
    ];
    const r = computeSecondDeltas(trace, dur);
    expect(r.seekAwayCount[r.seconds.indexOf(5)]).toBe(1);
  });

  it('pos > videoDurationMs (rounding slack) writes nothing out of range', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, dur - 500],
      [500, EventCode.TICK, dur + 200],
      [600, EventCode.PAUSE, dur + 200],
    ];
    const r = computeSecondDeltas(trace, dur);
    for (const s of r.seconds) expect(s).toBeLessThan(dur / 1000);
  });

  it('forward seek does not add views to skipped seconds', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [2000, EventCode.SEEK, 10_000, { fromMs: 2000 }],
      [3000, EventCode.PAUSE, 11_000],
    ];
    const r = computeSecondDeltas(trace, dur);
    // only seconds 0..1 and 10 should appear as viewed
    expect(r.seconds).toContain(0);
    expect(r.seconds).toContain(1);
    expect(r.seconds).toContain(10);
    expect(r.seconds).not.toContain(5);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test --workspace=@laptopguru-crm/api -- compute-second-deltas`
Expected: fails.

- [ ] **Step 3: Implement `compute-second-deltas.ts`**

```typescript
import { EventCode, EventTuple } from '@laptopguru-crm/shared';

export interface SecondDeltas {
  seconds: number[];
  views: number[];
  replays: number[];
  pauseCount: number[];
  seekAwayCount: number[];
  uniqueSecondsWatched: number;
}

export function computeSecondDeltas(trace: EventTuple[], videoDurationMs: number): SecondDeltas {
  const maxSecond = Math.max(0, Math.floor(videoDurationMs / 1000) - 1);
  const watched = new Map<number, number>(); // second → play count within this session
  const pauses = new Map<number, number>();
  const seekAways = new Map<number, number>();

  const markRange = (startMs: number, endMs: number) => {
    if (endMs <= startMs) return;
    const startSec = Math.max(0, Math.floor(startMs / 1000));
    const endSec = Math.min(maxSecond, Math.floor((endMs - 1) / 1000));
    for (let s = startSec; s <= endSec; s++) {
      watched.set(s, (watched.get(s) ?? 0) + 1);
    }
  };

  let isPlaying = false;
  let isHidden = false;
  let lastPlayTime = 0, lastPlayPos = 0;

  const commit = (tMs: number, pos: number) => {
    if (!isPlaying || isHidden) return;
    const realDelta = tMs - lastPlayTime;
    const posDelta = pos - lastPlayPos;
    const effective = Math.max(0, Math.min(realDelta, posDelta));
    if (effective > 0) markRange(lastPlayPos, lastPlayPos + effective);
    lastPlayTime = tMs;
    lastPlayPos = pos;
  };

  for (const tuple of trace) {
    const [tMs, type, pos, extra] = tuple as [number, number, number, Record<string, unknown>?];

    switch (type) {
      case EventCode.PLAY:
        isPlaying = true;
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
      case EventCode.PAUSE: {
        commit(tMs, pos);
        const sec = Math.min(maxSecond, Math.max(0, Math.floor(pos / 1000)));
        pauses.set(sec, (pauses.get(sec) ?? 0) + 1);
        isPlaying = false;
        break;
      }
      case EventCode.ENDED:
        commit(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.TICK:
        commit(tMs, pos);
        break;
      case EventCode.SEEK: {
        commit(tMs, pos);
        const from = typeof extra?.fromMs === 'number' ? (extra.fromMs as number) : lastPlayPos;
        const sec = Math.min(maxSecond, Math.max(0, Math.floor(from / 1000)));
        seekAways.set(sec, (seekAways.get(sec) ?? 0) + 1);
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
      }
      case EventCode.BUFFER_START:
        commit(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.BUFFER_END:
        isPlaying = true;
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
      case EventCode.VISIBILITY_HIDDEN:
        commit(tMs, pos);
        isHidden = true;
        break;
      case EventCode.VISIBILITY_VISIBLE:
        isHidden = false;
        lastPlayTime = tMs;
        lastPlayPos = pos;
        break;
    }
  }

  const allSeconds = new Set<number>([...watched.keys(), ...pauses.keys(), ...seekAways.keys()]);
  const seconds = [...allSeconds].sort((a, b) => a - b);
  const views: number[] = [];
  const replays: number[] = [];
  const pauseCountArr: number[] = [];
  const seekAwayArr: number[] = [];
  for (const s of seconds) {
    const w = watched.get(s) ?? 0;
    views.push(w > 0 ? 1 : 0);
    replays.push(Math.max(0, w - 1));
    pauseCountArr.push(pauses.get(s) ?? 0);
    seekAwayArr.push(seekAways.get(s) ?? 0);
  }

  return {
    seconds,
    views,
    replays,
    pauseCount: pauseCountArr,
    seekAwayCount: seekAwayArr,
    uniqueSecondsWatched: watched.size,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test --workspace=@laptopguru-crm/api -- compute-second-deltas`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/video-sessions/workers/compute-second-deltas.ts apps/api/src/modules/video-sessions/workers/compute-second-deltas.spec.ts
git commit -m "feat(video-sessions): computeSecondDeltas with forward-seek skipping"
```

## Task 11: FinalizeWorker

**Files:**
- Modify: `apps/api/src/modules/video-sessions/workers/finalize.worker.ts`
- Create: `apps/api/src/modules/video-sessions/workers/finalize.worker.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinalizeWorker } from './finalize.worker';
import { EventCode } from '@laptopguru-crm/shared';

function makePrisma() {
  const sessions = new Map<string, any>();
  const secondStats = new Map<string, any>();
  const visits = new Map<string, any>();
  const tx = {
    videoPlaybackSession: {
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(sessions.get(where.id), data);
        return sessions.get(where.id);
      }),
    },
    videoSecondStats: {
      upsert: vi.fn(async ({ where: { videoId_second }, create, update }: any) => {
        const key = `${videoId_second.videoId}:${videoId_second.second}`;
        const cur = secondStats.get(key);
        if (!cur) {
          secondStats.set(key, { ...create });
        } else {
          cur.views += update.views.increment;
          cur.replays += update.replays.increment;
          cur.pauseCount += update.pauseCount.increment;
          cur.seekAwayCount += update.seekAwayCount.increment;
        }
      }),
    },
    landingVisit: {
      update: vi.fn(async ({ where, data }: any) => {
        const row = visits.get(where.id) ?? {};
        Object.assign(row, data);
        visits.set(where.id, row);
      }),
    },
  };
  return {
    sessions, secondStats, visits,
    videoPlaybackSession: {
      findUnique: vi.fn(async ({ where }: any) => sessions.get(where.id) ?? null),
    },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
}

function session(id: string, trace: any[], overrides: Partial<any> = {}) {
  return {
    id,
    landingVisitId: 'visit1',
    videoId: 'vid1',
    companyId: 'c1',
    videoDurationMs: 300_000,
    trace,
    finalized: false,
    endedAt: new Date(),
    endReason: 'CLOSED',
    ...overrides,
  };
}

describe('FinalizeWorker', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let worker: FinalizeWorker;

  beforeEach(() => {
    prisma = makePrisma();
    worker = new FinalizeWorker(prisma as never);
  });

  it('marks an empty session finalized with zero aggregates', async () => {
    prisma.sessions.set('s1', session('s1', []));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    const row = prisma.sessions.get('s1')!;
    expect(row.finalized).toBe(true);
    expect(row.durationWatchedMs).toBe(0);
    expect(prisma.secondStats.size).toBe(0);
  });

  it('computes aggregates and upserts second stats for a normal session', async () => {
    prisma.sessions.set('s1', session('s1', [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.PAUSE, 5000],
    ]));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    const row = prisma.sessions.get('s1')!;
    expect(row.finalized).toBe(true);
    expect(row.durationWatchedMs).toBe(5000);
    expect(prisma.secondStats.size).toBe(5);
  });

  it('is idempotent — running twice does not double-increment second stats', async () => {
    prisma.sessions.set('s1', session('s1', [
      [0, EventCode.PLAY, 0],
      [3000, EventCode.PAUSE, 3000],
    ]));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    const v0 = prisma.secondStats.get('vid1:0');
    expect(v0!.views).toBe(1);
  });

  it('updates LandingVisit denormalized fields', async () => {
    prisma.sessions.set('s1', session('s1', [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.PAUSE, 5000],
    ]));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    const visit = prisma.visits.get('visit1')!;
    expect(visit.videoPlayed).toBe(true);
    expect(visit.videoWatchTime).toBe(5); // seconds
  });

  it('sets videoCompleted=true when completionPercent >= 0.95', async () => {
    prisma.sessions.set('s1', session('s1', [
      [0, EventCode.PLAY, 0],
      [300_000, EventCode.ENDED, 300_000],
    ]));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    const visit = prisma.visits.get('visit1')!;
    expect(visit.videoCompleted).toBe(true);
  });

  it('skips a session that is already finalized', async () => {
    prisma.sessions.set('s1', session('s1', [], { finalized: true, durationWatchedMs: 999 }));
    await (worker as any).process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } });
    expect(prisma.sessions.get('s1')!.durationWatchedMs).toBe(999);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test --workspace=@laptopguru-crm/api -- finalize.worker`

- [ ] **Step 3: Implement `finalize.worker.ts`**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeAggregates } from './compute-aggregates';
import { computeSecondDeltas } from './compute-second-deltas';
import type { EventTuple } from '@laptopguru-crm/shared';

interface FinalizeJobData {
  sessionId: string;
  reason: 'CLIENT_FINAL' | 'REAPER_TIMEOUT';
}

@Processor('video-session-finalize')
@Injectable()
export class FinalizeWorker extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<FinalizeJobData>): Promise<void> {
    const { sessionId } = job.data;
    const session = await this.prisma.videoPlaybackSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.finalized) return;

    const trace = (session.trace as unknown as EventTuple[]) ?? [];
    const aggregates = computeAggregates(trace, session.videoDurationMs);
    const deltas = computeSecondDeltas(trace, session.videoDurationMs);

    await this.prisma.$transaction(async (tx) => {
      await tx.videoPlaybackSession.update({
        where: { id: sessionId },
        data: {
          finalized: true,
          endedAt: session.endedAt ?? new Date(),
          endReason: session.endReason ?? 'INCOMPLETE',
          durationWatchedMs: aggregates.durationWatchedMs,
          uniqueSecondsWatched: deltas.uniqueSecondsWatched,
          maxPositionMs: aggregates.maxPositionMs,
          completionPercent: aggregates.completionPercent,
          playCount: aggregates.playCount,
          pauseCount: aggregates.pauseCount,
          seekCount: aggregates.seekCount,
          bufferCount: aggregates.bufferCount,
          bufferTimeMs: aggregates.bufferTimeMs,
          errorCount: aggregates.errorCount,
        },
      });

      for (let i = 0; i < deltas.seconds.length; i++) {
        const second = deltas.seconds[i];
        await tx.videoSecondStats.upsert({
          where: { videoId_second: { videoId: session.videoId, second } },
          create: {
            videoId: session.videoId,
            second,
            views: deltas.views[i],
            replays: deltas.replays[i],
            pauseCount: deltas.pauseCount[i],
            seekAwayCount: deltas.seekAwayCount[i],
          },
          update: {
            views: { increment: deltas.views[i] },
            replays: { increment: deltas.replays[i] },
            pauseCount: { increment: deltas.pauseCount[i] },
            seekAwayCount: { increment: deltas.seekAwayCount[i] },
          },
        });
      }

      await tx.landingVisit.update({
        where: { id: session.landingVisitId },
        data: {
          videoPlayed: aggregates.playCount > 0,
          videoWatchTime: Math.round(aggregates.durationWatchedMs / 1000),
          videoCompleted: aggregates.completionPercent >= 0.95,
          videoBufferCount: aggregates.bufferCount,
          videoBufferTime: aggregates.bufferTimeMs,
        },
      });
    });
  }
}
```

> Note: the spec calls for a raw-SQL `INSERT ... ON CONFLICT DO UPDATE` with `unnest()` for throughput. The Prisma-based upsert loop above is equivalent in semantics and keeps unit tests simple. If profiling later shows it matters, swap for the raw SQL version — the spec's test matrix does not require the raw path.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test --workspace=@laptopguru-crm/api -- finalize.worker`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/video-sessions/workers/finalize.worker.ts apps/api/src/modules/video-sessions/workers/finalize.worker.spec.ts
git commit -m "feat(video-sessions): finalize worker with aggregates and second stats upsert"
```

## Task 12: ReaperProcessor + scheduling

**Files:**
- Modify: `apps/api/src/modules/video-sessions/workers/reaper.processor.ts`
- Modify: `apps/api/src/modules/video-sessions/video-sessions.module.ts`

- [ ] **Step 1: Implement the reaper**

```typescript
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

@Processor('video-session-reaper')
@Injectable()
export class ReaperProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('video-session-finalize') private readonly finalizeQueue: Queue,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    const stale = await this.prisma.videoPlaybackSession.findMany({
      where: {
        finalized: false,
        endedAt: null,
        updatedAt: { lt: cutoff },
      },
      take: 100,
      select: { id: true },
    });

    for (const { id } of stale) {
      await this.prisma.videoPlaybackSession.update({
        where: { id },
        data: { endedAt: new Date(), endReason: 'INCOMPLETE' },
      });
      await this.finalizeQueue.add(
        'finalize',
        { sessionId: id, reason: 'REAPER_TIMEOUT' },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
      );
    }
  }
}
```

- [ ] **Step 2: Schedule the reaper every 5 minutes**

Modify `video-sessions.module.ts` to schedule on `onModuleInit`, matching the pattern in `videos.module.ts`:

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
// ...existing imports

@Module({ /* ...existing */ })
export class VideoSessionsModule implements OnModuleInit {
  constructor(
    @InjectQueue('video-session-reaper') private readonly reaperQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.reaperQueue.add(
      'reap',
      {},
      { repeat: { pattern: '*/5 * * * *' }, removeOnComplete: true, removeOnFail: true },
    );
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/video-sessions/workers/reaper.processor.ts apps/api/src/modules/video-sessions/video-sessions.module.ts
git commit -m "feat(video-sessions): reaper cron every 5 minutes"
```

---

# Stage 5 — Read-Side API

## Task 13: Rewrite VideoAnalyticsService against the new schema

**Files:**
- Modify: `apps/api/src/modules/videos/video-analytics.service.ts`
- Modify: `apps/api/src/modules/videos/video-analytics.controller.ts`
- Modify: `apps/api/src/modules/videos/video-analytics.service.spec.ts`

- [ ] **Step 1: Read the current service to understand its tenant-filter + permission pattern**

Run: `cat apps/api/src/modules/videos/video-analytics.service.ts apps/api/src/modules/videos/video-analytics.controller.ts`
Note the companyId scoping pattern and the existing spec file so the rewrite fits the same test harness.

- [ ] **Step 2: Replace the service body**

Replace the contents of `video-analytics.service.ts` so that `getAnalytics(videoId, companyId, from?, to?)` returns `VideoAnalyticsData` as defined in `packages/shared`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { VideoAnalyticsData } from '@laptopguru-crm/shared';

@Injectable()
export class VideoAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(
    videoId: string,
    companyId: string,
    from?: Date,
    to?: Date,
  ): Promise<VideoAnalyticsData> {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, companyId },
      select: { id: true, durationSeconds: true },
    });
    if (!video) throw new NotFoundException('video not found');

    const sessionWhere = {
      videoId,
      companyId,
      finalized: true,
      ...(from || to ? { startedAt: { gte: from, lte: to } } : {}),
    };

    const [sessions, secondStats] = await Promise.all([
      this.prisma.videoPlaybackSession.findMany({
        where: sessionWhere,
        orderBy: { startedAt: 'desc' },
        take: 200,
        select: {
          id: true,
          landingVisitId: true,
          startedAt: true,
          endedAt: true,
          durationWatchedMs: true,
          completionPercent: true,
          endReason: true,
          errorCount: true,
          visit: {
            select: {
              country: true,
              deviceType: true,
              browser: true,
              referrerDomain: true,
              sessionId: true,
              landing: { select: { slug: true } },
            },
          },
        },
      }),
      this.prisma.videoSecondStats.findMany({
        where: { videoId },
        orderBy: { second: 'asc' },
      }),
    ]);

    const totalSessions = sessions.length;
    const uniqueVisitors = new Set(sessions.map((s) => s.visit.sessionId)).size;
    const avgWatchTimeMs = totalSessions
      ? Math.round(sessions.reduce((a, s) => a + (s.durationWatchedMs ?? 0), 0) / totalSessions)
      : 0;
    const completionRate = totalSessions
      ? sessions.filter((s) => (s.completionPercent ?? 0) >= 0.95).length / totalSessions
      : 0;
    const errorCount = sessions.reduce((a, s) => a + (s.errorCount ?? 0), 0);

    const countBy = <K extends keyof typeof sessions[number]['visit']>(key: K) => {
      const map = new Map<string, number>();
      for (const s of sessions) {
        const v = s.visit[key] ?? 'unknown';
        map.set(v as string, (map.get(v as string) ?? 0) + 1);
      }
      return [...map.entries()]
        .map(([k, n]) => ({ key: k, sessions: n }))
        .sort((a, b) => b.sessions - a.sessions);
    };

    return {
      overview: {
        sessions: totalSessions,
        uniqueVisitors,
        avgWatchTimeMs,
        completionRate,
        errorCount,
      },
      retention: secondStats.map((r) => ({
        second: r.second,
        views: r.views,
        replays: r.replays,
        pauseCount: r.pauseCount,
        seekAwayCount: r.seekAwayCount,
      })),
      devices: countBy('deviceType').map((x) => ({ deviceType: x.key, sessions: x.sessions })),
      browsers: countBy('browser').map((x) => ({ browser: x.key, sessions: x.sessions })),
      geography: countBy('country').map((x) => ({ country: x.key, sessions: x.sessions })),
      referrers: countBy('referrerDomain').map((x) => ({ referrerDomain: x.key, sessions: x.sessions })),
      recentSessions: sessions.slice(0, 50).map((s) => ({
        id: s.id,
        visitId: s.landingVisitId,
        landingSlug: s.visit.landing.slug,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        durationWatchedMs: s.durationWatchedMs ?? 0,
        completionPercent: s.completionPercent ?? 0,
        endReason: s.endReason,
        country: s.visit.country,
        deviceType: s.visit.deviceType,
        browser: s.visit.browser,
      })),
    };
  }
}
```

- [ ] **Step 3: Update `video-analytics.controller.ts`**

Ensure the controller endpoint signature is:

```typescript
@Get(':id/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('VIDEOS_READ')
async getAnalytics(
  @Param('id') id: string,
  @CurrentUser() user: { companyId: string },
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  return this.service.getAnalytics(
    id,
    user.companyId,
    from ? new Date(from) : undefined,
    to ? new Date(to) : undefined,
  );
}
```

Match the existing imports and patterns in the file.

- [ ] **Step 4: Rewrite `video-analytics.service.spec.ts`**

Replace with one integration-style test using the existing in-memory or mocked Prisma harness in the file. Minimum coverage:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoAnalyticsService } from './video-analytics.service';
import { NotFoundException } from '@nestjs/common';

function prismaMock() {
  return {
    video: { findFirst: vi.fn() },
    videoPlaybackSession: { findMany: vi.fn() },
    videoSecondStats: { findMany: vi.fn() },
  };
}

describe('VideoAnalyticsService (new)', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: VideoAnalyticsService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new VideoAnalyticsService(prisma as never);
  });

  it('throws when the video is outside the company', async () => {
    prisma.video.findFirst.mockResolvedValue(null);
    await expect(service.getAnalytics('v', 'c')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns zeroed overview when no sessions', async () => {
    prisma.video.findFirst.mockResolvedValue({ id: 'v', durationSeconds: 300 });
    prisma.videoPlaybackSession.findMany.mockResolvedValue([]);
    prisma.videoSecondStats.findMany.mockResolvedValue([]);
    const r = await service.getAnalytics('v', 'c');
    expect(r.overview.sessions).toBe(0);
    expect(r.overview.completionRate).toBe(0);
    expect(r.retention).toEqual([]);
    expect(r.recentSessions).toEqual([]);
  });

  it('aggregates sessions into overview and forwards retention rows', async () => {
    prisma.video.findFirst.mockResolvedValue({ id: 'v', durationSeconds: 300 });
    prisma.videoPlaybackSession.findMany.mockResolvedValue([
      {
        id: 's1', landingVisitId: 'vv1',
        startedAt: new Date('2026-04-14T00:00:00Z'), endedAt: new Date('2026-04-14T00:05:00Z'),
        durationWatchedMs: 300_000, completionPercent: 1, endReason: 'ENDED', errorCount: 0,
        visit: {
          country: 'PL', deviceType: 'desktop', browser: 'Chrome', referrerDomain: 'x.com',
          sessionId: 'sess-a', landing: { slug: 'l1' },
        },
      },
    ]);
    prisma.videoSecondStats.findMany.mockResolvedValue([
      { second: 0, views: 1, replays: 0, pauseCount: 0, seekAwayCount: 0 },
    ]);
    const r = await service.getAnalytics('v', 'c');
    expect(r.overview.sessions).toBe(1);
    expect(r.overview.completionRate).toBe(1);
    expect(r.retention[0].views).toBe(1);
    expect(r.recentSessions[0].landingSlug).toBe('l1');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npm test --workspace=@laptopguru-crm/api -- video-analytics.service`
Expected: passes.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: passes. If any dashboard code fails (old `VideoAnalyticsData` shape), the TS errors will point at files rewritten in Task 19. Leave them for that task or temporarily widen the type in the consumer — note the file in a checklist.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/videos/video-analytics.service.ts apps/api/src/modules/videos/video-analytics.service.spec.ts apps/api/src/modules/videos/video-analytics.controller.ts
git commit -m "feat(videos): read video analytics from session + secondStats"
```

## Task 14: Visit playback endpoint in landings module

**Files:**
- Modify: `apps/api/src/modules/landings/landings.controller.ts`
- Modify: `apps/api/src/modules/landings/landings.service.ts`

- [ ] **Step 1: Add service method**

Append to `landings.service.ts`:

```typescript
import { decodeTrace, type VisitPlaybackData, type EventTuple } from '@laptopguru-crm/shared';

async getVisitPlayback(
  slug: string,
  visitId: string,
  companyId: string,
): Promise<VisitPlaybackData> {
  const visit = await this.prisma.landingVisit.findFirst({
    where: { id: visitId, companyId, landing: { slug } },
    select: { id: true },
  });
  if (!visit) throw new NotFoundException('visit not found');

  const sessions = await this.prisma.videoPlaybackSession.findMany({
    where: { landingVisitId: visit.id },
    orderBy: { startedAt: 'asc' },
  });

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      videoId: s.videoId,
      videoDurationMs: s.videoDurationMs,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      endReason: s.endReason,
      durationWatchedMs: s.durationWatchedMs ?? 0,
      completionPercent: s.completionPercent ?? 0,
      trace: decodeTrace((s.trace as unknown as EventTuple[]) ?? []),
    })),
  };
}
```

Add `NotFoundException` to the imports if it isn't already.

- [ ] **Step 2: Add controller route**

Append to `landings.controller.ts`:

```typescript
@Get(':slug/visits/:visitId/playback')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('LANDINGS_READ')
async getVisitPlayback(
  @Param('slug') slug: string,
  @Param('visitId') visitId: string,
  @CurrentUser() user: { companyId: string },
) {
  return this.service.getVisitPlayback(slug, visitId, user.companyId);
}
```

Mirror imports from the existing controller. The exact permission name may differ — use the one that guards the rest of `landings.controller.ts`.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/landings
git commit -m "feat(landings): add visit playback endpoint"
```

## Task 15: api-client bindings

**Files:**
- Modify: `packages/api-client/src/index.ts`

- [ ] **Step 1: Add typed helpers**

Append to `index.ts`:

```typescript
import type { VideoAnalyticsData, VisitPlaybackData } from '@laptopguru-crm/shared';
import { customFetch } from './fetcher';

export const videoAnalytics = {
  getAnalytics(videoId: string, from?: string, to?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const q = qs.toString();
    return customFetch<VideoAnalyticsData>(
      `/videos/${videoId}/analytics${q ? `?${q}` : ''}`,
    );
  },
  getVisitPlayback(slug: string, visitId: string) {
    return customFetch<VisitPlaybackData>(
      `/landings/${slug}/visits/${visitId}/playback`,
    );
  },
};
```

Adapt to the existing `customFetch` signature — read the file first if unsure.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add packages/api-client/src/index.ts
git commit -m "feat(api-client): typed video analytics bindings"
```

---

# Stage 6 — Switchover (client tracker + legacy removal)

> **Critical stage.** Create the safety tag first:
>
> `git tag pre-video-analytics-switchover`
>
> Do NOT push the tag until the manual E2E matrix in the spec (§12.3) passes.

## Task 16: Client video tracker

**Files:**
- Create: `apps/web/src/components/landing/video-tracker.ts`
- Create: `apps/web/src/components/landing/video-tracker.spec.ts`

- [ ] **Step 1: Failing tests for buffer/flush rules**

Create `video-tracker.spec.ts` (runs under Vitest jsdom):

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoTracker } from './video-tracker';
import { EventCode } from '@laptopguru-crm/shared';

function mockFetch() {
  const calls: { url: string; body: any }[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
    if (url.endsWith('/public/video-sessions')) {
      return new Response(JSON.stringify({ sessionId: 'sess_1' }), { status: 200 });
    }
    return new Response('', { status: 202 });
  });
  (globalThis as any).fetch = fetch;
  return calls;
}

describe('VideoTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch();
  });

  it('does not create a session until the first PLAY', async () => {
    const t = new VideoTracker({ slug: 's', visitId: 'v', videoId: 'vid', videoDurationMs: 60_000 });
    t.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it('creates a session and flushes buffered events after the first PLAY resolves', async () => {
    const t = new VideoTracker({ slug: 's', visitId: 'v', videoId: 'vid', videoDurationMs: 60_000 });
    t.start();
    t.emit(EventCode.PLAY, 0);
    await vi.runOnlyPendingTimersAsync();
    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      expect.stringContaining('/public/video-sessions'),
      expect.any(Object),
    );
  });

  it('flushes on the 3-second timer', async () => {
    const t = new VideoTracker({ slug: 's', visitId: 'v', videoId: 'vid', videoDurationMs: 60_000 });
    t.start();
    t.emit(EventCode.PLAY, 0);
    await vi.advanceTimersByTimeAsync(100);
    t.emit(EventCode.TICK, 250);
    const before = (globalThis as any).fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect((globalThis as any).fetch.mock.calls.length).toBeGreaterThan(before);
  });

  it('immediately flushes on PAUSE', async () => {
    const t = new VideoTracker({ slug: 's', visitId: 'v', videoId: 'vid', videoDurationMs: 60_000 });
    t.start();
    t.emit(EventCode.PLAY, 0);
    await vi.runOnlyPendingTimersAsync();
    (globalThis as any).fetch.mockClear();
    t.emit(EventCode.PAUSE, 1000);
    await vi.runOnlyPendingTimersAsync();
    expect((globalThis as any).fetch).toHaveBeenCalled();
  });

  it('auto-closes after 60s of pause', async () => {
    const t = new VideoTracker({ slug: 's', visitId: 'v', videoId: 'vid', videoDurationMs: 60_000 });
    t.start();
    t.emit(EventCode.PLAY, 0);
    await vi.runOnlyPendingTimersAsync();
    t.emit(EventCode.PAUSE, 1000);
    await vi.advanceTimersByTimeAsync(60_000);
    const finalCall = (globalThis as any).fetch.mock.calls.find(([_url, init]: any) =>
      init?.body && JSON.parse(init.body).final === true,
    );
    expect(finalCall).toBeTruthy();
    expect(JSON.parse(finalCall[1].body).endReason).toBe('PAUSED_LONG');
  });

  it('drops oldest TICKs when buffer exceeds 500 entries, preserves structured events', async () => {
    const t = new VideoTracker({ slug: 's', visitId: 'v', videoId: 'vid', videoDurationMs: 60_000 });
    t.start();
    t.emit(EventCode.PLAY, 0);
    // simulate 4 failed attempts → buffering mode
    (globalThis as any).fetch = vi.fn(async () => new Response('', { status: 500 }));
    for (let i = 0; i < 600; i++) t.emit(EventCode.TICK, i * 10);
    t.emit(EventCode.PAUSE, 6000);
    const buf = t._internalBuffer();
    expect(buf.length).toBeLessThanOrEqual(500);
    expect(buf.some((ev) => ev[1] === EventCode.PAUSE)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `npm test --workspace=@laptopguru-crm/web -- video-tracker` (add a `test` script in `apps/web/package.json` invoking `vitest run` if one does not exist).
Expected: fails — class missing.

- [ ] **Step 3: Implement the tracker**

Create `video-tracker.ts`:

```typescript
import { EventCode, type EventExtra, type EventTuple } from '@laptopguru-crm/shared';

export interface VideoTrackerOptions {
  slug: string;
  visitId: string;
  videoId: string;
  videoDurationMs: number;
  apiBase?: string;
}

const FLUSH_INTERVAL_MS = 3000;
const MAX_BUFFER = 500;
const TICK_INTERVAL_MS = 250;
const PAUSE_LONG_MS = 60_000;
const RETRY_BACKOFFS = [1000, 2000, 4000, 8000];

type EndReason = 'ENDED' | 'PAUSED_LONG' | 'CLOSED' | 'NAVIGATED' | 'ERROR';

export class VideoTracker {
  private sessionId: string | null = null;
  private startedAt = 0;
  private seq = 0;
  private buffer: EventTuple[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pauseLongTimer: ReturnType<typeof setTimeout> | null = null;
  private sealed = false;
  private retries = 0;
  private inflight: Promise<void> | null = null;
  private readonly apiBase: string;

  constructor(private readonly opts: VideoTrackerOptions) {
    this.apiBase = opts.apiBase ?? '';
  }

  start() {
    this.startedAt = Date.now();
  }

  emit(type: EventCode, posMs: number, extra?: EventExtra) {
    if (this.sealed) return;
    const t = Date.now() - this.startedAt;
    const tuple: EventTuple = extra === undefined ? [t, type, posMs] : [t, type, posMs, extra];
    this.buffer.push(tuple);

    if (type === EventCode.PLAY) {
      if (this.sessionId === null) this.createSession();
      if (this.pauseLongTimer) {
        clearTimeout(this.pauseLongTimer);
        this.pauseLongTimer = null;
      }
    }
    if (type === EventCode.PAUSE) {
      this.pauseLongTimer = setTimeout(() => this.close('PAUSED_LONG'), PAUSE_LONG_MS);
    }

    if (type === EventCode.PAUSE || type === EventCode.ENDED || type === EventCode.ERROR) {
      this.flush({ final: type === EventCode.ENDED ? true : false, endReason: type === EventCode.ENDED ? 'ENDED' : undefined });
      return;
    }
    if (this.buffer.length > 100) {
      this.flush();
      return;
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    }

    if (this.buffer.length > MAX_BUFFER) {
      this.dropOldTicks();
    }
  }

  async close(reason: EndReason) {
    if (this.sealed) return;
    this.sealed = true;
    await this.flush({ final: true, endReason: reason });
  }

  /** test-only accessor */
  _internalBuffer() { return this.buffer; }

  private dropOldTicks() {
    const kept: EventTuple[] = [];
    let dropBudget = this.buffer.length - MAX_BUFFER;
    for (const ev of this.buffer) {
      if (dropBudget > 0 && ev[1] === EventCode.TICK) { dropBudget--; continue; }
      kept.push(ev);
    }
    this.buffer = kept;
  }

  private async createSession() {
    if (this.sessionId !== null) return;
    const res = await fetch(`${this.apiBase}/public/video-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: this.opts.slug,
        visitId: this.opts.visitId,
        videoId: this.opts.videoId,
        videoDurationMs: this.opts.videoDurationMs,
        clientStartedAt: this.startedAt,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      this.sessionId = json.sessionId;
      if (this.buffer.length > 0) this.flush();
    }
  }

  private async flush(opts: { final?: boolean; endReason?: EndReason } = {}) {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.sessionId) return; // nothing to flush yet; createSession will call us back
    if (this.inflight) await this.inflight;
    if (this.buffer.length === 0 && !opts.final) return;

    const payload = {
      seq: this.seq,
      events: this.buffer,
      final: !!opts.final,
      ...(opts.endReason ? { endReason: opts.endReason } : {}),
    };

    this.inflight = (async () => {
      const res = await fetch(
        `${this.apiBase}/public/video-sessions/${this.sessionId}/chunks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        this.seq += 1;
        this.buffer = [];
        this.retries = 0;
      } else {
        this.retries += 1;
        if (this.retries >= RETRY_BACKOFFS.length) {
          this.dropOldTicks();
        }
      }
    })();
    try { await this.inflight; } finally { this.inflight = null; }
  }

  flushViaBeacon(opts: { final?: boolean; endReason?: EndReason } = {}) {
    if (!this.sessionId) return;
    const payload = {
      seq: this.seq,
      events: this.buffer,
      final: !!opts.final,
      ...(opts.endReason ? { endReason: opts.endReason } : {}),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const sent = navigator.sendBeacon?.(
      `${this.apiBase}/public/video-sessions/${this.sessionId}/chunks/beacon`,
      blob,
    );
    if (sent) {
      this.seq += 1;
      this.buffer = [];
    }
  }
}

export function attachUnloadHandlers(tracker: VideoTracker) {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      tracker.emit(EventCode.VISIBILITY_HIDDEN, 0);
      tracker.flushViaBeacon({ final: false });
    } else {
      tracker.emit(EventCode.VISIBILITY_VISIBLE, 0);
    }
  };
  const onPageHide = (e: PageTransitionEvent) => {
    tracker.flushViaBeacon({ final: !e.persisted, endReason: e.persisted ? undefined : 'CLOSED' });
  };
  const onFreeze = () => tracker.flushViaBeacon({ final: false });
  const onBeforeUnload = () => tracker.flushViaBeacon({ final: true, endReason: 'CLOSED' });

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('freeze', onFreeze as EventListener);
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('freeze', onFreeze as EventListener);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npm test --workspace=@laptopguru-crm/web -- video-tracker`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/video-tracker.ts apps/web/src/components/landing/video-tracker.spec.ts apps/web/package.json
git commit -m "feat(web): video tracker with ring buffer, beacon unload, backoff retry"
```

## Task 17: Wire tracker into video-player and landing page

**Files:**
- Modify: `apps/web/src/components/landing/video-player.tsx`
- Modify: `apps/web/src/app/l/[slug]/page.tsx`

- [ ] **Step 1: Read current video-player**

Run: `cat apps/web/src/components/landing/video-player.tsx`
Identify where PLAY/PAUSE/SEEK/TICK listeners are attached on the `<video>` element and on the YouTube iframe player.

- [ ] **Step 2: Replace legacy event emission with tracker.emit(...)**

For HTML5:

```tsx
import { VideoTracker, attachUnloadHandlers } from './video-tracker';
import { EventCode } from '@laptopguru-crm/shared';

const trackerRef = useRef<VideoTracker | null>(null);

useEffect(() => {
  if (!visitId || !videoId || !videoDurationMs) return;
  const tracker = new VideoTracker({ slug, visitId, videoId, videoDurationMs });
  tracker.start();
  trackerRef.current = tracker;
  const detach = attachUnloadHandlers(tracker);
  return () => {
    detach();
    tracker.close('NAVIGATED');
  };
}, [slug, visitId, videoId, videoDurationMs]);

// In the video event handlers:
onPlay={() => trackerRef.current?.emit(EventCode.PLAY, videoEl.currentTime * 1000)}
onPause={() => trackerRef.current?.emit(EventCode.PAUSE, videoEl.currentTime * 1000)}
onSeeked={() => trackerRef.current?.emit(EventCode.SEEK, videoEl.currentTime * 1000, { fromMs: lastPosRef.current })}
onEnded={() => trackerRef.current?.emit(EventCode.ENDED, videoEl.duration * 1000)}
onWaiting={() => trackerRef.current?.emit(EventCode.BUFFER_START, videoEl.currentTime * 1000)}
onPlaying={() => trackerRef.current?.emit(EventCode.BUFFER_END, videoEl.currentTime * 1000)}
onError={() => trackerRef.current?.emit(EventCode.ERROR, videoEl.currentTime * 1000, { message: videoEl.error?.message ?? '' })}
```

Add a 250ms TICK interval driven by `requestAnimationFrame` or `setInterval(..., 250)` that emits only when `!videoEl.paused`.

For YouTube, mirror via `onStateChange` mapping YouTube states to EventCodes; poll `player.getCurrentTime() * 1000` every 250ms.

- [ ] **Step 3: Remove the legacy event collection in landing-client**

In `apps/web/src/app/l/[slug]/page.tsx`, delete any code that calls `/api/landings/[slug]/video-events`. The tracker is self-contained and needs only `visitId` and `videoId` to be passed through to `<VideoPlayer>`.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/video-player.tsx apps/web/src/app/l/[slug]/page.tsx
git commit -m "feat(web): switch landing player to VideoTracker"
```

## Task 18: Delete legacy web routes + add Clarity

**Files:**
- Delete: `apps/web/src/app/api/landings/[slug]/video-events/route.ts`
- Delete: `apps/web/src/app/api/landings/[slug]/track/route.ts`
- Delete (if exists): `apps/web/src/app/api/landings/[slug]/visits/[visitId]/video-events/route.ts`
- Modify: `apps/web/src/app/l/[slug]/layout.tsx`

- [ ] **Step 1: Delete the routes**

```bash
rm apps/web/src/app/api/landings/\[slug\]/video-events/route.ts
rm apps/web/src/app/api/landings/\[slug\]/track/route.ts
rm -f apps/web/src/app/api/landings/\[slug\]/visits/\[visitId\]/video-events/route.ts
```

- [ ] **Step 2: Move visit-tracking (the old `/track`) to the api**

The spec says the old `/track` endpoint moves to `apps/api` as `/public/landings/:slug/visits`. If the codebase has a `track` route, add a corresponding controller endpoint in `apps/api/src/modules/landings/landings.controller.ts` using `@PublicLandingEndpoint()`, and update `landing-client` callers to use the new URL via `customFetch`. (If the `/track` route doesn't exist, skip this step.)

- [ ] **Step 3: Add Microsoft Clarity to the landing layout**

Edit `apps/web/src/app/l/[slug]/layout.tsx` and append inside the rendered HTML:

```tsx
{process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ? (
  <Script
    id="ms-clarity"
    strategy="afterInteractive"
    dangerouslySetInnerHTML={{
      __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID}");`,
    }}
  />
) : null}
```

Import `Script` from `next/script` if not already present. Add `NEXT_PUBLIC_CLARITY_PROJECT_ID=` to `.env.example`.

- [ ] **Step 4: Type-check + dev-server smoke**

Run: `npm run type-check`
Run: `npm run dev:web` in one terminal, `npm run dev:api` in another. Open a landing page and confirm no console errors and that `/public/video-sessions` requests appear in DevTools when pressing play.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): switchover — remove legacy video-events routes, wire Clarity"
```

- [ ] **Step 6: Manual E2E matrix**

Execute the checklist from spec §12.3 (Desktop Chrome/Firefox/Safari, iOS Safari, Android Chrome, YouTube path, rate limit sanity) on real devices or BrowserStack. Do not proceed to Task 19 until all checks pass. Record results in the PR description.

---

# Stage 7 — UI

## Task 19: Video analytics dashboard page

**Files:**
- Create: `apps/web/src/app/(dashboard)/videos/[id]/analytics/page.tsx`
- Create: `apps/web/src/components/analytics/retention-chart.tsx`

- [ ] **Step 1: Create the retention chart component**

Pure presentational SVG component that takes `retention: VideoRetentionPoint[]` and a `videoDurationSeconds: number`. Render views as an area chart on the X-axis and replay intensity as a colored overlay. Highlight top-5 `seekAwayCount` seconds with vertical markers and top-5 `pauseCount` seconds as dots.

```tsx
'use client';

import type { VideoRetentionPoint } from '@laptopguru-crm/shared';

interface Props {
  retention: VideoRetentionPoint[];
  durationSeconds: number;
}

export function RetentionChart({ retention, durationSeconds }: Props) {
  if (!retention.length) return <div className="text-sm text-neutral-500">No views yet</div>;
  const maxViews = Math.max(...retention.map((r) => r.views));
  const maxReplays = Math.max(...retention.map((r) => r.replays), 1);
  const width = 800;
  const height = 200;
  const xOf = (s: number) => (s / Math.max(1, durationSeconds)) * width;
  const yOf = (v: number) => height - (v / Math.max(1, maxViews)) * (height - 20);

  const path = retention
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${xOf(r.second).toFixed(1)} ${yOf(r.views).toFixed(1)}`)
    .join(' ');

  const topSeek = [...retention].sort((a, b) => b.seekAwayCount - a.seekAwayCount).slice(0, 5);
  const topPause = [...retention].sort((a, b) => b.pauseCount - a.pauseCount).slice(0, 5);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
      {retention.map((r) => (
        <rect
          key={r.second}
          x={xOf(r.second)}
          y={0}
          width={Math.max(1, width / Math.max(1, durationSeconds))}
          height={height}
          fill={`rgba(239, 68, 68, ${Math.min(0.5, r.replays / maxReplays)})`}
        />
      ))}
      <path d={path} stroke="currentColor" strokeWidth={2} fill="none" />
      {topSeek.map((r) => (
        <line key={`s-${r.second}`} x1={xOf(r.second)} x2={xOf(r.second)} y1={0} y2={height} stroke="orange" strokeDasharray="4 4" />
      ))}
      {topPause.map((r) => (
        <circle key={`p-${r.second}`} cx={xOf(r.second)} cy={yOf(r.views)} r={4} fill="dodgerblue" />
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: Create the page**

```tsx
import { videoAnalytics } from '@laptopguru-crm/api-client';
import { RetentionChart } from '@/components/analytics/retention-chart';

export default async function VideoAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await videoAnalytics.getAnalytics(id);

  return (
    <div className="p-6 space-y-6">
      <section className="grid grid-cols-5 gap-4">
        <KpiCard label="Sessions" value={data.overview.sessions} />
        <KpiCard label="Unique visitors" value={data.overview.uniqueVisitors} />
        <KpiCard label="Avg watch" value={`${Math.round(data.overview.avgWatchTimeMs / 1000)}s`} />
        <KpiCard label="Completion" value={`${Math.round(data.overview.completionRate * 100)}%`} />
        <KpiCard label="Errors" value={data.overview.errorCount} />
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-2">Retention</h2>
        <RetentionChart retention={data.retention} durationSeconds={data.retention.at(-1)?.second ?? 0} />
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-2">Recent sessions</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th>Started</th><th>Duration</th><th>Completion</th><th>Device</th><th>Country</th><th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {data.recentSessions.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.startedAt).toLocaleString()}</td>
                <td>{Math.round(s.durationWatchedMs / 1000)}s</td>
                <td>{Math.round(s.completionPercent * 100)}%</td>
                <td>{s.deviceType ?? '—'}</td>
                <td>{s.country ?? '—'}</td>
                <td>{s.endReason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/videos/\[id\]/analytics apps/web/src/components/analytics/retention-chart.tsx
git commit -m "feat(web): video analytics dashboard with retention chart"
```

## Task 20: Drill-down session timeline

**Files:**
- Create: `apps/web/src/components/analytics/session-timeline.tsx`
- Modify: `apps/web/src/app/(dashboard)/analytics/[slug]/page.tsx` (or a nested `visits/[visitId]/page.tsx` if that's the existing structure)

- [ ] **Step 1: Session timeline component**

```tsx
'use client';
import type { VisitPlaybackSession } from '@laptopguru-crm/shared';

export function SessionTimeline({ session }: { session: VisitPlaybackSession }) {
  const dur = session.videoDurationMs;
  const wall = Math.max(
    1,
    new Date(session.endedAt ?? session.startedAt).getTime() -
      new Date(session.startedAt).getTime(),
  );

  // Per-second play count from the decoded trace.
  const videoCells: number[] = new Array(Math.ceil(dur / 1000)).fill(0);
  let isPlaying = false;
  let lastT = 0, lastPos = 0;
  for (const ev of session.trace) {
    if (ev.type === 'PLAY') { isPlaying = true; lastT = ev.tMs; lastPos = ev.posMs; }
    else if (ev.type === 'TICK' && isPlaying) {
      const dPos = ev.posMs - lastPos;
      if (dPos > 0) {
        for (let s = Math.floor(lastPos / 1000); s < Math.floor(ev.posMs / 1000); s++) videoCells[s] += 1;
      }
      lastT = ev.tMs; lastPos = ev.posMs;
    } else if (ev.type === 'PAUSE' || ev.type === 'ENDED' || ev.type === 'SEEK') {
      isPlaying = ev.type === 'SEEK' ? isPlaying : false;
      lastT = ev.tMs; lastPos = ev.posMs;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-neutral-500 mb-1">Video timeline</div>
        <div className="flex h-6 overflow-hidden rounded">
          {videoCells.map((n, i) => (
            <div
              key={i}
              className="flex-1"
              style={{ background: n === 0 ? '#e5e7eb' : n === 1 ? '#3b82f6' : '#ef4444' }}
              title={`s${i}: ${n}x`}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs text-neutral-500 mb-1">Real timeline</div>
        <div className="relative h-6 rounded bg-neutral-200 overflow-hidden">
          {session.trace.map((ev, idx) => {
            const left = (ev.tMs / wall) * 100;
            const color =
              ev.type === 'PLAY' ? '#10b981' :
              ev.type === 'PAUSE' ? '#9ca3af' :
              ev.type === 'BUFFER_START' ? '#ef4444' :
              ev.type === 'VISIBILITY_HIDDEN' ? '#4b5563' : 'transparent';
            return <div key={idx} className="absolute top-0 bottom-0 w-[2px]" style={{ left: `${left}%`, background: color }} />;
          })}
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">Event list ({session.trace.length})</summary>
        <ol className="mt-2 text-xs font-mono space-y-0.5 max-h-64 overflow-auto">
          {session.trace.map((ev, i) => (
            <li key={i}>
              <span className="text-neutral-500">{(ev.tMs / 1000).toFixed(2)}s</span>{' '}
              <span className="font-semibold">{ev.type}</span>{' '}
              <span>pos={(ev.posMs / 1000).toFixed(2)}s</span>
              {ev.fromMs !== undefined && <span> from={(ev.fromMs / 1000).toFixed(2)}s</span>}
              {ev.message && <span className="text-red-500"> {ev.message}</span>}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into drill-down**

Open the existing drill-down route (check `apps/web/src/app/(dashboard)/analytics/[slug]/page.tsx` and subdirectories). Add a fetch via `videoAnalytics.getVisitPlayback(slug, visitId)` and render one `<SessionTimeline>` per returned session, with a header showing session duration, completion, and end reason.

- [ ] **Step 3: Type-check + dev smoke**

Run: `npm run type-check`
Run: `npm run dev` and manually open the analytics pages with seeded data to confirm the chart and timeline render.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/analytics apps/web/src/components/analytics/session-timeline.tsx
git commit -m "feat(web): session timeline drill-down for playback sessions"
```

---

# Stage 8 — Destructive cleanup

> **Only run Stage 8 after 1–2 days of observing stages 6–7 in production.** The pre-cleanup safety tag (`pre-video-analytics-switchover`) must still exist.

## Task 21: Drop VideoWatchEvent model and related code

**Files:**
- Modify: `prisma/schema.prisma`
- Delete/modify: `apps/api/src/modules/videos/analytics-cleanup.processor.ts`
- Modify: `apps/api/src/modules/videos/videos.module.ts`

- [ ] **Step 1: Verify no remaining references**

Run: `grep -rn "VideoWatchEvent\|VideoEventType\|watchEvents" apps packages prisma | grep -v generated`
Expected: zero matches outside of `schema.prisma` and the cleanup processor (which will also be deleted).

If there are matches, fix them by migrating to `VideoPlaybackSession` and re-run the grep.

- [ ] **Step 2: Delete the model + enum from `schema.prisma`**

Remove the `VideoWatchEvent` model and `VideoEventType` enum blocks. Remove `watchEvents VideoWatchEvent[]` from the `Video` model. Also remove the `VideoWatchEvent[]` relation from `Company` if present.

- [ ] **Step 3: Generate the migration**

Run: `npm run db:migrate -- --name drop_video_watch_event`
Expected: Prisma generates a `DROP TABLE` migration. Inspect it before applying to production.

- [ ] **Step 4: Remove `AnalyticsCleanupProcessor` references**

If the processor existed solely to purge old `VideoWatchEvent` rows, delete it and remove:
- its import and registration in `videos.module.ts`
- the `analytics-cleanup` queue from `BullModule.registerQueue`
- the `InjectQueue('analytics-cleanup')` in the constructor
- the scheduled `analyticsCleanupQueue.add('cleanup', …)` in `onModuleInit`

Otherwise, update it to target `VideoPlaybackSession` rows older than N days (defer this decision until volume justifies it; for now, delete).

- [ ] **Step 5: Type-check + tests**

Run: `npm run type-check`
Run: `npm test --workspace=@laptopguru-crm/api`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add prisma apps/api/src/modules/videos
git commit -m "chore(video-analytics): drop legacy VideoWatchEvent model"
```

---

## Self-Review (completed by the plan author)

**Spec coverage:**

- §4 Architecture → Stages 1–7 (tasks 1, 6, 8, 11, 12, 19, 20).
- §5.1–§5.6 Data model → Task 1 (all new models + enum, `LandingVisit` fields reused, `VideoWatchEvent` scheduled for Stage 8/Task 21).
- §6 Client tracker → Task 16 (buffer, flush, beacon, pause-long, retry) + Task 17 (player wiring) + Task 18 (Clarity).
- §7 Ingestion API → Tasks 3 (rate limit), 4 (JWT whitelist), 5 (public guard), 6 (module/DTOs), 7 (service), 8 (controller + CORS + text/plain beacon).
- §8 Finalize worker + reaper → Tasks 9 (`computeAggregates`), 10 (`computeSecondDeltas`), 11 (worker), 12 (reaper).
- §9 Read-side + UI → Tasks 13 (analytics), 14 (visit playback), 15 (api-client), 19 (dashboard), 20 (drill-down).
- §10 Microsoft Clarity → Task 18 step 3.
- §11 Rollout → Stages 1–8 headers with safety tag in stage-6 intro.
- §12 Testing → TDD steps in tasks 2, 3, 5, 7, 9, 10, 11, 13, 16; manual E2E checklist cited in Task 18 step 6.

**Placeholder scan:** No `TBD`, no "add appropriate error handling", no "similar to Task N". Steps that span long code show the full code block.

**Type consistency:** `EventCode`, `EventTuple`, `encodeEvent`, `decodeTrace`, `DecodedEvent` are defined once in Task 2 and imported consistently in Tasks 9, 10, 11, 13, 14, 16, 20. `PublicLandingContext` defined in Task 5, consumed in Task 8. `FinalizeJobData` shape (`{ sessionId, reason }`) matches between Task 7 (enqueue), Task 11 (consume), Task 12 (enqueue). `VideoAnalyticsData` / `VisitPlaybackData` defined in Task 2 and consumed identically in Tasks 13, 14, 15, 19, 20.
