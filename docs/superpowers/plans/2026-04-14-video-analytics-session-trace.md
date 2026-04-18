# Video Analytics Session Trace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the event-log-per-row `VideoWatchEvent` system with a session-trace model that captures millisecond-grade per-session playback timelines, survives iOS Safari backgrounding, dedups at the storage layer, and powers richer per-video and per-visit analytics.

**Architecture:** A client tracker in `apps/web` records player events into a ring buffer and POSTs chunks to `apps/api` endpoints under `/public/video-sessions/*`. The API appends chunks to a JSONB `VideoPlaybackSession.trace`, dedups via a `(sessionId, seq)` primary key, and enqueues a BullMQ finalize job on the terminal chunk. A worker computes session aggregates and per-second `VideoSecondStats`. A reaper cron finalizes orphaned sessions every 5 minutes. All backend logic lives in `apps/api`; `apps/web` only tracks and renders. Microsoft Clarity handles general session replay.

**Tech Stack:** Prisma 7 (PostgreSQL 16 JSONB), NestJS 11, BullMQ, Redis, Next.js 16 (App Router), React 19, Vitest.

**Source spec:** `docs/superpowers/specs/2026-04-14-video-analytics-session-trace-design.md`

---

## File Structure

### New files (apps/api)

- `apps/api/src/modules/video-sessions/video-sessions.module.ts` — NestJS module wiring
- `apps/api/src/modules/video-sessions/video-sessions.controller.ts` — public ingestion endpoints
- `apps/api/src/modules/video-sessions/video-sessions.service.ts` — session create / append
- `apps/api/src/modules/video-sessions/video-sessions.service.spec.ts`
- `apps/api/src/modules/video-sessions/dto/create-session.dto.ts`
- `apps/api/src/modules/video-sessions/dto/append-chunk.dto.ts`
- `apps/api/src/modules/video-sessions/workers/finalize.worker.ts` — BullMQ finalize processor
- `apps/api/src/modules/video-sessions/workers/finalize.worker.spec.ts`
- `apps/api/src/modules/video-sessions/workers/reaper.cron.ts` — cron for orphaned sessions
- `apps/api/src/modules/video-sessions/workers/reaper.cron.spec.ts`
- `apps/api/src/modules/video-sessions/aggregates/compute-aggregates.ts`
- `apps/api/src/modules/video-sessions/aggregates/compute-aggregates.spec.ts`
- `apps/api/src/modules/video-sessions/aggregates/compute-second-deltas.ts`
- `apps/api/src/modules/video-sessions/aggregates/compute-second-deltas.spec.ts`
- `apps/api/src/modules/video-sessions/visit-playback.controller.ts` — authed drill-down endpoint
- `apps/api/src/modules/video-sessions/visit-playback.service.ts`
- `apps/api/src/common/guards/public-landing.guard.ts`
- `apps/api/src/common/decorators/public-landing-endpoint.decorator.ts`
- `apps/api/src/common/services/rate-limit.service.ts`
- `apps/api/src/common/services/rate-limit.service.spec.ts`

### New files (apps/web)

- `apps/web/src/components/landing/video-tracker.ts` — client tracker + `useVideoTracker` hook
- `apps/web/src/app/(dashboard)/videos/[id]/analytics/page.tsx` — per-video analytics dashboard
- `apps/web/src/app/(dashboard)/analytics/[slug]/[visitId]/page.tsx` — drill-down
- `apps/web/src/app/(dashboard)/analytics/[slug]/[visitId]/session-timeline.tsx` — dual-track timeline component

### New files (packages/shared)

- `packages/shared/src/video-analytics.ts` — **rewritten** to export `EventCode`, `EventTuple`, `encodeTrace`, `decodeTrace`, DTOs, and dashboard types
- `packages/shared/src/video-analytics.spec.ts`

### New files (packages/api-client)

- `packages/api-client/src/video-analytics.ts` — typed calls for analytics + visit playback

### Modified files

- `prisma/schema.prisma` — add 3 models, 1 enum; (stage 8) drop `VideoWatchEvent`, `VideoEventType`
- `apps/api/src/app.module.ts` — register `VideoSessionsModule`, register global `JwtAuthGuard` with public skip
- `apps/api/src/main.ts` — relax CORS for `/public/video-*` endpoints
- `apps/api/src/modules/videos/videos.module.ts` — (stage 8) remove `AnalyticsCleanupProcessor` or repoint it at `VideoPlaybackSession`
- `apps/api/src/modules/videos/video-analytics.service.ts` — **rewritten** to read from `VideoSecondStats` + `VideoPlaybackSession`
- `apps/api/src/modules/landings/landings.controller.ts` — add `GET :slug/visits/:visitId/playback` (or placed in new module)
- `apps/web/src/app/l/[slug]/landing-client.tsx` — swap legacy video buffer for `useVideoTracker`; delete ~200 lines of old code
- `apps/web/src/app/l/[slug]/layout.tsx` — inject Microsoft Clarity script (gated on env)
- `packages/shared/src/index.ts` — re-export new types
- `packages/api-client/src/index.ts` — export new module

### Files to DELETE (stage 6)

- `apps/web/src/app/api/landings/[slug]/video-events/route.ts`
- `apps/web/src/app/api/landings/[slug]/visits/[visitId]/video-events/route.ts`

### Files to DELETE (stage 8)

- `apps/api/src/modules/videos/analytics-cleanup.processor.ts` (or rewrite)
- Any remaining references to `VideoWatchEvent` or `VideoEventType`

---

## Conventions

- **Path prefix.** NestJS `app.setGlobalPrefix('api')` means a controller decorated `@Controller('public/video-sessions')` actually serves `POST /api/public/video-sessions`. Client paths and Caddy routes must include `/api`. The spec's "POST /public/video-sessions" is shorthand; the real path is `/api/public/video-sessions`.
- **Prisma clients.** After any `schema.prisma` change run `npm run db:generate` (it regenerates both the web and api clients). Import from the local generated path per `CLAUDE.md`, not `@prisma/client`.
- **Per-app Prisma.** `apps/api` uses `PrismaService` with `prisma.raw.<model>` for tenant-bypass writes (public endpoints have no CLS companyId). Use `prisma.raw` for all writes under `/public/*`.
- **Commits.** No `Co-Authored-By` trailer — the user has disabled it project-wide.
- **Tests.** `npm test --workspace=@laptopguru-crm/api` runs Vitest in the API. Shared-package tests run via the same Vitest config from the api workspace unless the package has its own — see task 4 for the exact command.

---

## Stage 1 — Schema

### Task 1: Add new Prisma models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `VideoSessionEndReason` enum**

In `prisma/schema.prisma`, add after the existing `VideoEventType` enum (after line ~167):

```prisma
enum VideoSessionEndReason {
  ENDED
  PAUSED_LONG
  CLOSED
  NAVIGATED
  ERROR
  INCOMPLETE
}
```

- [ ] **Step 2: Add `VideoPlaybackSession` model**

Add at end of the file (after the last existing model, before the EOF):

```prisma
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

  chunks VideoSessionChunk[]

  @@unique([landingVisitId, videoId, startedAt])
  @@index([videoId, startedAt])
  @@index([companyId, startedAt])
  @@index([finalized, updatedAt])
}
```

- [ ] **Step 3: Add `VideoSessionChunk` model**

```prisma
model VideoSessionChunk {
  sessionId  String
  seq        Int
  receivedAt DateTime @default(now())

  session    VideoPlaybackSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@id([sessionId, seq])
}
```

- [ ] **Step 4: Add `VideoSecondStats` model**

```prisma
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

- [ ] **Step 5: Add reverse relations**

In `Video` (after `watchEvents VideoWatchEvent[]`), add:

```prisma
  playbackSessions VideoPlaybackSession[]
  secondStats      VideoSecondStats[]
```

In `LandingVisit` (after `watchEvents VideoWatchEvent[]`), add:

```prisma
  playbackSessions VideoPlaybackSession[]
```

`VideoWatchEvent` and `VideoEventType` stay for now; stage 8 drops them.

- [ ] **Step 6: Create and apply migration**

Run from repo root:

```bash
npm run db:migrate -- --name add_video_playback_session
```

Expected: a new migration file in `prisma/migrations/`, `psql` reports three new tables and one new enum type.

- [ ] **Step 7: Regenerate both Prisma clients**

```bash
npm run db:generate
```

Expected: files under `apps/api/src/generated/prisma/` and `apps/web/src/generated/prisma/` updated with `VideoPlaybackSession`, `VideoSessionChunk`, `VideoSecondStats` types.

- [ ] **Step 8: Verify type-check still passes**

```bash
npm run type-check
```

Expected: no new errors. (Existing code doesn't touch the new models.)

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations apps/api/src/generated apps/web/src/generated
git commit -m "feat(schema): add VideoPlaybackSession, VideoSessionChunk, VideoSecondStats"
```

---

## Stage 2 — Shared Types

### Task 2: EventCode enum, tuple type, DTOs

**Files:**
- Modify: `packages/shared/src/video-analytics.ts` (full rewrite)
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Rewrite `packages/shared/src/video-analytics.ts` with the new surface**

Replace the file contents with:

```typescript
// ============================================================================
// Event codes — integer tuples for compact trace storage.
// Never renumber existing codes. Add new ones at the end.
// ============================================================================

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

// Tuple: [tMs, typeCode, posMs, extra?]
//   tMs    — ms since session startedAt
//   posMs  — position in video in ms
//   extra  — type-dependent (see EventExtras)
export type EventTuple = [number, number, number, unknown?];

export type EventExtras = {
  [EventCode.SEEK]: { fromMs: number };
  [EventCode.RATE]: { playbackRate: number };
  [EventCode.VOLUME]: { volume: number; muted: boolean };
  [EventCode.BUFFER_END]: { durationMs: number };
  [EventCode.QUALITY]: { label: string };
  [EventCode.ERROR]: { message: string };
};

export type DecodedEvent =
  | { tMs: number; type: EventCode.TICK; posMs: number }
  | { tMs: number; type: EventCode.PLAY; posMs: number }
  | { tMs: number; type: EventCode.PAUSE; posMs: number }
  | { tMs: number; type: EventCode.SEEK; posMs: number; fromMs: number }
  | { tMs: number; type: EventCode.ENDED; posMs: number }
  | { tMs: number; type: EventCode.RATE; posMs: number; playbackRate: number }
  | { tMs: number; type: EventCode.VOLUME; posMs: number; volume: number; muted: boolean }
  | { tMs: number; type: EventCode.FULLSCREEN_ON; posMs: number }
  | { tMs: number; type: EventCode.FULLSCREEN_OFF; posMs: number }
  | { tMs: number; type: EventCode.BUFFER_START; posMs: number }
  | { tMs: number; type: EventCode.BUFFER_END; posMs: number; durationMs: number }
  | { tMs: number; type: EventCode.QUALITY; posMs: number; label: string }
  | { tMs: number; type: EventCode.ERROR; posMs: number; message: string }
  | { tMs: number; type: EventCode.VISIBILITY_HIDDEN; posMs: number }
  | { tMs: number; type: EventCode.VISIBILITY_VISIBLE; posMs: number };

export function decodeTrace(trace: EventTuple[]): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  for (const tup of trace) {
    const [tMs, type, posMs, extra] = tup;
    switch (type as EventCode) {
      case EventCode.SEEK:
        out.push({ tMs, type, posMs, fromMs: (extra as { fromMs?: number })?.fromMs ?? posMs });
        break;
      case EventCode.RATE:
        out.push({ tMs, type, posMs, playbackRate: (extra as { playbackRate?: number })?.playbackRate ?? 1 });
        break;
      case EventCode.VOLUME: {
        const e = extra as { volume?: number; muted?: boolean } | undefined;
        out.push({ tMs, type, posMs, volume: e?.volume ?? 1, muted: e?.muted ?? false });
        break;
      }
      case EventCode.BUFFER_END:
        out.push({ tMs, type, posMs, durationMs: (extra as { durationMs?: number })?.durationMs ?? 0 });
        break;
      case EventCode.QUALITY:
        out.push({ tMs, type, posMs, label: (extra as { label?: string })?.label ?? '' });
        break;
      case EventCode.ERROR:
        out.push({ tMs, type, posMs, message: (extra as { message?: string })?.message ?? '' });
        break;
      case EventCode.TICK:
      case EventCode.PLAY:
      case EventCode.PAUSE:
      case EventCode.ENDED:
      case EventCode.FULLSCREEN_ON:
      case EventCode.FULLSCREEN_OFF:
      case EventCode.BUFFER_START:
      case EventCode.VISIBILITY_HIDDEN:
      case EventCode.VISIBILITY_VISIBLE:
        out.push({ tMs, type, posMs } as DecodedEvent);
        break;
      default:
        // Unknown code — skip. Keeps the decoder forward-compatible.
        break;
    }
  }
  return out;
}

export function encodeTrace(events: DecodedEvent[]): EventTuple[] {
  return events.map((e) => {
    switch (e.type) {
      case EventCode.SEEK:
        return [e.tMs, e.type, e.posMs, { fromMs: e.fromMs }];
      case EventCode.RATE:
        return [e.tMs, e.type, e.posMs, { playbackRate: e.playbackRate }];
      case EventCode.VOLUME:
        return [e.tMs, e.type, e.posMs, { volume: e.volume, muted: e.muted }];
      case EventCode.BUFFER_END:
        return [e.tMs, e.type, e.posMs, { durationMs: e.durationMs }];
      case EventCode.QUALITY:
        return [e.tMs, e.type, e.posMs, { label: e.label }];
      case EventCode.ERROR:
        return [e.tMs, e.type, e.posMs, { message: e.message }];
      default:
        return [e.tMs, e.type, e.posMs];
    }
  });
}

// ============================================================================
// Ingestion DTOs
// ============================================================================

export interface CreateSessionRequest {
  slug: string;
  visitId: string;
  videoId: string;
  videoDurationMs: number;
  clientStartedAt: string; // ISO timestamp
}

export interface CreateSessionResponse {
  sessionId: string;
}

export type SessionEndReason = 'ENDED' | 'PAUSED_LONG' | 'CLOSED' | 'NAVIGATED' | 'ERROR' | 'INCOMPLETE';

export interface AppendChunkRequest {
  seq: number;
  events: EventTuple[];
  final: boolean;
  endReason?: SessionEndReason;
}

// ============================================================================
// Read-side types
// ============================================================================

export interface VideoAnalyticsOverview {
  totalViews: number;
  uniqueViewers: number;
  totalWatchTime: number;   // seconds
  avgViewDuration: number;  // seconds
  completionRate: number;   // 0..1
  playRate: number;         // 0..1
  errorCount: number;
}

export interface VideoRetentionPoint {
  second: number;
  views: number;
  replays: number;
  viewersPercent: number;
}

export interface VideoAnalyticsData {
  overview: VideoAnalyticsOverview;
  durationSeconds: number;
  retention: VideoRetentionPoint[];
  topSeekAwaySeconds: { second: number; count: number }[];
  topPauseSeconds: { second: number; count: number }[];
  viewsTimeSeries: { date: string; views: number }[];
  geography: { country: string; views: number }[];
  devices: { deviceType: string; views: number }[];
  browsers: { browser: string; views: number }[];
  os: { os: string; views: number }[];
  referrers: { referrerDomain: string; views: number }[];
  recentSessions: {
    sessionId: string;
    visitId: string;
    startedAt: string;
    durationWatchedMs: number;
    completionPercent: number;
    endReason: SessionEndReason | null;
    country: string | null;
    device: string | null;
    browser: string | null;
  }[];
}

export interface VisitPlaybackSession {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  endReason: SessionEndReason | null;
  videoDurationMs: number;
  durationWatchedMs: number;
  completionPercent: number;
  events: DecodedEvent[];
}

export interface VisitPlaybackData {
  visitId: string;
  videoId: string;
  sessions: VisitPlaybackSession[];
}
```

- [ ] **Step 2: Update `packages/shared/src/index.ts` re-exports**

Replace the existing `video-analytics` line with:

```typescript
export { PERMISSIONS, PERMISSION_GROUPS, ROUTE_PERMISSIONS, ALL_PERMISSIONS, hasPermission } from './permissions';
export type { Permission } from './permissions';
export type { VideoSource, VideoStatus, VideoDTO, UploadInitRequest, UploadInitResponse } from './video';
export {
  EventCode,
  decodeTrace,
  encodeTrace,
} from './video-analytics';
export type {
  EventTuple,
  EventExtras,
  DecodedEvent,
  CreateSessionRequest,
  CreateSessionResponse,
  SessionEndReason,
  AppendChunkRequest,
  VideoAnalyticsOverview,
  VideoRetentionPoint,
  VideoAnalyticsData,
  VisitPlaybackSession,
  VisitPlaybackData,
} from './video-analytics';
```

- [ ] **Step 3: Type-check shared package**

```bash
npm run type-check --workspace=@laptopguru-crm/shared
```

Expected: passes.

- [ ] **Step 4: Type-check whole repo**

```bash
npm run type-check
```

Expected: The `apps/web/src/app/(dashboard)/analytics/[slug]/page.tsx` and `apps/api/src/modules/videos/video-analytics.service.ts` may fail because the shape of `VideoAnalyticsData` changed. **Fixing those belongs to stages 5 and 7** — for now, temporarily widen the old consumers so the repo still builds:

  - In `apps/api/src/modules/videos/video-analytics.service.ts`, change the return type annotation on `getFullAnalytics` from `Promise<VideoAnalyticsData>` to `Promise<any>` and add a one-line comment `// Rewritten in Task 14 (stage 5) against the new schema.` The service body is rewritten in stage 5.
  - In `apps/web/src/app/(dashboard)/analytics/[slug]/page.tsx`, the `VideoAnalytics` interface is a local copy, so it still compiles. Leave it alone — stage 7 replaces it.

Re-run `npm run type-check`. Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/api/src/modules/videos/video-analytics.service.ts
git commit -m "feat(shared): add EventCode, trace codec, and session-trace analytics types"
```

### Task 3: Codec tests

**Files:**
- Create: `packages/shared/src/video-analytics.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  EventCode,
  encodeTrace,
  decodeTrace,
  type DecodedEvent,
  type EventTuple,
} from './video-analytics';

describe('decodeTrace / encodeTrace', () => {
  it('round-trips every event code', () => {
    const events: DecodedEvent[] = [
      { tMs: 0, type: EventCode.PLAY, posMs: 0 },
      { tMs: 250, type: EventCode.TICK, posMs: 250 },
      { tMs: 500, type: EventCode.PAUSE, posMs: 500 },
      { tMs: 600, type: EventCode.SEEK, posMs: 0, fromMs: 500 },
      { tMs: 700, type: EventCode.RATE, posMs: 0, playbackRate: 1.5 },
      { tMs: 800, type: EventCode.VOLUME, posMs: 0, volume: 0.5, muted: false },
      { tMs: 900, type: EventCode.FULLSCREEN_ON, posMs: 0 },
      { tMs: 950, type: EventCode.FULLSCREEN_OFF, posMs: 0 },
      { tMs: 1000, type: EventCode.BUFFER_START, posMs: 0 },
      { tMs: 1200, type: EventCode.BUFFER_END, posMs: 0, durationMs: 200 },
      { tMs: 1300, type: EventCode.QUALITY, posMs: 0, label: '1080p' },
      { tMs: 1400, type: EventCode.ERROR, posMs: 0, message: 'decode error' },
      { tMs: 1500, type: EventCode.VISIBILITY_HIDDEN, posMs: 0 },
      { tMs: 1600, type: EventCode.VISIBILITY_VISIBLE, posMs: 0 },
      { tMs: 2000, type: EventCode.ENDED, posMs: 1999 },
    ];
    const tuples = encodeTrace(events);
    const decoded = decodeTrace(tuples);
    expect(decoded).toEqual(events);
  });

  it('decoder tolerates unknown type codes', () => {
    const tuples: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [100, 99 as unknown as EventCode, 100], // future code
      [200, EventCode.PAUSE, 200],
    ];
    const decoded = decodeTrace(tuples);
    expect(decoded.map((e) => e.type)).toEqual([EventCode.PLAY, EventCode.PAUSE]);
  });

  it('decoder tolerates missing extras', () => {
    const tuples: EventTuple[] = [
      [0, EventCode.SEEK, 100], // no extra
      [100, EventCode.RATE, 0], // no extra
      [200, EventCode.ERROR, 0], // no extra
    ];
    const decoded = decodeTrace(tuples);
    expect((decoded[0] as { fromMs: number }).fromMs).toBe(100); // falls back to posMs
    expect((decoded[1] as { playbackRate: number }).playbackRate).toBe(1);
    expect((decoded[2] as { message: string }).message).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

From repo root, run the shared package tests. The shared package has no Vitest config of its own — it is picked up by the api workspace's Vitest because `tsconfig` maps `@laptopguru-crm/shared` to the shared source. Run:

```bash
cd apps/api && npx vitest run ../../packages/shared/src/video-analytics.spec.ts
```

Expected: PASS (the implementations are already in place from Task 2). If they fail, fix the encoder/decoder in `packages/shared/src/video-analytics.ts` until green.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/video-analytics.spec.ts
git commit -m "test(shared): add trace codec round-trip and edge-case tests"
```

---

## Stage 3 — Backend Ingestion

### Task 4: `RateLimitService` (shared Redis sliding window)

**Files:**
- Create: `apps/api/src/common/services/rate-limit.service.ts`
- Create: `apps/api/src/common/services/rate-limit.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Redis from 'ioredis-mock';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  let service: RateLimitService;

  beforeEach(() => {
    const redis = new Redis();
    service = new RateLimitService(redis as unknown as import('ioredis').Redis);
  });

  it('allows requests up to the limit', async () => {
    for (let i = 0; i < 10; i++) {
      expect(await service.check('k', 10, 60)).toBe(true);
    }
  });

  it('rejects the request that exceeds the limit', async () => {
    for (let i = 0; i < 10; i++) await service.check('k', 10, 60);
    expect(await service.check('k', 10, 60)).toBe(false);
  });

  it('resets via sliding window after time advances', async () => {
    for (let i = 0; i < 10; i++) await service.check('k', 10, 1);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await service.check('k', 10, 1)).toBe(true);
  });

  it('isolates keys', async () => {
    for (let i = 0; i < 10; i++) await service.check('a', 10, 60);
    expect(await service.check('b', 10, 60)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/common/services/rate-limit.service.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Install `ioredis` and `ioredis-mock`**

```bash
npm install --workspace=@laptopguru-crm/api ioredis
npm install --save-dev --workspace=@laptopguru-crm/api ioredis-mock
```

`ioredis` is already a transitive dep of BullMQ, but we add it explicitly so the type import and direct client construction are stable.

- [ ] **Step 4: Implement `RateLimitService`**

Create `apps/api/src/common/services/rate-limit.service.ts`:

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
    const member = `${now}:${Math.random()}`;

    const pipe = this.redis.pipeline();
    pipe.zremrangebyscore(key, 0, windowStart);
    pipe.zadd(key, now, member);
    pipe.zcard(key);
    pipe.expire(key, windowSec);
    const results = await pipe.exec();
    if (!results) return true;
    const countResult = results[2];
    const count = Array.isArray(countResult) ? (countResult[1] as number) : 0;
    return count <= limit;
  }
}
```

- [ ] **Step 5: Wire a global Redis client provider**

In `apps/api/src/app.module.ts`, add after the imports:

```typescript
import Redis from 'ioredis';
import { RateLimitService, REDIS_CLIENT } from './common/services/rate-limit.service';
```

And in the `providers` array add:

```typescript
    {
      provide: REDIS_CLIENT,
      useFactory: () => new Redis(process.env.REDIS_URL || 'redis://localhost:6379'),
    },
    RateLimitService,
```

Then export `RateLimitService` from `AppModule` by adding `exports: [RateLimitService]` to the module decorator (alongside `providers`). (NestJS requires the module to export a provider for other modules to inject it — adding to `exports` is safe for root module singletons.)

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/common/services/rate-limit.service.spec.ts
```

Expected: PASS (all 4).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/services apps/api/src/app.module.ts package.json package-lock.json apps/api/package.json
git commit -m "feat(api): add Redis sliding-window RateLimitService"
```

### Task 5: `@PublicLandingEndpoint` decorator + `PublicLandingGuard`

**Files:**
- Create: `apps/api/src/common/decorators/public-landing-endpoint.decorator.ts`
- Create: `apps/api/src/common/guards/public-landing.guard.ts`
- Create: `apps/api/src/common/guards/public-landing.guard.spec.ts`

- [ ] **Step 1: Create the decorator**

`apps/api/src/common/decorators/public-landing-endpoint.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';

export const PUBLIC_LANDING_ENDPOINT = 'public-landing-endpoint';

/**
 * Marks a route as a public landing endpoint. `JwtAuthGuard` will skip auth
 * for routes decorated with this. `PublicLandingGuard` will validate the
 * visit → landing → video → company ownership chain and attach
 * `req.publicContext` for the controller to consume.
 */
export const PublicLandingEndpoint = () => SetMetadata(PUBLIC_LANDING_ENDPOINT, true);
```

- [ ] **Step 2: Write tests for the guard**

Create `apps/api/src/common/guards/public-landing.guard.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, NotFoundException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicLandingGuard } from './public-landing.guard';

function makeCtx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('PublicLandingGuard', () => {
  let guard: PublicLandingGuard;
  let prisma: {
    raw: {
      landingVisit: { findUnique: ReturnType<typeof vi.fn> };
      videoPlaybackSession: { findUnique: ReturnType<typeof vi.fn> };
    };
  };
  let reflector: Reflector;

  beforeEach(() => {
    prisma = {
      raw: {
        landingVisit: { findUnique: vi.fn() },
        videoPlaybackSession: { findUnique: vi.fn() },
      },
    };
    reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    guard = new PublicLandingGuard(prisma as never, reflector);
  });

  it('accepts valid create-session body and attaches publicContext', async () => {
    prisma.raw.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'abc', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    const req = { body: { slug: 'abc', visitId: 'v1', videoId: 'vid1' }, params: {} };
    const ok = await guard.canActivate(makeCtx(req));
    expect(ok).toBe(true);
    expect((req as { publicContext?: unknown }).publicContext).toEqual({
      companyId: 'c1',
      landingId: 'l1',
      visitId: 'v1',
      videoId: 'vid1',
    });
  });

  it('rejects when visit is missing', async () => {
    prisma.raw.landingVisit.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(makeCtx({ body: { slug: 'x', visitId: 'v', videoId: 'vid' }, params: {} })),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects when slug does not match the visit landing', async () => {
    prisma.raw.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'wrong', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    await expect(
      guard.canActivate(makeCtx({ body: { slug: 'abc', visitId: 'v1', videoId: 'vid1' }, params: {} })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when videoId does not match the landing video', async () => {
    prisma.raw.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'abc', companyId: 'c1', videoId: 'OTHER', id: 'l1' },
    });
    await expect(
      guard.canActivate(makeCtx({ body: { slug: 'abc', visitId: 'v1', videoId: 'vid1' }, params: {} })),
    ).rejects.toThrow(BadRequestException);
  });

  it('chunk route: resolves context from sessionId when body lacks ids', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      landingVisitId: 'v1',
      videoId: 'vid1',
      companyId: 'c1',
      visit: { landingId: 'l1' },
    });
    const req = { body: { seq: 1, events: [], final: false }, params: { sessionId: 's1' } };
    const ok = await guard.canActivate(makeCtx(req));
    expect(ok).toBe(true);
    expect((req as { publicContext?: unknown }).publicContext).toEqual({
      companyId: 'c1',
      landingId: 'l1',
      visitId: 'v1',
      videoId: 'vid1',
      sessionId: 's1',
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/common/guards/public-landing.guard.spec.ts
```

Expected: FAIL — guard module not found.

- [ ] **Step 4: Implement the guard**

Create `apps/api/src/common/guards/public-landing.guard.ts`:

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_LANDING_ENDPOINT } from '../decorators/public-landing-endpoint.decorator';

export interface PublicContext {
  companyId: string;
  landingId: string;
  visitId: string;
  videoId: string;
  sessionId?: string;
}

@Injectable()
export class PublicLandingGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_LANDING_ENDPOINT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) return true;

    const req = context.switchToHttp().getRequest<{
      body?: Record<string, unknown>;
      params?: Record<string, string>;
      publicContext?: PublicContext;
    }>();
    const body = req.body ?? {};
    const params = req.params ?? {};

    // Chunk route: sessionId in URL, slug/visitId/videoId may be absent.
    if (params.sessionId) {
      const session = await this.prisma.raw.videoPlaybackSession.findUnique({
        where: { id: params.sessionId },
        select: {
          id: true,
          landingVisitId: true,
          videoId: true,
          companyId: true,
          visit: { select: { landingId: true } },
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      req.publicContext = {
        companyId: session.companyId,
        landingId: session.visit.landingId,
        visitId: session.landingVisitId,
        videoId: session.videoId,
        sessionId: session.id,
      };
      return true;
    }

    // Create-session route: body must contain slug, visitId, videoId
    const slug = typeof body.slug === 'string' ? body.slug : undefined;
    const visitId = typeof body.visitId === 'string' ? body.visitId : undefined;
    const videoId = typeof body.videoId === 'string' ? body.videoId : undefined;

    if (!slug || !visitId || !videoId) {
      throw new BadRequestException('slug, visitId, and videoId are required');
    }

    const visit = await this.prisma.raw.landingVisit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        landing: { select: { id: true, slug: true, companyId: true, videoId: true } },
      },
    });

    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.landing.slug !== slug) throw new BadRequestException('Visit does not belong to slug');
    if (visit.landing.videoId !== videoId)
      throw new BadRequestException('Video does not belong to landing');

    req.publicContext = {
      companyId: visit.landing.companyId,
      landingId: visit.landing.id,
      visitId: visit.id,
      videoId,
    };
    return true;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/common/guards/public-landing.guard.spec.ts
```

Expected: PASS (5/5).

- [ ] **Step 6: Make JwtAuthGuard skip public endpoints**

Replace `apps/api/src/common/guards/jwt-auth.guard.ts` with:

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { PUBLIC_LANDING_ENDPOINT } from '../decorators/public-landing-endpoint.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_LANDING_ENDPOINT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

Confirm there is no test that constructs `JwtAuthGuard` without a Reflector argument (grep `new JwtAuthGuard(`). If there is, fix the call site.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common
git commit -m "feat(api): add PublicLandingGuard, @PublicLandingEndpoint, JwtAuthGuard public skip"
```

### Task 6: `VideoSessionsModule` scaffolding + DTOs

**Files:**
- Create: `apps/api/src/modules/video-sessions/video-sessions.module.ts`
- Create: `apps/api/src/modules/video-sessions/dto/create-session.dto.ts`
- Create: `apps/api/src/modules/video-sessions/dto/append-chunk.dto.ts`

- [ ] **Step 1: Create `create-session.dto.ts`**

```typescript
import { IsInt, IsISO8601, IsString, Min, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty() @IsString() @MaxLength(100) slug!: string;
  @ApiProperty() @IsString() @MaxLength(40) visitId!: string;
  @ApiProperty() @IsString() @MaxLength(40) videoId!: string;
  @ApiProperty() @IsInt() @Min(0) videoDurationMs!: number;
  @ApiProperty() @IsISO8601() clientStartedAt!: string;
}
```

- [ ] **Step 2: Create `append-chunk.dto.ts`**

```typescript
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  Min,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const END_REASONS = ['ENDED', 'PAUSED_LONG', 'CLOSED', 'NAVIGATED', 'ERROR', 'INCOMPLETE'] as const;
export type EndReason = (typeof END_REASONS)[number];

export class AppendChunkDto {
  @ApiProperty() @IsInt() @Min(0) seq!: number;

  // Runtime shape validated in the service (each tuple is [number, number, number, ?unknown]).
  // class-validator cannot express heterogeneous tuples, so we only bound length here.
  @ApiProperty({ type: [Array] })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(500)
  events!: unknown[];

  @ApiProperty() @IsBoolean() final!: boolean;

  @ApiProperty({ required: false, enum: END_REASONS })
  @IsOptional()
  @IsString()
  @IsIn(END_REASONS as unknown as string[])
  endReason?: EndReason;
}
```

- [ ] **Step 3: Create the empty module**

`apps/api/src/modules/video-sessions/video-sessions.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublicLandingGuard } from '../../common/guards/public-landing.guard';

@Module({
  imports: [BullModule.registerQueue({ name: 'video-session-finalize' })],
  providers: [PublicLandingGuard],
  exports: [],
})
export class VideoSessionsModule {}
```

- [ ] **Step 4: Register in `AppModule`**

In `apps/api/src/app.module.ts`, add `VideoSessionsModule` to the imports list.

- [ ] **Step 5: Verify build**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/video-sessions apps/api/src/app.module.ts
git commit -m "feat(api): scaffold VideoSessionsModule with DTOs"
```

### Task 7: `VideoSessionsService` — create session (idempotent)

**Files:**
- Create: `apps/api/src/modules/video-sessions/video-sessions.service.ts`
- Create: `apps/api/src/modules/video-sessions/video-sessions.service.spec.ts`

- [ ] **Step 1: Write failing tests for createSession**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoSessionsService } from './video-sessions.service';

function mockPrisma() {
  return {
    raw: {
      videoPlaybackSession: {
        upsert: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      videoSessionChunk: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
}

function mockQueue() {
  return { add: vi.fn() };
}

function mockRateLimit() {
  return { check: vi.fn().mockResolvedValue(true) };
}

describe('VideoSessionsService.createSession', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let queue: ReturnType<typeof mockQueue>;
  let rate: ReturnType<typeof mockRateLimit>;
  let service: VideoSessionsService;

  beforeEach(() => {
    prisma = mockPrisma();
    queue = mockQueue();
    rate = mockRateLimit();
    service = new VideoSessionsService(prisma as never, queue as never, rate as never);
  });

  it('creates (or returns existing) session via upsert on (visitId,videoId,startedAt)', async () => {
    prisma.raw.videoPlaybackSession.upsert.mockResolvedValue({ id: 's1' });
    const ctx = { companyId: 'c1', landingId: 'l1', visitId: 'v1', videoId: 'vid1' };
    const started = '2026-04-14T12:00:00.000Z';
    const out = await service.createSession(ctx, { videoDurationMs: 120000, clientStartedAt: started });

    expect(out).toEqual({ sessionId: 's1' });
    expect(prisma.raw.videoPlaybackSession.upsert).toHaveBeenCalledWith({
      where: {
        landingVisitId_videoId_startedAt: {
          landingVisitId: 'v1',
          videoId: 'vid1',
          startedAt: new Date(started),
        },
      },
      update: {},
      create: {
        landingVisitId: 'v1',
        videoId: 'vid1',
        companyId: 'c1',
        startedAt: new Date(started),
        videoDurationMs: 120000,
      },
      select: { id: true },
    });
  });

  it('rate-limits at 10/min per visit', async () => {
    rate.check.mockResolvedValueOnce(false);
    await expect(
      service.createSession(
        { companyId: 'c1', landingId: 'l1', visitId: 'v1', videoId: 'vid1' },
        { videoDurationMs: 1, clientStartedAt: '2026-04-14T00:00:00.000Z' },
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(rate.check).toHaveBeenCalledWith('ratelimit:session-create:v1', 10, 60);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/modules/video-sessions/video-sessions.service.spec.ts
```

Expected: FAIL — service not found.

- [ ] **Step 3: Implement `createSession`**

Create `apps/api/src/modules/video-sessions/video-sessions.service.ts`:

```typescript
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import type { PublicContext } from '../../common/guards/public-landing.guard';
import type { EndReason } from './dto/append-chunk.dto';

@Injectable()
export class VideoSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('video-session-finalize') private readonly finalizeQueue: Queue,
    private readonly rateLimit: RateLimitService,
  ) {}

  async createSession(
    ctx: PublicContext,
    body: { videoDurationMs: number; clientStartedAt: string },
  ): Promise<{ sessionId: string }> {
    const okRate = await this.rateLimit.check(`ratelimit:session-create:${ctx.visitId}`, 10, 60);
    if (!okRate) throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);

    const startedAt = new Date(body.clientStartedAt);
    if (Number.isNaN(startedAt.getTime())) throw new BadRequestException('Invalid clientStartedAt');

    const row = await this.prisma.raw.videoPlaybackSession.upsert({
      where: {
        landingVisitId_videoId_startedAt: {
          landingVisitId: ctx.visitId,
          videoId: ctx.videoId,
          startedAt,
        },
      },
      update: {},
      create: {
        landingVisitId: ctx.visitId,
        videoId: ctx.videoId,
        companyId: ctx.companyId,
        startedAt,
        videoDurationMs: body.videoDurationMs,
      },
      select: { id: true },
    });
    return { sessionId: row.id };
  }

  // appendChunk is implemented in the next task
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/modules/video-sessions/video-sessions.service.spec.ts
```

Expected: PASS (2/2).

- [ ] **Step 5: Wire into module**

In `apps/api/src/modules/video-sessions/video-sessions.module.ts`, add to `providers`: `VideoSessionsService`; to `exports`: `VideoSessionsService`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/video-sessions
git commit -m "feat(api): VideoSessionsService createSession with idempotent upsert"
```

### Task 8: `VideoSessionsService.appendChunk` (dedup + JSONB append)

**Files:**
- Modify: `apps/api/src/modules/video-sessions/video-sessions.service.ts`
- Modify: `apps/api/src/modules/video-sessions/video-sessions.service.spec.ts`

- [ ] **Step 1: Add failing tests for appendChunk**

Append to the spec file (inside the same `describe` block or a new one):

```typescript
describe('VideoSessionsService.appendChunk', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let queue: ReturnType<typeof mockQueue>;
  let rate: ReturnType<typeof mockRateLimit>;
  let service: VideoSessionsService;

  beforeEach(() => {
    prisma = mockPrisma();
    queue = mockQueue();
    rate = mockRateLimit();
    service = new VideoSessionsService(prisma as never, queue as never, rate as never);
  });

  const ctx = { companyId: 'c1', landingId: 'l1', visitId: 'v1', videoId: 'vid1', sessionId: 's1' };

  it('rejects events array with invalid tuples', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    await expect(
      service.appendChunk(ctx, { seq: 1, events: [['bad']], final: false } as never, { beacon: false }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects when position exceeds videoDurationMs + 1000', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    await expect(
      service.appendChunk(ctx, { seq: 1, events: [[0, 1, 11500]], final: false } as never, { beacon: false }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns 410 for finalized sessions', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: true,
      videoDurationMs: 10000,
    });
    await expect(
      service.appendChunk(ctx, { seq: 1, events: [[0, 1, 0]], final: false } as never, { beacon: false }),
    ).rejects.toMatchObject({ status: 410 });
  });

  it('inserts chunk row, appends to trace, increments chunksReceived', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    prisma.raw.videoSessionChunk.create.mockResolvedValue({});
    await service.appendChunk(
      ctx,
      { seq: 1, events: [[0, 1, 0], [250, 0, 250]], final: false } as never,
      { beacon: false },
    );
    expect(prisma.raw.videoSessionChunk.create).toHaveBeenCalledWith({
      data: { sessionId: 's1', seq: 1 },
    });
  });

  it('returns 202 on duplicate seq (unique-conflict swallowed)', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    const err = new Error('duplicate') as Error & { code?: string };
    err.code = 'P2002';
    prisma.raw.videoSessionChunk.create.mockRejectedValue(err);
    const out = await service.appendChunk(
      ctx,
      { seq: 1, events: [[0, 1, 0]], final: false } as never,
      { beacon: false },
    );
    expect(out).toEqual({ deduped: true });
  });

  it('enqueues finalize job when final=true', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    await service.appendChunk(
      ctx,
      { seq: 1, events: [[0, 1, 0]], final: true, endReason: 'ENDED' } as never,
      { beacon: false },
    );
    expect(queue.add).toHaveBeenCalledWith('finalize', { sessionId: 's1', reason: 'CLIENT_FINAL' });
  });

  it('beacon mode skips per-session rate limit', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      videoDurationMs: 10000,
    });
    rate.check.mockResolvedValue(false);
    const out = await service.appendChunk(
      ctx,
      { seq: 1, events: [[0, 1, 0]], final: true } as never,
      { beacon: true },
    );
    expect(out).toEqual({ accepted: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/modules/video-sessions/video-sessions.service.spec.ts
```

Expected: FAIL on all new tests.

- [ ] **Step 3: Implement `appendChunk`**

Append inside the `VideoSessionsService` class:

```typescript
  async appendChunk(
    ctx: PublicContext,
    body: {
      seq: number;
      events: unknown[];
      final: boolean;
      endReason?: EndReason;
    },
    opts: { beacon: boolean },
  ): Promise<{ deduped?: true; accepted?: true }> {
    if (!ctx.sessionId) throw new BadRequestException('Missing sessionId');

    if (!opts.beacon) {
      const ok = await this.rateLimit.check(`ratelimit:chunk:${ctx.sessionId}`, 120, 60);
      if (!ok) throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    } else {
      // Flood guard by visit even for beacons
      const ok = await this.rateLimit.check(`ratelimit:beacon:${ctx.visitId}`, 300, 60);
      if (!ok) return { accepted: true }; // swallow: beacons cannot retry
    }

    const session = await this.prisma.raw.videoPlaybackSession.findUnique({
      where: { id: ctx.sessionId },
      select: { id: true, finalized: true, videoDurationMs: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.finalized) throw new HttpException('Session already finalized', HttpStatus.GONE);

    // Validate events. Each must be a tuple [tMs: number, type: number 0..14, pos: number, extra?].
    const now = Date.now();
    const maxPos = session.videoDurationMs + 1000;
    const validated: unknown[] = [];
    for (const raw of body.events) {
      if (!Array.isArray(raw) || raw.length < 3 || raw.length > 4) {
        throw new BadRequestException('Malformed event tuple');
      }
      const [tMs, type, pos, extra] = raw as [unknown, unknown, unknown, unknown?];
      if (
        typeof tMs !== 'number' || !Number.isFinite(tMs) || tMs < 0 || tMs > now + 60_000 ||
        typeof type !== 'number' || !Number.isInteger(type) || type < 0 || type > 14 ||
        typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0 || pos > maxPos
      ) {
        throw new BadRequestException('Invalid event values');
      }
      // ERROR messages truncated to 500 chars.
      if (type === 12 && extra && typeof extra === 'object') {
        const msg = (extra as { message?: unknown }).message;
        if (typeof msg === 'string') {
          (extra as { message: string }).message = msg.slice(0, 500);
        }
      }
      validated.push(raw);
    }

    // Storage-layer dedup: insert the chunk row first; on unique conflict, swallow.
    try {
      await this.prisma.raw.videoSessionChunk.create({
        data: { sessionId: ctx.sessionId, seq: body.seq },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return { deduped: true };
      throw e;
    }

    // Append to trace + bump counters. Use raw SQL for JSONB concat.
    await this.prisma.raw.$executeRaw`
      UPDATE "VideoPlaybackSession"
      SET "trace" = "trace" || ${JSON.stringify(validated)}::jsonb,
          "chunksReceived" = "chunksReceived" + 1,
          "updatedAt" = NOW()
      WHERE "id" = ${ctx.sessionId}
    `;

    if (body.final) {
      await this.prisma.raw.videoPlaybackSession.update({
        where: { id: ctx.sessionId },
        data: {
          endedAt: new Date(),
          endReason: (body.endReason as EndReason | undefined) ?? 'CLOSED',
        },
      });
      await this.finalizeQueue.add('finalize', { sessionId: ctx.sessionId, reason: 'CLIENT_FINAL' });
    }

    return { accepted: true };
  }
```

Add at top of file (with other imports):

```typescript
import type { EndReason } from './dto/append-chunk.dto';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/modules/video-sessions/video-sessions.service.spec.ts
```

Expected: PASS (all 8).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/video-sessions
git commit -m "feat(api): VideoSessionsService appendChunk with storage-layer dedup"
```

### Task 9: Ingestion controller

**Files:**
- Create: `apps/api/src/modules/video-sessions/video-sessions.controller.ts`
- Modify: `apps/api/src/modules/video-sessions/video-sessions.module.ts`
- Modify: `apps/api/src/main.ts` (CORS)

- [ ] **Step 1: Create the controller**

```typescript
import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { PublicLandingEndpoint } from '../../common/decorators/public-landing-endpoint.decorator';
import { PublicLandingGuard, PublicContext } from '../../common/guards/public-landing.guard';
import { VideoSessionsService } from './video-sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { AppendChunkDto } from './dto/append-chunk.dto';

type PublicRequest = Request & { publicContext: PublicContext };

@ApiTags('Video Sessions (public)')
@Controller('public/video-sessions')
@UseGuards(PublicLandingGuard)
@SkipThrottle()
export class VideoSessionsController {
  constructor(private readonly service: VideoSessionsService) {}

  @Post()
  @PublicLandingEndpoint()
  @HttpCode(200)
  create(@Body() body: CreateSessionDto, @Req() req: PublicRequest) {
    return this.service.createSession(req.publicContext, {
      videoDurationMs: body.videoDurationMs,
      clientStartedAt: body.clientStartedAt,
    });
  }

  @Post(':sessionId/chunks')
  @PublicLandingEndpoint()
  @HttpCode(202)
  async append(
    @Param('sessionId') _sessionId: string,
    @Body() body: AppendChunkDto,
    @Req() req: PublicRequest,
  ) {
    await this.service.appendChunk(req.publicContext, body, { beacon: false });
    return { ok: true };
  }

  @Post(':sessionId/chunks/beacon')
  @PublicLandingEndpoint()
  @HttpCode(204)
  async beacon(
    @Param('sessionId') _sessionId: string,
    @Body() body: AppendChunkDto,
    @Req() req: PublicRequest,
  ) {
    await this.service.appendChunk(req.publicContext, body, { beacon: true });
    return;
  }
}
```

- [ ] **Step 2: Register controller**

In `video-sessions.module.ts`, add `VideoSessionsController` to `controllers`.

- [ ] **Step 3: Add path-scoped CORS for public endpoints**

Keep the existing `app.enableCors({...})` block unchanged (it handles dashboard-side CORS with credentials). Immediately **before** `app.enableCors(...)` in `apps/api/src/main.ts`, mount an Express middleware that opens CORS for `/api/public/*` without credentials:

```typescript
  app.use('/api/public', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
```

This runs before NestJS's global CORS, so public paths advertise wildcard origin and skip credentials while dashboard CORS stays unchanged. Security on the public paths is enforced by `PublicLandingGuard` via the ownership chain, not by origin.

- [ ] **Step 4: Boot the API, smoke-test the create endpoint**

Run:
```bash
npm run dev:api &   # in another terminal
sleep 5
curl -s -X POST http://localhost:4000/api/public/video-sessions \
  -H 'content-type: application/json' \
  -d '{"slug":"test","visitId":"bogus","videoId":"bogus","videoDurationMs":1000,"clientStartedAt":"2026-04-14T12:00:00.000Z"}' -i
```

Expected: 404 Not Found (visit doesn't exist). Confirms the guard and validation pipe are reached.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/video-sessions apps/api/src/main.ts
git commit -m "feat(api): ingestion controller for video sessions + CORS for public endpoints"
```

---

## Stage 4 — Finalize Worker and Reaper

### Task 10: `computeAggregates` pure function + tests

**Files:**
- Create: `apps/api/src/modules/video-sessions/aggregates/compute-aggregates.ts`
- Create: `apps/api/src/modules/video-sessions/aggregates/compute-aggregates.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { computeAggregates } from './compute-aggregates';
import { EventCode, type EventTuple } from '@laptopguru-crm/shared';

const DUR = 10_000; // 10 s video

describe('computeAggregates', () => {
  it('returns zeros for empty trace', () => {
    const agg = computeAggregates([], DUR);
    expect(agg.durationWatchedMs).toBe(0);
    expect(agg.playCount).toBe(0);
    expect(agg.completionPercent).toBe(0);
  });

  it('play then pause counts watched time as min(real, pos)', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.PAUSE, 5000],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.durationWatchedMs).toBe(5000);
    expect(agg.playCount).toBe(1);
    expect(agg.pauseCount).toBe(1);
    expect(agg.maxPositionMs).toBe(5000);
    expect(agg.completionPercent).toBeCloseTo(0.5);
  });

  it('forward seek does not inflate durationWatched', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [2000, EventCode.TICK, 2000],
      [2100, EventCode.SEEK, 8000, { fromMs: 2000 }],
      [4100, EventCode.PAUSE, 10000],
    ];
    const agg = computeAggregates(trace, DUR);
    // 0→2000 = 2000ms real, then from 8000 to 10000 = 2000ms real → 4000ms total watched
    expect(agg.durationWatchedMs).toBe(4000);
    expect(agg.maxPositionMs).toBe(10000);
    expect(agg.seekCount).toBe(1);
  });

  it('paused time is not counted as watched', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [3000, EventCode.PAUSE, 3000],
      // 30s gap of paused time (wall-clock advances, pos does not)
      [33000, EventCode.PLAY, 3000],
      [36000, EventCode.PAUSE, 6000],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.durationWatchedMs).toBe(6000);
    expect(agg.pauseCount).toBe(2);
    expect(agg.playCount).toBe(2);
  });

  it('buffer time accumulates and does not count as watched', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [2000, EventCode.TICK, 2000],
      [2100, EventCode.BUFFER_START, 2000],
      [5100, EventCode.BUFFER_END, 2000, { durationMs: 3000 }],
      [7100, EventCode.PAUSE, 4000],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.bufferCount).toBe(1);
    expect(agg.bufferTimeMs).toBe(3000);
    expect(agg.durationWatchedMs).toBeLessThanOrEqual(4000);
  });

  it('ENDED behaves as pause for duration accounting', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [10000, EventCode.ENDED, 10000],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.durationWatchedMs).toBe(10000);
    expect(agg.completionPercent).toBe(1);
    expect(agg.pauseCount).toBe(0);
  });

  it('completionPercent clipped to [0, 1]', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [10500, EventCode.PAUSE, 10500],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.completionPercent).toBe(1);
  });

  it('error events counted', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [1000, EventCode.ERROR, 1000, { message: 'x' }],
    ];
    const agg = computeAggregates(trace, DUR);
    expect(agg.errorCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/modules/video-sessions/aggregates/compute-aggregates.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `computeAggregates`**

```typescript
import { EventCode, type EventTuple } from '@laptopguru-crm/shared';

export interface SessionAggregates {
  durationWatchedMs: number;
  maxPositionMs: number;
  completionPercent: number;
  playCount: number;
  pauseCount: number;
  seekCount: number;
  bufferCount: number;
  bufferTimeMs: number;
  errorCount: number;
}

export function computeAggregates(trace: EventTuple[], videoDurationMs: number): SessionAggregates {
  let playCount = 0;
  let pauseCount = 0;
  let seekCount = 0;
  let bufferCount = 0;
  let errorCount = 0;
  let bufferTimeMs = 0;
  let durationWatchedMs = 0;
  let maxPositionMs = 0;

  let isPlaying = false;
  let lastTime = 0;
  let lastPos = 0;
  let bufferStart = 0;

  const flushDelta = (tMs: number, pos: number) => {
    if (!isPlaying) return;
    const realDelta = tMs - lastTime;
    const posDelta = pos - lastPos;
    if (realDelta <= 0 || posDelta <= 0) return;
    durationWatchedMs += Math.min(realDelta, posDelta);
  };

  for (const tup of trace) {
    const [tMs, type, pos] = tup;
    if (typeof pos === 'number' && pos > maxPositionMs) maxPositionMs = pos;

    switch (type as EventCode) {
      case EventCode.PLAY:
        playCount++;
        isPlaying = true;
        lastTime = tMs;
        lastPos = pos;
        break;
      case EventCode.PAUSE:
        pauseCount++;
        flushDelta(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.ENDED:
        flushDelta(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.TICK:
        flushDelta(tMs, pos);
        lastTime = tMs;
        lastPos = pos;
        break;
      case EventCode.SEEK:
        seekCount++;
        // Seek resets the play anchor without counting the gap.
        lastTime = tMs;
        lastPos = pos;
        break;
      case EventCode.BUFFER_START:
        bufferCount++;
        bufferStart = tMs;
        // Treat buffer like pause for duration accounting.
        flushDelta(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.BUFFER_END:
        if (bufferStart > 0) bufferTimeMs += tMs - bufferStart;
        bufferStart = 0;
        // Resume playing from here.
        isPlaying = true;
        lastTime = tMs;
        lastPos = pos;
        break;
      case EventCode.VISIBILITY_HIDDEN:
        // Treat as pause for duration accounting but keep counter-free.
        flushDelta(tMs, pos);
        isPlaying = false;
        break;
      case EventCode.VISIBILITY_VISIBLE:
        // Resume, without counting as a new play.
        // Only resume if the prior state was visibility-hidden (we cannot tell
        // here — err on the side of resuming; downstream TICK will re-anchor).
        isPlaying = true;
        lastTime = tMs;
        lastPos = pos;
        break;
      case EventCode.ERROR:
        errorCount++;
        break;
      default:
        break;
    }
  }

  const completionPercent =
    videoDurationMs > 0 ? Math.min(1, Math.max(0, maxPositionMs / videoDurationMs)) : 0;

  return {
    durationWatchedMs,
    maxPositionMs,
    completionPercent,
    playCount,
    pauseCount,
    seekCount,
    bufferCount,
    bufferTimeMs,
    errorCount,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/modules/video-sessions/aggregates/compute-aggregates.spec.ts
```

Expected: PASS (8/8). If not, debug the flushDelta math until green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/video-sessions/aggregates
git commit -m "feat(api): computeAggregates pure function with tests"
```

### Task 11: `computeSecondDeltas` + tests

**Files:**
- Create: `apps/api/src/modules/video-sessions/aggregates/compute-second-deltas.ts`
- Create: `apps/api/src/modules/video-sessions/aggregates/compute-second-deltas.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { computeSecondDeltas } from './compute-second-deltas';
import { EventCode, type EventTuple } from '@laptopguru-crm/shared';

const DUR = 10_000;

describe('computeSecondDeltas', () => {
  it('empty trace returns empty arrays', () => {
    const d = computeSecondDeltas([], DUR);
    expect(d.seconds).toEqual([]);
    expect(d.views).toEqual([]);
    expect(d.replays).toEqual([]);
  });

  it('linear play 0→10s sets views=1 for seconds 0..9, replays=0', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [10000, EventCode.ENDED, 10000],
    ];
    const d = computeSecondDeltas(trace, DUR);
    expect(d.seconds).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(d.views).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(d.replays).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(d.uniqueSecondsWatched).toBe(10);
  });

  it('seek backward produces replays on revisited seconds', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.TICK, 5000],
      [5100, EventCode.SEEK, 2000, { fromMs: 5000 }],
      [8100, EventCode.ENDED, 5000],
    ];
    const d = computeSecondDeltas(trace, DUR);
    // Seconds 0-4 played once, then 2-4 played again.
    expect(d.seconds.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    const bySecond = Object.fromEntries(d.seconds.map((s, i) => [s, { v: d.views[i], r: d.replays[i] }]));
    expect(bySecond[0]).toEqual({ v: 1, r: 0 });
    expect(bySecond[1]).toEqual({ v: 1, r: 0 });
    expect(bySecond[2]).toEqual({ v: 1, r: 1 });
    expect(bySecond[4]).toEqual({ v: 1, r: 1 });
  });

  it('seek forward skips seconds (no views for skipped range)', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [2000, EventCode.SEEK, 7000, { fromMs: 2000 }],
      [5000, EventCode.ENDED, 10000],
    ];
    const d = computeSecondDeltas(trace, DUR);
    const watched = new Set(d.seconds);
    expect(watched.has(3)).toBe(false);
    expect(watched.has(5)).toBe(false);
    expect(watched.has(0)).toBe(true);
    expect(watched.has(7)).toBe(true);
  });

  it('pause at second N increments pauseCount[N]', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [3500, EventCode.PAUSE, 3500],
    ];
    const d = computeSecondDeltas(trace, DUR);
    const idx = d.seconds.indexOf(3);
    expect(d.pauses[idx]).toBe(1);
  });

  it('seek away from second N (fromMs) increments seekAways[N]', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [5000, EventCode.SEEK, 1000, { fromMs: 5000 }],
      [6000, EventCode.ENDED, 2000],
    ];
    const d = computeSecondDeltas(trace, DUR);
    const idx = d.seconds.indexOf(5);
    expect(d.seekAways[idx]).toBe(1);
  });

  it('positions slightly beyond duration are clamped (no out-of-range writes)', () => {
    const trace: EventTuple[] = [
      [0, EventCode.PLAY, 0],
      [10500, EventCode.ENDED, 10500],
    ];
    const d = computeSecondDeltas(trace, DUR);
    expect(Math.max(...d.seconds)).toBeLessThanOrEqual(9);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/api && npx vitest run src/modules/video-sessions/aggregates/compute-second-deltas.spec.ts
```

- [ ] **Step 3: Implement**

```typescript
import { EventCode, type EventTuple } from '@laptopguru-crm/shared';

export interface SecondDeltas {
  seconds: number[];
  views: number[];
  replays: number[];
  pauses: number[];
  seekAways: number[];
  uniqueSecondsWatched: number;
}

export function computeSecondDeltas(trace: EventTuple[], videoDurationMs: number): SecondDeltas {
  const videoSeconds = Math.floor(videoDurationMs / 1000);
  const watchCount = new Map<number, number>(); // total plays per second (views + replays)
  const pauses = new Map<number, number>();
  const seekAways = new Map<number, number>();

  let isPlaying = false;
  let lastPosMs = 0;

  const markSeconds = (fromMs: number, toMs: number) => {
    const from = Math.max(0, Math.floor(fromMs / 1000));
    const to = Math.min(videoSeconds - 1, Math.floor((toMs - 1) / 1000)); // inclusive end
    for (let s = from; s <= to; s++) {
      watchCount.set(s, (watchCount.get(s) ?? 0) + 1);
    }
  };

  for (const tup of trace) {
    const [, type, pos] = tup;
    switch (type as EventCode) {
      case EventCode.PLAY:
        isPlaying = true;
        lastPosMs = pos;
        break;
      case EventCode.TICK:
        if (isPlaying && pos > lastPosMs) {
          markSeconds(lastPosMs, pos);
        }
        lastPosMs = pos;
        break;
      case EventCode.PAUSE: {
        if (isPlaying && pos > lastPosMs) markSeconds(lastPosMs, pos);
        const s = Math.floor(pos / 1000);
        if (s >= 0 && s < videoSeconds) pauses.set(s, (pauses.get(s) ?? 0) + 1);
        isPlaying = false;
        lastPosMs = pos;
        break;
      }
      case EventCode.ENDED:
        if (isPlaying && pos > lastPosMs) markSeconds(lastPosMs, pos);
        isPlaying = false;
        lastPosMs = pos;
        break;
      case EventCode.SEEK: {
        if (isPlaying && pos > lastPosMs) markSeconds(lastPosMs, lastPosMs); // no extra
        const extra = tup[3] as { fromMs?: number } | undefined;
        const fromMs = typeof extra?.fromMs === 'number' ? extra.fromMs : lastPosMs;
        const s = Math.floor(fromMs / 1000);
        if (s >= 0 && s < videoSeconds) seekAways.set(s, (seekAways.get(s) ?? 0) + 1);
        lastPosMs = pos;
        break;
      }
      case EventCode.BUFFER_START:
      case EventCode.VISIBILITY_HIDDEN:
        isPlaying = false;
        lastPosMs = pos;
        break;
      case EventCode.BUFFER_END:
      case EventCode.VISIBILITY_VISIBLE:
        isPlaying = true;
        lastPosMs = pos;
        break;
      default:
        break;
    }
  }

  const seconds = [...new Set([...watchCount.keys(), ...pauses.keys(), ...seekAways.keys()])]
    .filter((s) => s >= 0 && s < videoSeconds)
    .sort((a, b) => a - b);
  const views: number[] = [];
  const replays: number[] = [];
  const pauseArr: number[] = [];
  const seekArr: number[] = [];
  for (const s of seconds) {
    const w = watchCount.get(s) ?? 0;
    views.push(w > 0 ? 1 : 0);
    replays.push(w > 1 ? w - 1 : 0);
    pauseArr.push(pauses.get(s) ?? 0);
    seekArr.push(seekAways.get(s) ?? 0);
  }

  return {
    seconds,
    views,
    replays,
    pauses: pauseArr,
    seekAways: seekArr,
    uniqueSecondsWatched: views.reduce((a, b) => a + b, 0),
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/api && npx vitest run src/modules/video-sessions/aggregates/compute-second-deltas.spec.ts
```

Expected: PASS (7/7). Fix any discrepancies.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/video-sessions/aggregates
git commit -m "feat(api): computeSecondDeltas pure function with tests"
```

### Task 12: Finalize worker

**Files:**
- Create: `apps/api/src/modules/video-sessions/workers/finalize.worker.ts`
- Create: `apps/api/src/modules/video-sessions/workers/finalize.worker.spec.ts`
- Modify: `apps/api/src/modules/video-sessions/video-sessions.module.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinalizeWorker } from './finalize.worker';

function mockPrisma() {
  return {
    raw: {
      videoPlaybackSession: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      landingVisit: {
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
      $executeRaw: vi.fn(),
    },
  };
}

describe('FinalizeWorker', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let worker: FinalizeWorker;

  beforeEach(() => {
    prisma = mockPrisma();
    worker = new FinalizeWorker(prisma as never);
  });

  it('exits early when session already finalized', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({ finalized: true });
    await worker.process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } } as never);
    expect(prisma.raw.videoPlaybackSession.update).not.toHaveBeenCalled();
  });

  it('empty trace marks finalized with zero aggregates, skips secondStats upsert', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      trace: [],
      videoId: 'v1',
      videoDurationMs: 10000,
      endReason: 'INCOMPLETE',
      landingVisitId: 'lv1',
    });
    await worker.process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } } as never);
    expect(prisma.raw.videoPlaybackSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ finalized: true, durationWatchedMs: 0 }),
      }),
    );
    expect(prisma.raw.$executeRaw).not.toHaveBeenCalled();
  });

  it('normal session sets aggregates, upserts VideoSecondStats, updates LandingVisit', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      finalized: false,
      trace: [
        [0, 1, 0],      // PLAY
        [10000, 4, 10000], // ENDED
      ],
      videoId: 'v1',
      videoDurationMs: 10000,
      endReason: 'ENDED',
      landingVisitId: 'lv1',
    });
    await worker.process({ data: { sessionId: 's1', reason: 'CLIENT_FINAL' } } as never);
    expect(prisma.raw.videoPlaybackSession.update).toHaveBeenCalled();
    expect(prisma.raw.$executeRaw).toHaveBeenCalled(); // secondStats upsert
    expect(prisma.raw.landingVisit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lv1' },
        data: expect.objectContaining({
          videoPlayed: true,
          videoWatchTime: 10,
          videoCompleted: true,
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/api && npx vitest run src/modules/video-sessions/workers/finalize.worker.spec.ts
```

- [ ] **Step 3: Implement the worker**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { EventTuple } from '@laptopguru-crm/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeAggregates } from '../aggregates/compute-aggregates';
import { computeSecondDeltas } from '../aggregates/compute-second-deltas';

export interface FinalizeJob {
  sessionId: string;
  reason: 'CLIENT_FINAL' | 'REAPER_TIMEOUT';
}

@Processor('video-session-finalize')
export class FinalizeWorker extends WorkerHost {
  private readonly logger = new Logger(FinalizeWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<FinalizeJob>): Promise<void> {
    const { sessionId } = job.data;

    const session = await this.prisma.raw.videoPlaybackSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        finalized: true,
        trace: true,
        videoId: true,
        videoDurationMs: true,
        endReason: true,
        landingVisitId: true,
      },
    });
    if (!session || session.finalized) return;

    const trace = (session.trace as unknown as EventTuple[]) || [];

    if (trace.length === 0) {
      await this.prisma.raw.videoPlaybackSession.update({
        where: { id: sessionId },
        data: {
          finalized: true,
          durationWatchedMs: 0,
          uniqueSecondsWatched: 0,
          maxPositionMs: 0,
          completionPercent: 0,
          playCount: 0,
          pauseCount: 0,
          seekCount: 0,
          bufferCount: 0,
          bufferTimeMs: 0,
          errorCount: 0,
        },
      });
      return;
    }

    const agg = computeAggregates(trace, session.videoDurationMs);
    const deltas = computeSecondDeltas(trace, session.videoDurationMs);

    await this.prisma.raw.videoPlaybackSession.update({
      where: { id: sessionId },
      data: {
        finalized: true,
        durationWatchedMs: agg.durationWatchedMs,
        uniqueSecondsWatched: deltas.uniqueSecondsWatched,
        maxPositionMs: agg.maxPositionMs,
        completionPercent: agg.completionPercent,
        playCount: agg.playCount,
        pauseCount: agg.pauseCount,
        seekCount: agg.seekCount,
        bufferCount: agg.bufferCount,
        bufferTimeMs: agg.bufferTimeMs,
        errorCount: agg.errorCount,
      },
    });

    if (deltas.seconds.length > 0) {
      // Upsert per-second aggregates using unnest()-based bulk INSERT ON CONFLICT.
      await this.prisma.raw.$executeRaw`
        INSERT INTO "VideoSecondStats" ("videoId", "second", "views", "replays", "pauseCount", "seekAwayCount")
        SELECT ${session.videoId}, sec, v, r, p, sa
        FROM unnest(
          ${deltas.seconds}::int[],
          ${deltas.views}::int[],
          ${deltas.replays}::int[],
          ${deltas.pauses}::int[],
          ${deltas.seekAways}::int[]
        ) AS t(sec, v, r, p, sa)
        ON CONFLICT ("videoId", "second") DO UPDATE
        SET "views"         = "VideoSecondStats"."views"         + EXCLUDED."views",
            "replays"       = "VideoSecondStats"."replays"       + EXCLUDED."replays",
            "pauseCount"    = "VideoSecondStats"."pauseCount"    + EXCLUDED."pauseCount",
            "seekAwayCount" = "VideoSecondStats"."seekAwayCount" + EXCLUDED."seekAwayCount"
      `;
    }

    // Refresh denormalized LandingVisit fields so existing analytics pages keep working.
    await this.prisma.raw.landingVisit.update({
      where: { id: session.landingVisitId },
      data: {
        videoPlayed: agg.playCount > 0,
        videoWatchTime: Math.round(agg.durationWatchedMs / 1000),
        videoCompleted: agg.completionPercent >= 0.95,
        videoBufferCount: agg.bufferCount,
        videoBufferTime: agg.bufferTimeMs,
      },
    });

    this.logger.log(`Finalized session ${sessionId}: ${agg.durationWatchedMs}ms watched`);
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/api && npx vitest run src/modules/video-sessions/workers/finalize.worker.spec.ts
```

- [ ] **Step 5: Register worker in module**

In `video-sessions.module.ts`, add `FinalizeWorker` to `providers`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/video-sessions
git commit -m "feat(api): FinalizeWorker with aggregates and VideoSecondStats upsert"
```

### Task 13: `ReaperCron`

**Files:**
- Create: `apps/api/src/modules/video-sessions/workers/reaper.cron.ts`
- Create: `apps/api/src/modules/video-sessions/workers/reaper.cron.spec.ts`
- Modify: `apps/api/src/modules/video-sessions/video-sessions.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `ScheduleModule.forRoot()` if not already)

- [ ] **Step 1: Install `@nestjs/schedule` if missing**

Check `apps/api/package.json`. If `@nestjs/schedule` is absent:

```bash
npm install --workspace=@laptopguru-crm/api @nestjs/schedule
```

In `apps/api/src/app.module.ts`, add:

```typescript
import { ScheduleModule } from '@nestjs/schedule';
// …
imports: [
  ScheduleModule.forRoot(),
  // …rest
],
```

Note: if `ScheduleModule.forRoot()` is already present, skip the import edit but do not register it twice.

- [ ] **Step 2: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReaperCron } from './reaper.cron';

describe('ReaperCron', () => {
  let prisma: {
    raw: { videoPlaybackSession: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } };
  };
  let queue: { add: ReturnType<typeof vi.fn> };
  let cron: ReaperCron;

  beforeEach(() => {
    prisma = {
      raw: {
        videoPlaybackSession: { findMany: vi.fn(), update: vi.fn() },
      },
    };
    queue = { add: vi.fn() };
    cron = new ReaperCron(prisma as never, queue as never);
  });

  it('picks up stale sessions and enqueues finalize', async () => {
    prisma.raw.videoPlaybackSession.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    await cron.run();
    expect(prisma.raw.videoPlaybackSession.update).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith('finalize', { sessionId: 's1', reason: 'REAPER_TIMEOUT' });
    expect(queue.add).toHaveBeenCalledWith('finalize', { sessionId: 's2', reason: 'REAPER_TIMEOUT' });
  });

  it('noop when no stale sessions', async () => {
    prisma.raw.videoPlaybackSession.findMany.mockResolvedValue([]);
    await cron.run();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

- [ ] **Step 4: Implement `ReaperCron`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ReaperCron {
  private readonly logger = new Logger(ReaperCron.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('video-session-finalize') private readonly queue: Queue,
  ) {}

  @Cron('*/5 * * * *')
  async run() {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    const stale = await this.prisma.raw.videoPlaybackSession.findMany({
      where: { finalized: false, endedAt: null, updatedAt: { lt: cutoff } },
      take: 100,
      select: { id: true },
    });

    for (const { id } of stale) {
      await this.prisma.raw.videoPlaybackSession.update({
        where: { id },
        data: { endedAt: new Date(), endReason: 'INCOMPLETE' },
      });
      await this.queue.add('finalize', { sessionId: id, reason: 'REAPER_TIMEOUT' });
    }

    if (stale.length > 0) this.logger.log(`Reaped ${stale.length} stale sessions`);
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Register in module**

In `video-sessions.module.ts`, add `ReaperCron` to `providers`.

- [ ] **Step 7: Commit**

```bash
git add apps/api apps/api/package.json package.json package-lock.json
git commit -m "feat(api): ReaperCron finalizes orphaned sessions every 5 min"
```

---

## Stage 5 — Read Endpoints

### Task 14: Rewrite `VideoAnalyticsService` against new schema

**Files:**
- Modify: `apps/api/src/modules/videos/video-analytics.service.ts`
- Modify: `apps/api/src/modules/videos/video-analytics.service.spec.ts`
- Modify: `apps/api/src/modules/videos/videos.module.ts` (unchanged imports, but verify still compiles)

- [ ] **Step 1: Rewrite the service**

Replace the file contents with:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { VideoAnalyticsData, SessionEndReason } from '@laptopguru-crm/shared';

@Injectable()
export class VideoAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFullAnalytics(
    videoId: string,
    companyId: string | null,
    from: Date,
    to: Date,
  ): Promise<VideoAnalyticsData> {
    const video = await this.prisma.raw.video.findUnique({
      where: { id: videoId },
      select: { id: true, companyId: true, durationSeconds: true },
    });
    if (!video) throw new NotFoundException();
    if (companyId && video.companyId !== companyId) throw new NotFoundException();

    const durationSeconds = video.durationSeconds ?? 0;

    const [overview, retention, topPause, topSeek, timeSeries, recentSessions, breakdowns] =
      await Promise.all([
        this.getOverview(videoId, from, to),
        this.getRetention(videoId, durationSeconds),
        this.getTopSeconds(videoId, 'pauseCount'),
        this.getTopSeconds(videoId, 'seekAwayCount'),
        this.getTimeSeries(videoId, from, to),
        this.getRecentSessions(videoId, from, to),
        this.getBreakdowns(videoId, from, to),
      ]);

    return {
      overview,
      durationSeconds,
      retention,
      topSeekAwaySeconds: topSeek,
      topPauseSeconds: topPause,
      viewsTimeSeries: timeSeries,
      ...breakdowns,
      recentSessions,
    };
  }

  private async getOverview(videoId: string, from: Date, to: Date) {
    const rows = (await this.prisma.raw.$queryRaw`
      SELECT
        COUNT(*)::int AS "sessionCount",
        COUNT(DISTINCT "landingVisitId")::int AS "uniqueViewers",
        COALESCE(SUM("durationWatchedMs"), 0)::int AS "totalWatchMs",
        COALESCE(AVG("durationWatchedMs"), 0)::float AS "avgWatchMs",
        COALESCE(AVG("completionPercent"), 0)::float AS "avgCompletion",
        COALESCE(SUM("errorCount"), 0)::int AS "errorCount"
      FROM "VideoPlaybackSession"
      WHERE "videoId" = ${videoId}
        AND "finalized" = true
        AND "startedAt" BETWEEN ${from} AND ${to}
    `) as {
      sessionCount: number;
      uniqueViewers: number;
      totalWatchMs: number;
      avgWatchMs: number;
      avgCompletion: number;
      errorCount: number;
    }[];

    const r = rows[0] ?? { sessionCount: 0, uniqueViewers: 0, totalWatchMs: 0, avgWatchMs: 0, avgCompletion: 0, errorCount: 0 };

    const landingVisits = (await this.prisma.raw.$queryRaw`
      SELECT COUNT(*)::int AS c
      FROM "LandingVisit" v
      JOIN "Landing" l ON l.id = v."landingId"
      WHERE l."videoId" = ${videoId} AND v."visitedAt" BETWEEN ${from} AND ${to}
    `) as { c: number }[];
    const visits = landingVisits[0]?.c ?? 0;

    return {
      totalViews: r.sessionCount,
      uniqueViewers: r.uniqueViewers,
      totalWatchTime: Math.round(r.totalWatchMs / 1000),
      avgViewDuration: Math.round(r.avgWatchMs / 1000),
      completionRate: r.avgCompletion,
      playRate: visits > 0 ? r.sessionCount / visits : 0,
      errorCount: r.errorCount,
    };
  }

  private async getRetention(videoId: string, durationSeconds: number) {
    if (durationSeconds === 0) return [];
    const rows = (await this.prisma.raw.$queryRaw`
      SELECT "second", "views", "replays"
      FROM "VideoSecondStats"
      WHERE "videoId" = ${videoId}
      ORDER BY "second"
    `) as { second: number; views: number; replays: number }[];
    const bySecond = new Map(rows.map((r) => [r.second, r]));
    const base = rows[0]?.views ?? 0;
    return Array.from({ length: durationSeconds }, (_, s) => {
      const r = bySecond.get(s);
      return {
        second: s,
        views: r?.views ?? 0,
        replays: r?.replays ?? 0,
        viewersPercent: base > 0 ? (r?.views ?? 0) / base : 0,
      };
    });
  }

  private async getTopSeconds(videoId: string, col: 'pauseCount' | 'seekAwayCount') {
    // Two query variants so we never interpolate a raw identifier — avoids any
    // risk of SQL injection and keeps Prisma's parameterization happy.
    const rows =
      col === 'pauseCount'
        ? ((await this.prisma.raw.$queryRaw`
            SELECT "second", "pauseCount" AS c
            FROM "VideoSecondStats"
            WHERE "videoId" = ${videoId} AND "pauseCount" > 0
            ORDER BY "pauseCount" DESC
            LIMIT 5
          `) as { second: number; c: number }[])
        : ((await this.prisma.raw.$queryRaw`
            SELECT "second", "seekAwayCount" AS c
            FROM "VideoSecondStats"
            WHERE "videoId" = ${videoId} AND "seekAwayCount" > 0
            ORDER BY "seekAwayCount" DESC
            LIMIT 5
          `) as { second: number; c: number }[]);
    return rows.map((r) => ({ second: r.second, count: Number(r.c) }));
  }

  private async getTimeSeries(videoId: string, from: Date, to: Date) {
    const rows = (await this.prisma.raw.$queryRaw`
      SELECT DATE("startedAt") AS date, COUNT(*)::int AS views
      FROM "VideoPlaybackSession"
      WHERE "videoId" = ${videoId}
        AND "finalized" = true
        AND "startedAt" BETWEEN ${from} AND ${to}
      GROUP BY DATE("startedAt")
      ORDER BY date
    `) as { date: Date; views: number }[];
    return rows.map((r) => ({ date: r.date.toISOString().split('T')[0], views: r.views }));
  }

  private async getRecentSessions(videoId: string, from: Date, to: Date) {
    const rows = (await this.prisma.raw.$queryRaw`
      SELECT
        s."id" AS "sessionId",
        s."landingVisitId" AS "visitId",
        s."startedAt",
        s."durationWatchedMs",
        s."completionPercent",
        s."endReason",
        v."country",
        v."deviceType",
        v."browser"
      FROM "VideoPlaybackSession" s
      LEFT JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE s."videoId" = ${videoId}
        AND s."finalized" = true
        AND s."startedAt" BETWEEN ${from} AND ${to}
      ORDER BY s."startedAt" DESC
      LIMIT 50
    `) as {
      sessionId: string;
      visitId: string;
      startedAt: Date;
      durationWatchedMs: number;
      completionPercent: number;
      endReason: SessionEndReason | null;
      country: string | null;
      deviceType: string | null;
      browser: string | null;
    }[];
    return rows.map((r) => ({
      sessionId: r.sessionId,
      visitId: r.visitId,
      startedAt: r.startedAt.toISOString(),
      durationWatchedMs: r.durationWatchedMs,
      completionPercent: r.completionPercent,
      endReason: r.endReason,
      country: r.country,
      device: r.deviceType,
      browser: r.browser,
    }));
  }

  private async getBreakdowns(videoId: string, from: Date, to: Date) {
    // Grouped counts via the same JOIN; each runs as its own SELECT for readability.
    const geoRows = (await this.prisma.raw.$queryRaw`
      SELECT v."country" AS k, COUNT(DISTINCT s.id)::int AS c
      FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE s."videoId" = ${videoId} AND s."finalized" = true
        AND s."startedAt" BETWEEN ${from} AND ${to} AND v."country" IS NOT NULL
      GROUP BY v."country" ORDER BY c DESC LIMIT 15
    `) as { k: string; c: number }[];
    const devRows = (await this.prisma.raw.$queryRaw`
      SELECT v."deviceType" AS k, COUNT(DISTINCT s.id)::int AS c
      FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE s."videoId" = ${videoId} AND s."finalized" = true
        AND s."startedAt" BETWEEN ${from} AND ${to} AND v."deviceType" IS NOT NULL
      GROUP BY v."deviceType" ORDER BY c DESC
    `) as { k: string; c: number }[];
    const browRows = (await this.prisma.raw.$queryRaw`
      SELECT v."browser" AS k, COUNT(DISTINCT s.id)::int AS c
      FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE s."videoId" = ${videoId} AND s."finalized" = true
        AND s."startedAt" BETWEEN ${from} AND ${to} AND v."browser" IS NOT NULL
      GROUP BY v."browser" ORDER BY c DESC LIMIT 15
    `) as { k: string; c: number }[];
    const osRows = (await this.prisma.raw.$queryRaw`
      SELECT v."os" AS k, COUNT(DISTINCT s.id)::int AS c
      FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE s."videoId" = ${videoId} AND s."finalized" = true
        AND s."startedAt" BETWEEN ${from} AND ${to} AND v."os" IS NOT NULL
      GROUP BY v."os" ORDER BY c DESC LIMIT 15
    `) as { k: string; c: number }[];
    const refRows = (await this.prisma.raw.$queryRaw`
      SELECT v."referrerDomain" AS k, COUNT(DISTINCT s.id)::int AS c
      FROM "VideoPlaybackSession" s JOIN "LandingVisit" v ON v.id = s."landingVisitId"
      WHERE s."videoId" = ${videoId} AND s."finalized" = true
        AND s."startedAt" BETWEEN ${from} AND ${to} AND v."referrerDomain" IS NOT NULL
      GROUP BY v."referrerDomain" ORDER BY c DESC LIMIT 15
    `) as { k: string; c: number }[];

    return {
      geography: geoRows.map((r) => ({ country: r.k, views: r.c })),
      devices: devRows.map((r) => ({ deviceType: r.k, views: r.c })),
      browsers: browRows.map((r) => ({ browser: r.k, views: r.c })),
      os: osRows.map((r) => ({ os: r.k, views: r.c })),
      referrers: refRows.map((r) => ({ referrerDomain: r.k, views: r.c })),
    };
  }
}
```

Note: the existing controller `VideoAnalyticsController` (unchanged) calls `analyticsService.getFullAnalytics(id, companyId, fromDate, toDate)` — signature still matches.

- [ ] **Step 2: Rewrite the existing service spec**

The old spec mocks `VideoWatchEvent` queries. Replace with a new spec that verifies the shape and mocks `$queryRaw` for each aggregate. Write at minimum:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoAnalyticsService } from './video-analytics.service';
import { NotFoundException } from '@nestjs/common';

function mockPrisma() {
  return {
    raw: {
      video: { findUnique: vi.fn() },
      $queryRaw: vi.fn(),
    },
  };
}

describe('VideoAnalyticsService (session-trace)', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let service: VideoAnalyticsService;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new VideoAnalyticsService(prisma as never);
  });

  it('throws NotFound when video missing', async () => {
    prisma.raw.video.findUnique.mockResolvedValue(null);
    await expect(
      service.getFullAnalytics('x', 'c1', new Date(), new Date()),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFound when companyId mismatch', async () => {
    prisma.raw.video.findUnique.mockResolvedValue({ id: 'x', companyId: 'other', durationSeconds: 60 });
    await expect(
      service.getFullAnalytics('x', 'c1', new Date(), new Date()),
    ).rejects.toThrow(NotFoundException);
  });

  it('composes aggregates and breakdowns from $queryRaw calls', async () => {
    prisma.raw.video.findUnique.mockResolvedValue({ id: 'v1', companyId: 'c1', durationSeconds: 10 });
    prisma.raw.$queryRaw
      // overview
      .mockResolvedValueOnce([{ sessionCount: 3, uniqueViewers: 2, totalWatchMs: 15000, avgWatchMs: 5000, avgCompletion: 0.5, errorCount: 0 }])
      // landing visits count
      .mockResolvedValueOnce([{ c: 10 }])
      // retention
      .mockResolvedValueOnce([{ second: 0, views: 3, replays: 1 }])
      // topPause
      .mockResolvedValueOnce([{ second: 3, c: 2 }])
      // topSeek
      .mockResolvedValueOnce([{ second: 5, c: 1 }])
      // timeSeries
      .mockResolvedValueOnce([{ date: new Date('2026-04-01'), views: 2 }])
      // recentSessions
      .mockResolvedValueOnce([])
      // geography, devices, browsers, os, referrers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const out = await service.getFullAnalytics('v1', 'c1', new Date(), new Date());
    expect(out.overview.totalViews).toBe(3);
    expect(out.overview.totalWatchTime).toBe(15);
    expect(out.overview.playRate).toBe(0.3);
    expect(out.retention.length).toBe(10); // durationSeconds buckets
    expect(out.topPauseSeconds).toEqual([{ second: 3, count: 2 }]);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && npx vitest run src/modules/videos/video-analytics.service.spec.ts
```

Expected: PASS. Adjust call order in service if the mock order doesn't match.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/videos
git commit -m "feat(api): rewrite VideoAnalyticsService against VideoPlaybackSession and VideoSecondStats"
```

### Task 15: Visit playback endpoint

**Files:**
- Create: `apps/api/src/modules/video-sessions/visit-playback.service.ts`
- Create: `apps/api/src/modules/video-sessions/visit-playback.controller.ts`
- Modify: `apps/api/src/modules/video-sessions/video-sessions.module.ts`

- [ ] **Step 1: Create the service**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeTrace, type EventTuple, type VisitPlaybackData } from '@laptopguru-crm/shared';

@Injectable()
export class VisitPlaybackService {
  constructor(private readonly prisma: PrismaService) {}

  async getForVisit(slug: string, visitId: string, companyId: string | null): Promise<VisitPlaybackData> {
    const visit = await this.prisma.raw.landingVisit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        companyId: true,
        landing: { select: { slug: true, videoId: true } },
        playbackSessions: {
          orderBy: { startedAt: 'asc' },
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            endReason: true,
            videoDurationMs: true,
            durationWatchedMs: true,
            completionPercent: true,
            trace: true,
          },
        },
      },
    });

    if (!visit || visit.landing.slug !== slug) throw new NotFoundException();
    if (companyId && visit.companyId !== companyId) throw new NotFoundException();

    return {
      visitId: visit.id,
      videoId: visit.landing.videoId,
      sessions: visit.playbackSessions.map((s) => ({
        sessionId: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt ? s.endedAt.toISOString() : null,
        endReason: s.endReason ?? null,
        videoDurationMs: s.videoDurationMs,
        durationWatchedMs: s.durationWatchedMs ?? 0,
        completionPercent: s.completionPercent ?? 0,
        events: decodeTrace((s.trace as unknown as EventTuple[]) || []),
      })),
    };
  }
}
```

- [ ] **Step 2: Create the controller**

```typescript
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@laptopguru-crm/shared';
import { VisitPlaybackService } from './visit-playback.service';

@ApiTags('Visit Playback')
@ApiBearerAuth()
@Controller('landings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VisitPlaybackController {
  constructor(
    private readonly service: VisitPlaybackService,
    private readonly cls: ClsService,
  ) {}

  @Get(':slug/visits/:visitId/playback')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  getPlayback(@Param('slug') slug: string, @Param('visitId') visitId: string) {
    const companyId = this.cls.get<string | null>('companyId');
    return this.service.getForVisit(slug, visitId, companyId);
  }
}
```

- [ ] **Step 3: Register both in the module**

In `video-sessions.module.ts`: controllers += `VisitPlaybackController`; providers += `VisitPlaybackService`.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev:api &   # ensure running
# Hit the endpoint (requires JWT + valid slug/visitId — use an existing landing)
```

Expected: 200 with empty `sessions` array if no sessions exist.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/video-sessions
git commit -m "feat(api): visit playback drill-down endpoint"
```

### Task 16: Typed `videoAnalytics` in `packages/api-client`

**Files:**
- Create: `packages/api-client/src/video-analytics.ts`
- Modify: `packages/api-client/src/index.ts`

- [ ] **Step 1: Create the module**

```typescript
import type { VideoAnalyticsData, VisitPlaybackData } from '@laptopguru-crm/shared';
import { customFetch } from './fetcher';

export const videoAnalytics = {
  getAnalytics: (videoId: string, from?: string, to?: string) =>
    customFetch<VideoAnalyticsData>({
      url: `/api/videos/${videoId}/analytics`,
      method: 'GET',
      params: {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
    }),
  getVisitPlayback: (slug: string, visitId: string) =>
    customFetch<VisitPlaybackData>({
      url: `/api/landings/${slug}/visits/${visitId}/playback`,
      method: 'GET',
    }),
};
```

- [ ] **Step 2: Export from index**

```typescript
export { customFetch } from './fetcher';
export { videoAnalytics } from './video-analytics';
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check --workspace=@laptopguru-crm/api-client
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/api-client
git commit -m "feat(api-client): typed video analytics and visit playback calls"
```

---

## Stage 6 — Switchover

### Task 17: Client video tracker

**Files:**
- Create: `apps/web/src/components/landing/video-tracker.ts`

- [ ] **Step 1: Create the tracker file**

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  EventCode,
  type EventTuple,
  type SessionEndReason,
  type AppendChunkRequest,
  type CreateSessionRequest,
  type CreateSessionResponse,
} from '@laptopguru-crm/shared';

interface UseVideoTrackerOpts {
  slug: string;
  visitIdRef: React.MutableRefObject<string | null>;
  visitReady: Promise<string>;
  videoId: string;
  videoSource: 'S3' | 'YOUTUBE';
  videoElement?: HTMLVideoElement | null;
  // YouTube iframe Player API instance — see YouTube adapter below
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ytPlayer?: any;
}

type TrackerState = {
  sessionId: string | null;
  startedAt: number;
  seq: number;
  buffer: EventTuple[];
  pendingCreate: Promise<string | null> | null;
  lastTickPos: number;
  pauseLongTimer: ReturnType<typeof setTimeout> | null;
  flushTimer: ReturnType<typeof setInterval> | null;
  tickTimer: ReturnType<typeof setInterval> | null;
  finalized: boolean;
};

const FLUSH_INTERVAL_MS = 3000;
const TICK_INTERVAL_MS = 250;
const PAUSE_LONG_MS = 60_000;
const MAX_BUFFER = 100;
const MAX_MEM_BUFFER = 500;

function now() {
  return Date.now();
}

async function post(url: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

function beacon(url: string, body: unknown): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    return navigator.sendBeacon(url, blob);
  } catch {
    return false;
  }
}

export function useVideoTracker(opts: UseVideoTrackerOpts) {
  const state = useRef<TrackerState>({
    sessionId: null,
    startedAt: 0,
    seq: 0,
    buffer: [],
    pendingCreate: null,
    lastTickPos: 0,
    pauseLongTimer: null,
    flushTimer: null,
    tickTimer: null,
    finalized: false,
  });

  const getDuration = (): number => {
    if (opts.videoElement) return Math.round((opts.videoElement.duration || 0) * 1000);
    if (opts.ytPlayer && typeof opts.ytPlayer.getDuration === 'function') {
      return Math.round((opts.ytPlayer.getDuration() || 0) * 1000);
    }
    return 0;
  };

  const getCurrentTimeMs = (): number => {
    if (opts.videoElement) return Math.round(opts.videoElement.currentTime * 1000);
    if (opts.ytPlayer && typeof opts.ytPlayer.getCurrentTime === 'function') {
      return Math.round(opts.ytPlayer.getCurrentTime() * 1000);
    }
    return state.current.lastTickPos;
  };

  const relTime = () => (state.current.startedAt ? now() - state.current.startedAt : 0);

  const ensureSession = async (): Promise<string | null> => {
    if (state.current.sessionId) return state.current.sessionId;
    if (state.current.pendingCreate) return state.current.pendingCreate;

    state.current.pendingCreate = (async () => {
      const visitId = opts.visitIdRef.current ?? (await opts.visitReady);
      const body: CreateSessionRequest = {
        slug: opts.slug,
        visitId,
        videoId: opts.videoId,
        videoDurationMs: getDuration(),
        clientStartedAt: new Date(state.current.startedAt || now()).toISOString(),
      };
      try {
        const r = await post('/api/public/video-sessions', body);
        if (!r.ok) return null;
        const data = (await r.json()) as CreateSessionResponse;
        state.current.sessionId = data.sessionId;
        return data.sessionId;
      } catch {
        return null;
      } finally {
        state.current.pendingCreate = null;
      }
    })();
    return state.current.pendingCreate;
  };

  const flush = async (opts2?: { final?: boolean; endReason?: SessionEndReason; useBeacon?: boolean }) => {
    const s = state.current;
    if (s.finalized) return;
    if (s.buffer.length === 0 && !opts2?.final) return;

    const sessionId = s.sessionId || (await ensureSession());
    if (!sessionId) return;

    const events = s.buffer;
    s.buffer = [];
    const body: AppendChunkRequest = {
      seq: s.seq++,
      events,
      final: !!opts2?.final,
      endReason: opts2?.endReason,
    };
    const url = opts2?.useBeacon
      ? `/api/public/video-sessions/${sessionId}/chunks/beacon`
      : `/api/public/video-sessions/${sessionId}/chunks`;

    if (opts2?.useBeacon && beacon(url, body)) return;

    try {
      const r = await post(url, body);
      if (!r.ok && r.status !== 202) {
        // Put events back to retry on next flush, except on 410 (session gone).
        if (r.status !== 410) {
          s.buffer = events.concat(s.buffer);
          if (s.buffer.length > MAX_MEM_BUFFER) {
            // Drop oldest TICKs (never structured events).
            s.buffer = s.buffer.filter((e) => e[1] !== EventCode.TICK).slice(-MAX_MEM_BUFFER);
          }
          s.seq--; // didn't accept
        }
      }
    } catch {
      s.buffer = events.concat(s.buffer);
      s.seq--;
    }

    if (opts2?.final) s.finalized = true;
  };

  const push = (tuple: EventTuple, opts2?: { flush?: boolean }) => {
    state.current.buffer.push(tuple);
    if (opts2?.flush || state.current.buffer.length >= MAX_BUFFER) {
      void flush();
    }
  };

  const onPlay = () => {
    if (state.current.finalized) {
      // New session after prior seal
      state.current.sessionId = null;
      state.current.seq = 0;
      state.current.finalized = false;
    }
    if (!state.current.startedAt) state.current.startedAt = now();
    push([relTime(), EventCode.PLAY, getCurrentTimeMs()]);
    if (state.current.pauseLongTimer) {
      clearTimeout(state.current.pauseLongTimer);
      state.current.pauseLongTimer = null;
    }
    startTimers();
  };

  const onPause = () => {
    push([relTime(), EventCode.PAUSE, getCurrentTimeMs()], { flush: true });
    stopTickTimer();
    state.current.pauseLongTimer = setTimeout(() => {
      void flush({ final: true, endReason: 'PAUSED_LONG' });
    }, PAUSE_LONG_MS);
  };

  const onEnded = () => {
    push([relTime(), EventCode.ENDED, getCurrentTimeMs()], { flush: true });
    void flush({ final: true, endReason: 'ENDED' });
    stopTimers();
  };

  const onSeek = (fromMs: number, toMs: number) => {
    push([relTime(), EventCode.SEEK, toMs, { fromMs }], { flush: true });
  };

  const onBufferStart = () => push([relTime(), EventCode.BUFFER_START, getCurrentTimeMs()]);
  const onBufferEnd = (durationMs: number) =>
    push([relTime(), EventCode.BUFFER_END, getCurrentTimeMs(), { durationMs }]);

  const onRate = (rate: number) => push([relTime(), EventCode.RATE, getCurrentTimeMs(), { playbackRate: rate }]);
  const onVolume = (v: number, muted: boolean) =>
    push([relTime(), EventCode.VOLUME, getCurrentTimeMs(), { volume: v, muted }]);
  const onFullscreen = (on: boolean) =>
    push([relTime(), on ? EventCode.FULLSCREEN_ON : EventCode.FULLSCREEN_OFF, getCurrentTimeMs()]);
  const onError = (message: string) =>
    push([relTime(), EventCode.ERROR, getCurrentTimeMs(), { message: message.slice(0, 500) }], { flush: true });

  const startTimers = () => {
    if (state.current.flushTimer == null) {
      state.current.flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    }
    if (state.current.tickTimer == null) {
      state.current.tickTimer = setInterval(() => {
        const pos = getCurrentTimeMs();
        if (pos !== state.current.lastTickPos) {
          state.current.lastTickPos = pos;
          push([relTime(), EventCode.TICK, pos]);
        }
      }, TICK_INTERVAL_MS);
    }
  };

  const stopTickTimer = () => {
    if (state.current.tickTimer != null) {
      clearInterval(state.current.tickTimer);
      state.current.tickTimer = null;
    }
  };

  const stopTimers = () => {
    stopTickTimer();
    if (state.current.flushTimer != null) {
      clearInterval(state.current.flushTimer);
      state.current.flushTimer = null;
    }
  };

  useEffect(() => {
    const onVis = () => {
      const pos = getCurrentTimeMs();
      if (document.visibilityState === 'hidden') {
        push([relTime(), EventCode.VISIBILITY_HIDDEN, pos]);
        void flush({ useBeacon: true });
      } else {
        push([relTime(), EventCode.VISIBILITY_VISIBLE, pos]);
      }
    };
    const onPageHide = (e: PageTransitionEvent) => {
      void flush({ useBeacon: true, final: !e.persisted, endReason: !e.persisted ? 'CLOSED' : undefined });
    };
    const onFreeze = () => void flush({ useBeacon: true });
    const onBeforeUnload = () => void flush({ useBeacon: true, final: true, endReason: 'CLOSED' });

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('freeze', onFreeze);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('freeze', onFreeze);
      window.removeEventListener('beforeunload', onBeforeUnload);
      stopTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    onPlay,
    onPause,
    onEnded,
    onSeek,
    onBufferStart,
    onBufferEnd,
    onRate,
    onVolume,
    onFullscreen,
    onError,
  };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check --workspace=@laptopguru-crm/web
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/video-tracker.ts
git commit -m "feat(web): add useVideoTracker hook with ring buffer and beacon flush"
```

### Task 18: Wire tracker into `landing-client.tsx`

**Files:**
- Modify: `apps/web/src/app/l/[slug]/landing-client.tsx`

This file is large (1893 lines). The changes are surgical: replace the old video buffer + POSTs with the hook.

- [ ] **Step 1: Remove legacy video-event buffer code**

In `apps/web/src/app/l/[slug]/landing-client.tsx`:

- Delete the `videoEventsBuffer` ref definition (around line 342–351)
- Delete the `lastHeartbeatRef`, `lastSentHeartbeatPos`, and `bufferStartRef`, `bufferCountRef`, `bufferTotalMsRef` refs (they become obsolete — the tracker owns this state)
- Delete `postVideoEvents`, `flushVideoEvents`, `sendVideoEventNow` callbacks (around lines 369–460)
- In the YouTube `onMessage` handler (around line 1106+), remove per-event POSTs; keep the refs that drive `sendUpdate` (`videoPlayedRef`, `videoWatchStartRef`, `videoWatchAccumRef`, `videoCompletedRef`) only if the engagement PATCH at unload still relies on them

- [ ] **Step 2: Import and instantiate the tracker**

Near the top of the file with other imports, add:

```typescript
import { useVideoTracker } from '@/components/landing/video-tracker';
```

Inside `LandingClient`, capture the `<video>` element ref to pass to the tracker. Since `VideoPlayer` owns the `<video>`, add an optional `onVideoElement` callback to it:

  - In `apps/web/src/components/landing/video-player.tsx`:
    - Add to `Props`: `onVideoElement?: (el: HTMLVideoElement | null) => void;`
    - In `PlayerInstance`, add a `useEffect(() => { onVideoElement?.(videoRef.current); }, [onVideoElement])` after `videoRef` is declared.
  - In `landing-client.tsx`, create a ref `const videoElRef = useRef<HTMLVideoElement | null>(null);` and pass `onVideoElement={(el) => { videoElRef.current = el; }}` to `<VideoPlayer>`.

- [ ] **Step 3: Hook up event handlers**

Just before the `<VideoPlayer>` render (S3 path), call:

```typescript
const tracker = useVideoTracker({
  slug: landing.slug,
  visitIdRef,
  visitReady: visitIdPromise.current!.promise,
  videoId: video.id,
  videoSource: video.source as 'S3' | 'YOUTUBE',
  videoElement: videoElRef.current,
});
```

Replace the existing `onPlay`, `onPause`, `onEnded`, `onSeeked`, `onBufferStart`, `onBufferEnd` callbacks on `<VideoPlayer>` with:

```typescript
onPlay={() => {
  videoPlayedRef.current = true;
  setIsVideoPlaying(true);
  if (!videoWatchStartRef.current) videoWatchStartRef.current = Date.now();
  if (firstPlayTimeRef.current == null) {
    firstPlayTimeRef.current = Date.now() - (startTimeRef.current ?? Date.now());
  }
  tracker.onPlay();
  sendUpdate({ videoPlayed: true });
}}
onPause={() => {
  setIsVideoPlaying(false);
  if (videoWatchStartRef.current) {
    videoWatchAccumRef.current += Math.round((Date.now() - videoWatchStartRef.current) / 1000);
    videoWatchStartRef.current = null;
  }
  tracker.onPause();
}}
onEnded={() => {
  videoCompletedRef.current = true;
  setIsVideoPlaying(false);
  if (videoWatchStartRef.current) {
    videoWatchAccumRef.current += Math.round((Date.now() - videoWatchStartRef.current) / 1000);
    videoWatchStartRef.current = null;
  }
  tracker.onEnded();
}}
onTimeUpdate={() => {
  // Tracker owns TICK generation on its own timer — nothing to do here.
}}
onSeeked={(seekFrom, seekTo) => {
  tracker.onSeek(Math.round(seekFrom * 1000), Math.round(seekTo * 1000));
}}
onBufferStart={() => tracker.onBufferStart()}
onBufferEnd={() => tracker.onBufferEnd(0)}
```

- [ ] **Step 4: YouTube path — pass `ytPlayer` to the tracker**

In the YouTube branch (around line 1106), the existing code uses postMessage against `yt-player` iframe. Replace the `PLAYING` / `PAUSED` / `ENDED` / `BUFFERING` branches with calls to a second tracker instance constructed with `ytPlayer` (or convert the existing iframe usage to the real YouTube iframe API via `<script src="https://www.youtube.com/iframe_api"></script>` and `new YT.Player('yt-player', ...)`). Minimum working version:

Reuse the existing `postMessage` approach but swap `sendVideoEventNow` for the tracker. Map events:

- `"PLAYING"` → `tracker.onPlay()`
- `"PAUSED"` → `tracker.onPause()`
- `"ENDED"` → `tracker.onEnded()`
- `"BUFFERING"` → `tracker.onBufferStart()` (there is no explicit end event in the message-based API; the tracker's `flushDelta` tolerates this because the next TICK after playback resumes will re-anchor the position)

Position polling: keep the existing `onTimeUpdate` cadence if any, or rely on the tracker's 250ms TICK timer (`videoElement` is undefined here — the tracker will fall back to `state.lastTickPos`). For full accuracy, switch to the YouTube iframe API and pass `ytPlayer` to `useVideoTracker`. If that's scope creep for this task, accept the reduced precision on YouTube and file a follow-up.

- [ ] **Step 5: Leave `sendUpdate` pointing at the Next.js route for now**

`sendUpdate` currently PATCHes `/api/landings/:slug/track` (the Next.js route handler under `apps/web/src/app/api/landings/[slug]/track/route.ts`). The spec §7.8 proposes moving this to `apps/api`, but that requires path-scoped CORS for the landing host and is **out of scope for this plan** — treat it as a follow-up. Keep the existing `fetch('/api/landings/${landing.slug}/track', ...)` call unchanged. The route file also stays (Task 19 only deletes the video-events routes).

- [ ] **Step 6: Type-check and build**

```bash
npm run type-check --workspace=@laptopguru-crm/web
npm run build --workspace=@laptopguru-crm/web
```

Expected: passes. Fix typing issues.

- [ ] **Step 7: Manual browser test (desktop Chrome)**

1. Start stack: `npm run dev`
2. Open a known landing URL (`/l/<slug>`).
3. Open DevTools → Network panel. Filter `video-sessions`.
4. Play the video for ~10s, pause, seek, close the tab.

Expected traffic:
- 1x `POST /api/public/video-sessions` → 200 with `{ sessionId }`
- several `POST .../chunks` → 202
- 1x beacon `POST .../chunks/beacon` on close

Verify in DB:

```sql
SELECT id, "chunksReceived", "finalized", "endReason", "durationWatchedMs"
FROM "VideoPlaybackSession" ORDER BY "startedAt" DESC LIMIT 5;
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/l/[slug]/landing-client.tsx apps/web/src/components/landing/video-player.tsx
git commit -m "feat(web): replace legacy video event buffer with useVideoTracker hook"
```

### Task 19: Delete legacy routes and add Microsoft Clarity

**Files:**
- Delete: `apps/web/src/app/api/landings/[slug]/video-events/route.ts`
- Delete: `apps/web/src/app/api/landings/[slug]/visits/[visitId]/video-events/route.ts`
- Modify: `apps/web/src/app/l/[slug]/layout.tsx`

- [ ] **Step 1: Create a safety git tag**

```bash
git tag pre-video-analytics-switchover
```

- [ ] **Step 2: Delete the two legacy web routes**

```bash
git rm apps/web/src/app/api/landings/[slug]/video-events/route.ts
git rm apps/web/src/app/api/landings/[slug]/visits/[visitId]/video-events/route.ts
```

- [ ] **Step 3: Verify no callers remain**

```bash
grep -R "video-events" apps/web/src apps/api/src packages || true
```

Expected: no results. If any remain, adjust them (they should already be removed in Task 18 / stage 7).

- [ ] **Step 4: Add Microsoft Clarity to the landing layout**

In `apps/web/src/app/l/[slug]/layout.tsx`, inside the `<body>` or a `<head>` block (follow existing Next.js 16 patterns — `<Script>` from `next/script` with `strategy="afterInteractive"` is idiomatic):

```typescript
import Script from 'next/script';

// inside the return:
{process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID && (
  <Script
    id="ms-clarity"
    strategy="afterInteractive"
    dangerouslySetInnerHTML={{
      __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID}");`,
    }}
  />
)}
```

If `layout.tsx` does not exist under `apps/web/src/app/l/[slug]/`, inject the Script in the nearest parent layout (`apps/web/src/app/l/layout.tsx` or create one).

- [ ] **Step 5: Document env var**

Add to `.env.example` (create if missing):

```
NEXT_PUBLIC_CLARITY_PROJECT_ID=
```

- [ ] **Step 6: Type-check and build**

```bash
npm run type-check && npm run build
```

Expected: passes.

- [ ] **Step 7: Manual end-to-end checks (required before merge)**

Run the manual E2E cases from spec section 12.3 — at minimum the desktop Chrome play → pause → seek → close path and the iOS Safari background → foreground path. Record results as PR notes.

- [ ] **Step 8: Commit**

```bash
git add -u
git add apps/web/src/app/l/[slug]/layout.tsx .env.example 2>/dev/null || true
git commit -m "feat(web): remove legacy video-events routes, add Microsoft Clarity opt-in"
```

---

## Stage 7 — UI

### Task 20: Per-video analytics dashboard page

**Files:**
- Create: `apps/web/src/app/(dashboard)/videos/[id]/analytics/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { notFound } from 'next/navigation';
import { videoAnalytics } from '@laptopguru-crm/api-client';
import type { VideoAnalyticsData } from '@laptopguru-crm/shared';

export default async function VideoAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let data: VideoAnalyticsData;
  try {
    data = await videoAnalytics.getAnalytics(id);
  } catch {
    notFound();
  }

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Video analytics</h1>
        <p className="text-sm text-muted-foreground">Duration: {data.durationSeconds}s</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Sessions" value={data.overview.totalViews} />
        <Kpi label="Unique viewers" value={data.overview.uniqueViewers} />
        <Kpi label="Avg watch (s)" value={data.overview.avgViewDuration} />
        <Kpi label="Completion" value={`${Math.round(data.overview.completionRate * 100)}%`} />
        <Kpi label="Play rate" value={`${Math.round(data.overview.playRate * 100)}%`} />
        <Kpi label="Total watch (s)" value={data.overview.totalWatchTime} />
        <Kpi label="Errors" value={data.overview.errorCount} />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Retention</h2>
        <RetentionChart
          retention={data.retention}
          pauses={data.topPauseSeconds}
          seeks={data.topSeekAwaySeconds}
        />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Recent sessions</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th>When</th>
              <th>Watched</th>
              <th>Completion</th>
              <th>End</th>
              <th>Device</th>
            </tr>
          </thead>
          <tbody>
            {data.recentSessions.map((s) => (
              <tr key={s.sessionId} className="border-b">
                <td>{new Date(s.startedAt).toLocaleString()}</td>
                <td>{Math.round(s.durationWatchedMs / 1000)}s</td>
                <td>{Math.round(s.completionPercent * 100)}%</td>
                <td>{s.endReason ?? '—'}</td>
                <td>{s.device ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/40">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function RetentionChart({
  retention,
  pauses,
  seeks,
}: {
  retention: VideoAnalyticsData['retention'];
  pauses: VideoAnalyticsData['topPauseSeconds'];
  seeks: VideoAnalyticsData['topSeekAwaySeconds'];
}) {
  if (retention.length === 0) return <div className="text-sm text-muted-foreground">No data yet.</div>;
  const max = Math.max(1, ...retention.map((r) => r.views));
  const w = 800, h = 180;
  const stepX = w / retention.length;
  const path = retention.map((r, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${(h - (r.views / max) * h).toFixed(1)}`).join(' ');
  const pauseSet = new Set(pauses.map((p) => p.second));
  const seekSet = new Set(seeks.map((s) => s.second));
  return (
    <svg width={w} height={h} className="bg-muted/20 rounded">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />
      {retention.map((r, i) => {
        const x = i * stepX;
        return (
          <g key={r.second}>
            {pauseSet.has(r.second) && <circle cx={x} cy={h - (r.views / max) * h} r={3} fill="#fb7830" />}
            {seekSet.has(r.second) && <rect x={x - 1} y={0} width={2} height={h} fill="#ef4444" opacity={0.3} />}
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check --workspace=@laptopguru-crm/web
```

Expected: passes. (The page-level auth is handled by the `(dashboard)` layout; confirm the existing layout redirects unauthed users, otherwise add the `useAuth` / `authorize` pattern used by sibling pages.)

- [ ] **Step 3: Manual smoke test**

Load `/videos/<id>/analytics` in the browser while logged in. Expected: page renders with empty/zero data until real sessions exist.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/videos
git commit -m "feat(web): per-video analytics dashboard page"
```

### Task 21: Drill-down with `SessionTimeline`

**Files:**
- Create: `apps/web/src/app/(dashboard)/analytics/[slug]/[visitId]/page.tsx`
- Create: `apps/web/src/app/(dashboard)/analytics/[slug]/[visitId]/session-timeline.tsx`

- [ ] **Step 1: Create the drill-down page**

```typescript
import { notFound } from 'next/navigation';
import { videoAnalytics } from '@laptopguru-crm/api-client';
import { SessionTimeline } from './session-timeline';

export default async function VisitDrilldown({
  params,
}: {
  params: Promise<{ slug: string; visitId: string }>;
}) {
  const { slug, visitId } = await params;
  try {
    const data = await videoAnalytics.getVisitPlayback(slug, visitId);
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Visit playback</h1>
        {data.sessions.length === 0 && <p className="text-sm text-muted-foreground">No playback sessions.</p>}
        {data.sessions.map((s) => (
          <SessionTimeline key={s.sessionId} session={s} />
        ))}
      </div>
    );
  } catch {
    notFound();
  }
}
```

- [ ] **Step 2: Create the timeline component**

```typescript
'use client';

import { EventCode, type VisitPlaybackSession } from '@laptopguru-crm/shared';

export function SessionTimeline({ session }: { session: VisitPlaybackSession }) {
  const videoSeconds = Math.max(1, Math.floor(session.videoDurationMs / 1000));
  const wallMs =
    session.endedAt ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime() : session.videoDurationMs;
  const wallSeconds = Math.max(1, Math.floor(wallMs / 1000));

  // Per-second play counts in this session
  const videoPlayCount = new Array(videoSeconds).fill(0);
  let isPlaying = false;
  let lastPos = 0;
  for (const ev of session.events) {
    switch (ev.type) {
      case EventCode.PLAY:
        isPlaying = true; lastPos = ev.posMs; break;
      case EventCode.PAUSE:
      case EventCode.ENDED:
      case EventCode.BUFFER_START:
      case EventCode.VISIBILITY_HIDDEN:
        if (isPlaying && ev.posMs > lastPos) markRange(videoPlayCount, lastPos, ev.posMs);
        isPlaying = false; lastPos = ev.posMs; break;
      case EventCode.TICK:
        if (isPlaying && ev.posMs > lastPos) markRange(videoPlayCount, lastPos, ev.posMs);
        lastPos = ev.posMs; break;
      case EventCode.SEEK:
        lastPos = ev.posMs; break;
      case EventCode.BUFFER_END:
      case EventCode.VISIBILITY_VISIBLE:
        isPlaying = true; lastPos = ev.posMs; break;
    }
  }

  // Real-time state per wall-clock second: 'play' | 'pause' | 'buffer' | 'hidden'
  type WallState = 'play' | 'pause' | 'buffer' | 'hidden';
  const wallTrack = new Array<WallState>(wallSeconds).fill('pause');
  let cur: WallState = 'pause';
  let lastT = 0;
  for (const ev of session.events) {
    const t = Math.floor(ev.tMs / 1000);
    for (let i = lastT; i < Math.min(wallSeconds, t); i++) wallTrack[i] = cur;
    switch (ev.type) {
      case EventCode.PLAY: cur = 'play'; break;
      case EventCode.PAUSE:
      case EventCode.ENDED: cur = 'pause'; break;
      case EventCode.BUFFER_START: cur = 'buffer'; break;
      case EventCode.BUFFER_END: cur = 'play'; break;
      case EventCode.VISIBILITY_HIDDEN: cur = 'hidden'; break;
      case EventCode.VISIBILITY_VISIBLE: cur = 'play'; break;
    }
    lastT = t;
  }
  for (let i = lastT; i < wallSeconds; i++) wallTrack[i] = cur;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex justify-between text-sm">
        <span>{new Date(session.startedAt).toLocaleString()}</span>
        <span>{Math.round(session.durationWatchedMs / 1000)}s watched / {Math.round(session.completionPercent * 100)}%</span>
      </div>
      <Track title="Video position" cells={videoPlayCount.map((c) => ({ color: c === 0 ? '#e5e7eb' : c === 1 ? '#60a5fa' : '#1d4ed8' }))} />
      <Track title="Wall clock" cells={wallTrack.map((s) => ({ color: wallStateColor(s) }))} />
      <details className="text-xs">
        <summary className="cursor-pointer">Events ({session.events.length})</summary>
        <ul className="mt-2 font-mono">
          {session.events.slice(0, 200).map((e, i) => (
            <li key={i}>
              +{(e.tMs / 1000).toFixed(2)}s · {EventCode[e.type]} · pos {(e.posMs / 1000).toFixed(2)}s
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function markRange(arr: number[], fromMs: number, toMs: number) {
  const f = Math.max(0, Math.floor(fromMs / 1000));
  const t = Math.min(arr.length - 1, Math.floor((toMs - 1) / 1000));
  for (let i = f; i <= t; i++) arr[i]++;
}

function wallStateColor(s: 'play' | 'pause' | 'buffer' | 'hidden') {
  switch (s) {
    case 'play': return '#1f2937';
    case 'pause': return '#d1d5db';
    case 'buffer': return '#ef4444';
    case 'hidden': return '#9ca3af';
  }
}

function Track({ title, cells }: { title: string; cells: { color: string }[] }) {
  return (
    <div>
      <div className="text-xs mb-1">{title}</div>
      <div className="flex h-4 w-full gap-[1px]">
        {cells.map((c, i) => (
          <div key={i} style={{ background: c.color, flex: 1 }} title={`s ${i}`} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + smoke**

```bash
npm run type-check --workspace=@laptopguru-crm/web
```

Load a real visit URL in the browser. Expected: shows one strip per session with the two tracks and a collapsible event list.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/analytics
git commit -m "feat(web): drill-down SessionTimeline with video and wall-clock tracks"
```

---

## Stage 8 — Destructive Cleanup (ship 1–2 days after stage 7)

### Task 22: Drop `VideoWatchEvent` and `VideoEventType`

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `apps/api/src/modules/videos/videos.module.ts`
- Delete: `apps/api/src/modules/videos/analytics-cleanup.processor.ts`
- Modify: any file that still references `VideoWatchEvent` or `VideoEventType`

- [ ] **Step 1: Confirm no code reads VideoWatchEvent anymore**

```bash
grep -R "VideoWatchEvent\|VideoEventType\|videoWatchEvents\|watchEvents\|analytics-cleanup" apps/api/src apps/web/src packages | tee /tmp/legacy-refs.txt
```

Expected references to remove:
- `apps/api/src/modules/videos/analytics-cleanup.processor.ts` (delete the file)
- `apps/api/src/modules/videos/videos.module.ts` (drop the `analytics-cleanup` queue registration, drop `AnalyticsCleanupProcessor` from providers, drop the `repeat: { pattern: '0 3 * * *' }` scheduler call in `onModuleInit`)
- `prisma/schema.prisma` — remove `model VideoWatchEvent`, `enum VideoEventType`, the `watchEvents` relations on `LandingVisit`, `Video`, and the `videoWatchEvents` relation on `Company`

- [ ] **Step 2: Edit schema**

In `prisma/schema.prisma`:
- Delete the `VideoEventType` enum (lines ~155–167)
- Delete the `VideoWatchEvent` model (lines ~239–269)
- In `Company`, delete `videoWatchEvents VideoWatchEvent[]`
- In `Video`, delete `watchEvents VideoWatchEvent[]`
- In `LandingVisit`, delete `watchEvents VideoWatchEvent[]`

- [ ] **Step 3: Generate migration**

```bash
npm run db:migrate -- --name drop_video_watch_event
```

Expected: migration drops the `VideoWatchEvent` table and `VideoEventType` enum.

- [ ] **Step 4: Regenerate Prisma clients**

```bash
npm run db:generate
```

- [ ] **Step 5: Delete `analytics-cleanup.processor.ts` and update module**

```bash
git rm apps/api/src/modules/videos/analytics-cleanup.processor.ts
```

In `apps/api/src/modules/videos/videos.module.ts`:
- Remove `import { AnalyticsCleanupProcessor } ...`
- Remove `{ name: 'analytics-cleanup' }` from `BullModule.registerQueue(...)`
- Remove `AnalyticsCleanupProcessor` from `providers`
- Remove the `@InjectQueue('analytics-cleanup')` injection and the `analyticsCleanupQueue.add(...)` block in `onModuleInit`

- [ ] **Step 6: Type-check and build**

```bash
npm run type-check && npm run build
```

Expected: passes. Fix any residual references.

- [ ] **Step 7: Run api tests**

```bash
npm test --workspace=@laptopguru-crm/api
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add -u
git commit -m "chore: drop VideoWatchEvent model and legacy analytics-cleanup worker"
```

---

## Rollback Anchors

- `pre-video-analytics-switchover` — git tag created in Task 19. Use as a last-resort hard reset anchor if stage 6 goes wrong in prod.
- Stages 1–5: `git revert` per-commit is safe.
- Stage 6: prefer forward-fix; revert would reintroduce legacy routes while the tracker and new endpoints remain.
- Stage 8: irreversible (drops a table). Only ship after stage 6–7 are confirmed stable in prod for 24+ hours.

---

## Post-rollout Monitoring Checklist (spec §12.4)

- API logs: 400/410/429 rate on `/api/public/video-sessions/*` — no spikes.
- BullMQ `video-session-finalize`: processing time < 1s; queue depth stable.
- DB: `VideoPlaybackSession` row count and avg trace size 1–20 KB.
- INCOMPLETE vs CLOSED ratio: expected 5–15% incomplete.
- Top-of-funnel sanity: `retention[0].views` ≈ `overview.totalViews`. A large gap means `computeSecondDeltas` is miscounting the first second.
