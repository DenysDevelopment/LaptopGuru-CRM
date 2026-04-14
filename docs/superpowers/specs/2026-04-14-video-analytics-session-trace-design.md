# Video Analytics Redesign — Session Trace

**Date:** 2026-04-14
**Status:** Approved (awaiting implementation plan)
**Scope:** Full rebuild of video analytics collection for LaptopGuru CRM

---

## 1. Problem

The current video analytics system (`VideoWatchEvent`) has five confirmed pain points:

1. **Precision** — heartbeats at 1s granularity lose sub-second interactions.
2. **Unload reliability** — events lost when viewers close tabs, especially iOS Safari.
3. **Segment replays** — impossible to tell which seconds were watched once, rewatched, or skipped.
4. **Drill-down depth** — per-visit detail is shallow; no second-by-second timeline.
5. **Trust** — duplicates and silent drops undermine confidence in reported numbers.

Existing code also splits backend logic between Next.js route handlers in `apps/web` and NestJS modules in `apps/api`. This redesign consolidates backend in `apps/api`.

## 2. Goals

- Millisecond-grade per-session timeline for every playback event.
- Reliable capture through backgrounding, tab close, and iOS Safari edge cases.
- Per-second aggregates that answer "how many people watched this moment, how many replayed it, how many skipped past it."
- Rich drill-down: render a playback session as a timeline a sales manager can understand.
- Deduplication guaranteed by schema, not by convention.
- Backend consolidated entirely in `apps/api` (NestJS + BullMQ). `apps/web` does tracking and rendering only.
- Microsoft Clarity for general page-behavior session replay (complementary, separate system).

## 3. Non-goals

- Full page session replay (mouse, scroll, clicks outside the player) — delegated to Microsoft Clarity.
- Real-time "live view" of currently-watching visitors — deferred as a later feature.
- Historical migration of existing `VideoWatchEvent` data — dropped (negligible data volume).
- S3 cold storage of old traces — deferred until volume justifies it.

## 4. High-level Architecture

Three layers. Backend is entirely in `apps/api`.

```
Browser (apps/web)
  └── video-tracker.ts (ring buffer, chunked POST, sendBeacon on unload)
         │
         ▼ POST /public/video-sessions/:id/chunks (via Caddy in prod, CORS in dev)
         │
apps/api (NestJS)
  ├── VideoSessionsController  (public ingestion endpoints)
  │     └── append chunks to VideoPlaybackSession.trace (JSONB concat)
  │           └── enqueue BullMQ: video-session-finalize
  ├── FinalizeWorker (BullMQ)
  │     └── compute aggregates, upsert VideoSecondStats
  ├── ReaperCron (every 5 min)
  │     └── finalize orphaned sessions
  └── VideoAnalyticsController (authed, read-side)
         ▲
apps/web dashboard
  ├── /videos/[id]/analytics       (aggregates from VideoSecondStats)
  └── /analytics/[slug]/visits/[visitId]  (drill-down from trace)
```

Microsoft Clarity is enabled via one `<script>` in `apps/web/src/app/l/[slug]/layout.tsx`, gated by `NEXT_PUBLIC_CLARITY_PROJECT_ID`. It writes to Microsoft's servers and does not touch our DB.

## 5. Data Model

### 5.1 `VideoPlaybackSession`

One row per "entry into the player". Holds the full event trace plus precomputed aggregates.

```prisma
model VideoPlaybackSession {
  id               String   @id @default(cuid())
  landingVisitId   String
  videoId          String
  companyId        String   // denormalized for fast tenant filters

  startedAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  endedAt          DateTime?
  endReason        VideoSessionEndReason?
  finalized        Boolean  @default(false)

  videoDurationMs  Int                   // snapshot of video length at session start

  trace            Json     @default("[]")  // append-only array of event tuples
  chunksReceived   Int      @default(0)

  // Aggregates (populated by finalize worker)
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

enum VideoSessionEndReason {
  ENDED
  PAUSED_LONG
  CLOSED
  NAVIGATED
  ERROR
  INCOMPLETE
}
```

### 5.2 `VideoSessionChunk`

Pure dedup guard. Holds `(sessionId, seq)` for every chunk the server has accepted. Composite primary key gives us dedup at the storage layer.

```prisma
model VideoSessionChunk {
  sessionId  String
  seq        Int
  receivedAt DateTime @default(now())

  @@id([sessionId, seq])
}
```

Chunk payloads are **not** stored here — they are appended directly to `VideoPlaybackSession.trace`.

### 5.3 `VideoSecondStats`

Denormalized per-second aggregation. Main read target for the video dashboard.

```prisma
model VideoSecondStats {
  videoId       String
  second        Int      // 0-based second of video
  views         Int      @default(0)  // sessions that watched this second at least once
  replays       Int      @default(0)  // total replays of this second across sessions
  pauseCount    Int      @default(0)
  seekAwayCount Int      @default(0)

  video  Video @relation(fields: [videoId], references: [id], onDelete: Cascade)

  @@id([videoId, second])
  @@index([videoId])
}
```

Size: 300 rows per 5-minute video. Thousands of videos → still well below 1M rows.

### 5.4 Trace format

JSONB array of fixed-shape tuples:

```
[[tMs, typeCode, posMs, extra?], ...]
```

- `tMs` — client ms since session `startedAt` (relative, saves bytes).
- `typeCode` — integer from `EventCode` enum in `packages/shared`.
- `posMs` — position in the video in ms.
- `extra` — optional, type-dependent (see below).

```typescript
enum EventCode {
  TICK = 0,               // dense position sample, every 250ms
  PLAY = 1,
  PAUSE = 2,
  SEEK = 3,               // extra: fromMs
  ENDED = 4,
  RATE = 5,               // extra: playbackRate
  VOLUME = 6,             // extra: { volume: number, muted: boolean }
  FULLSCREEN_ON = 7,
  FULLSCREEN_OFF = 8,
  BUFFER_START = 9,
  BUFFER_END = 10,        // extra: durationMs
  QUALITY = 11,           // extra: label
  ERROR = 12,             // extra: message (truncated to 500 chars)
  VISIBILITY_HIDDEN = 13,
  VISIBILITY_VISIBLE = 14,
}
```

Tuples chosen over objects for ~40% size reduction. A 3-minute session ≈ 18 KB raw JSON; far smaller in practice with Postgres's internal JSONB representation.

### 5.5 Changes to `LandingVisit`

Existing denormalized fields — `videoPlayed`, `videoWatchTime`, `videoCompleted`, `videoBufferCount`, `videoBufferTime` — stay. The finalize worker updates them after each session completes. Old visits retain their previously-computed values (dropped `VideoWatchEvent` cannot be recomputed, and that's acceptable).

### 5.6 Dropped models

- `VideoWatchEvent` — dropped in a dedicated cleanup migration, 1-2 days after the switchover.
- `VideoEventType` enum — dropped with it.

## 6. Client Tracker (`apps/web`)

File: `apps/web/src/components/landing/video-tracker.ts`. Exposed as a hook `useVideoTracker({ slug, visitId, videoId, videoElement | ytPlayer })`.

### 6.1 Session lifecycle

A session starts on the first PLAY and ends on one of:

- `ENDED` — video finished.
- `PAUSED_LONG` — pause lasted 60 seconds.
- `CLOSED` — tab closed / `pagehide`.
- `NAVIGATED` — SPA navigation away from the video.
- `ERROR` — player crash.

**Backgrounding is not the end of a session.** `VISIBILITY_HIDDEN` and `VISIBILITY_VISIBLE` are recorded as events; the session continues across iOS Safari background → foreground transitions. If a viewer paused and came back after more than 60 seconds, the old session is sealed and a new session starts on the next play.

### 6.2 Internal state

```typescript
class VideoTracker {
  sessionId: string | null
  startedAtClient: number
  buffer: EventTuple[]
  seq: number
  lastTickPos: number
  flushTimer: number | null       // 3s debounce
  tickTimer: number | null        // 250ms tick
  pauseLongTimer: number | null   // 60s pause → close
  inFlightChunk: Promise<void> | null
}
```

### 6.3 Session creation (lazy)

On the first PLAY:

1. `POST /public/video-sessions { slug, visitId, videoId, videoDurationMs, clientStartedAt }`
2. Server returns `sessionId`. Server is idempotent on `(landingVisitId, videoId, startedAt=clientStartedAt)` so retries are safe.
3. Events accumulated between the request and the response are flushed as soon as `sessionId` arrives.

No session is created if the viewer never presses play. The DB stays clean.

### 6.4 Buffering rules

- **TICK** — pushed every 250 ms while `!paused`, only when `currentTime` has moved.
- **Structured events** (PLAY, PAUSE, SEEK, ENDED, RATE, VOLUME, FULLSCREEN_*, BUFFER_*, QUALITY, ERROR) — pushed immediately as they fire.
- **Visibility events** — pushed on `visibilitychange`.

### 6.5 Flush rules

- **Timer flush** — every 3 seconds.
- **Size flush** — buffer > 100 events, immediate flush.
- **State flush** — PAUSE / ENDED / ERROR → immediate flush (critical events travel fast).
- **Unload flush** — `visibilitychange:hidden` / `pagehide` / `freeze` / `beforeunload` → final flush via `sendBeacon`.

### 6.6 Normal flush path

```
POST /public/video-sessions/:sessionId/chunks
Content-Type: application/json
Body: { seq, events: [...], final: false }
```

- Success → `seq++`, buffer cleared.
- Network error → buffer retained, `seq` unchanged, retried on next flush.
- HTTP 202 on dedup conflict is equivalent to success — `seq++`, buffer cleared.

### 6.7 Unload flush path

```typescript
const blob = new Blob(
  [JSON.stringify({ seq, events, final: true })],
  { type: 'application/json' }
);
navigator.sendBeacon('/public/video-sessions/:sessionId/chunks/beacon', blob);
```

`sendBeacon` is fire-and-forget. The server idempotency guarantee via `VideoSessionChunk.(sessionId, seq)` makes it safe to also send a regular fetch as a backup on the same event.

### 6.8 Unload handlers (layered defense)

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    buffer.push([relTime(), EventCode.VISIBILITY_HIDDEN, curPos]);
    flushViaBeacon({ final: false });
  } else {
    buffer.push([relTime(), EventCode.VISIBILITY_VISIBLE, curPos]);
  }
});

window.addEventListener('pagehide', (e) => {
  flushViaBeacon({ final: !e.persisted });  // bfcache → not final
});

document.addEventListener('freeze', () => flushViaBeacon({ final: false }));
window.addEventListener('beforeunload', () => flushViaBeacon({ final: true }));
```

Sending beacon multiple times in close succession is safe because the server dedups by `(sessionId, seq)`.

### 6.9 Paused-long auto-close

```typescript
onPause() {
  buffer.push([relTime(), EventCode.PAUSE, curPos]);
  flushNow();
  pauseLongTimer = setTimeout(() => closeSession('PAUSED_LONG'), 60_000);
}

onPlay() {
  if (pauseLongTimer) clearTimeout(pauseLongTimer);
  // If sessionId is null or session was already sealed → start a new session.
}
```

### 6.10 YouTube path

For videos with `source === 'YOUTUBE'`, events come from the YouTube iframe API:

- `onStateChange` → PLAY / PAUSE / ENDED / BUFFER_START / BUFFER_END
- `onPlaybackRateChange` → RATE
- `onError` → ERROR
- Position polled via `player.getCurrentTime()` every 250ms

VOLUME and QUALITY events are not available on all YouTube clients and are omitted silently.

### 6.11 Server-unavailable behavior

- Retry with exponential backoff: 1s, 2s, 4s, 8s (max 4 attempts).
- After 4 failures, buffering continues in memory. If buffer exceeds 500 events, oldest TICKs are dropped.
- **Structured events are never dropped.** TICKs are interpolatable; PLAY/PAUSE/SEEK are not.

## 7. Ingestion API (`apps/api`)

Module: `apps/api/src/modules/video-sessions/`.

### 7.1 `POST /public/video-sessions`

Creates a session. Idempotent on `(landingVisitId, videoId, startedAt=clientStartedAt)`.

- Rate limit: `ratelimit:session-create:<visitId>` — max 10/min.
- `PublicLandingGuard` validates `slug → landing → visit → video` ownership chain.
- Returns `{ sessionId }`.

### 7.2 `POST /public/video-sessions/:sessionId/chunks`

Appends a chunk. Full validation, dedup, JSONB append.

Responses: `202 Accepted`, `400 Bad Request`, `404 Not Found`, `410 Gone` (session finalized), `429 Too Many`.

Flow:

Request body extends the basic chunk with an optional `endReason` used only when `final: true`:

```json
{ "seq": 7, "events": [...], "final": true, "endReason": "PAUSED_LONG" }
```

1. Rate limit: `ratelimit:chunk:<sessionId>` — max 120/min.
2. Load session. Return 404 / 410 as appropriate.
3. Validate: non-empty, ≤ 500 events, each tuple well-formed, `type` in enum, `pos ∈ [0, videoDurationMs + 1000]`, `tMs` not in future. If `endReason` present, it must be a valid `VideoSessionEndReason`.
4. Dedup: `INSERT INTO "VideoSessionChunk" (sessionId, seq) VALUES ($1, $2)`. On unique conflict, return 202 immediately. (The correct response for "we already have this" is success, not conflict — the client must not retry.)
5. Only when step 4 inserts: `UPDATE "VideoPlaybackSession" SET trace = trace || $1::jsonb, chunksReceived = chunksReceived + 1, updatedAt = NOW() WHERE id = $2`.
6. If `final = true`: set `endedAt = NOW()`, `endReason = body.endReason ?? 'CLOSED'`, enqueue `video-session-finalize` job. The client supplies `ENDED`, `PAUSED_LONG`, `NAVIGATED`, or `ERROR` when it knows the reason; `CLOSED` is the fallback for beacon-initiated final flushes where the client didn't have time to classify.
7. Return 202.

### 7.3 `POST /public/video-sessions/:sessionId/chunks/beacon`

`sendBeacon` variant. Identical logic, but:

- Accepts `application/json` and `text/plain` (sendBeacon sometimes sets text/plain).
- Always responds 204 (browser ignores the response anyway).
- Skips the per-session rate limit (beacon cannot retry; dropping on rate limit would be lossy). Still applies per-visit rate limit as a flood guard.

### 7.4 `PublicLandingGuard`

New decorator `@PublicLandingEndpoint()`. Guard resolves `slug → landing → visit → video → company` in one place and stores `req.publicContext = { companyId, landingId, visitId, videoId }`. Controllers consume the already-validated context.

### 7.5 `JwtAuthGuard` whitelist

Global `JwtAuthGuard` checks the reflection metadata from `@PublicLandingEndpoint()` and skips JWT verification for those routes. Order: `JwtAuthGuard` (skip if public) → `PublicLandingGuard` (validate public context) → controller.

### 7.6 Rate limiting

New `RateLimitService` using Redis sorted sets (sliding window). Same Redis instance used by BullMQ — no new dependency.

```typescript
async check(key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = Date.now();
  const pipe = redis.pipeline();
  pipe.zremrangebyscore(key, 0, now - windowSec * 1000);
  pipe.zadd(key, now, `${now}:${Math.random()}`);
  pipe.zcard(key);
  pipe.expire(key, windowSec);
  const [, , count] = await pipe.exec();
  return count <= limit;
}
```

### 7.7 CORS

In `apps/api/src/main.ts`, public endpoints allow all origins (security is enforced by `PublicLandingGuard`, not origin). `credentials: false`. Methods: `POST`, `GET`, `OPTIONS`.

In prod, Caddy routes `/public/video-*` on the landing host to `api:4000/public/video-*`, making the request same-origin from the browser's perspective and sidestepping CORS entirely.

### 7.8 Routes removed from `apps/web`

- `apps/web/src/app/api/landings/[slug]/video-events/` — deleted entirely.
- `apps/web/src/app/api/landings/[slug]/track/` — moved into `apps/api` as `/public/landings/:slug/visits`. `landing-client.tsx` calls the new endpoint via `packages/api-client`.

## 8. Finalize Worker and Aggregation

Module: `apps/api/src/modules/video-sessions/workers/`.

### 8.1 Queue `video-session-finalize`

- Triggered by: (a) controller when client sends `final: true`, (b) `ReaperCron` for orphaned sessions.
- Job shape: `{ sessionId, reason: 'CLIENT_FINAL' | 'REAPER_TIMEOUT' }`.
- Idempotent: worker exits immediately if `session.finalized === true`.
- Retry: `attempts: 3`, exponential backoff 2s. Dead-letter on exhaustion; `ReaperCron` will re-enqueue on the next tick.

### 8.2 `ReaperCron`

Runs every 5 minutes via `@Cron('*/5 * * * *')`.

```typescript
const stale = await prisma.videoPlaybackSession.findMany({
  where: {
    finalized: false,
    endedAt: null,
    updatedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) },
  },
  take: 100,
  select: { id: true },
});

for (const { id } of stale) {
  await prisma.videoPlaybackSession.update({
    where: { id },
    data: { endedAt: new Date(), endReason: 'INCOMPLETE' },
  });
  await queue.add('finalize', { sessionId: id, reason: 'REAPER_TIMEOUT' });
}
```

A 2-minute idle threshold is safe: the client flushes every 3 seconds under normal load, so a 2-minute gap means the client is gone.

### 8.3 Worker flow

1. Load session. Exit if missing or already finalized.
2. Empty trace → mark finalized with existing `endReason` (or `INCOMPLETE`), skip aggregation.
3. Otherwise:
   - Call `computeAggregates(trace, videoDurationMs)` → session-level counters.
   - Call `computeSecondDeltas(trace, videoDurationMs)` → per-second deltas for `VideoSecondStats`.
4. One transaction:
   - Update `VideoPlaybackSession` with aggregates + `finalized = true`.
   - `INSERT ... ON CONFLICT DO UPDATE` into `VideoSecondStats` using `unnest()` arrays.
   - Update `LandingVisit` denormalized fields (`videoPlayed`, `videoWatchTime`, `videoCompleted`, `videoBufferCount`, `videoBufferTime`).

### 8.4 `computeAggregates`

Single pass, O(N). Key logic for `durationWatchedMs`:

Between consecutive events while playing, add `min(realDelta, posDelta)`. Taking the minimum naturally:

- Excludes paused time (`realDelta` only grows during play).
- Excludes forward seeks (`posDelta` jumps, `realDelta` does not).
- Excludes buffering (`realDelta` grows, `posDelta` does not).
- Handles playback rate > 1.0 correctly because `posDelta` already reflects the faster advance.

```typescript
function computeAggregates(trace, videoDurationMs) {
  let playCount = 0, pauseCount = 0, seekCount = 0;
  let bufferCount = 0, errorCount = 0, bufferTimeMs = 0;
  let durationWatchedMs = 0, maxPositionMs = 0;
  let bufferStartTime = 0, lastTickTime = 0, lastTickPos = 0;
  let isPlaying = false;

  for (const [tMs, type, pos, extra] of trace) {
    maxPositionMs = Math.max(maxPositionMs, pos);
    switch (type) {
      case EventCode.PLAY:
        playCount++; isPlaying = true;
        lastTickTime = tMs; lastTickPos = pos;
        break;
      case EventCode.PAUSE:
      case EventCode.ENDED:
        if (type === EventCode.PAUSE) pauseCount++;
        if (isPlaying) {
          durationWatchedMs += Math.max(0,
            Math.min(tMs - lastTickTime, pos - lastTickPos));
        }
        isPlaying = false;
        break;
      case EventCode.TICK:
        if (isPlaying) {
          durationWatchedMs += Math.max(0,
            Math.min(tMs - lastTickTime, pos - lastTickPos));
        }
        lastTickTime = tMs; lastTickPos = pos;
        break;
      case EventCode.SEEK:
        seekCount++;
        lastTickTime = tMs; lastTickPos = pos;
        break;
      case EventCode.BUFFER_START:
        bufferCount++; bufferStartTime = tMs;
        break;
      case EventCode.BUFFER_END:
        if (bufferStartTime > 0) bufferTimeMs += tMs - bufferStartTime;
        bufferStartTime = 0;
        break;
      case EventCode.ERROR:
        errorCount++;
        break;
    }
  }

  return {
    playCount, pauseCount, seekCount, bufferCount, errorCount,
    bufferTimeMs, durationWatchedMs, maxPositionMs,
    completionPercent: videoDurationMs > 0
      ? Math.min(1, maxPositionMs / videoDurationMs)
      : 0,
  };
}
```

`uniqueSecondsWatched` is computed alongside `computeSecondDeltas`.

### 8.5 `computeSecondDeltas`

Builds per-second counters across the session:

- `watched[s]` — number of times second `s` was played in this session (first play = `views`, additional plays = `replays`).
- `pauses[s]` — number of pauses at second `s`.
- `seekAways[s]` — number of seeks originating from second `s` (using `fromMs` extra).

Returns sparse arrays (only seconds with non-zero counts) suitable for Postgres `unnest()`:

```sql
INSERT INTO "VideoSecondStats" ("videoId", "second", "views", "replays", "pauseCount", "seekAwayCount")
SELECT $1, sec, view, replay, pause, seekaway
FROM unnest($2::int[], $3::int[], $4::int[], $5::int[], $6::int[])
  AS t(sec, view, replay, pause, seekaway)
ON CONFLICT ("videoId", "second") DO UPDATE
SET "views"         = "VideoSecondStats"."views"         + EXCLUDED."views",
    "replays"       = "VideoSecondStats"."replays"       + EXCLUDED."replays",
    "pauseCount"    = "VideoSecondStats"."pauseCount"    + EXCLUDED."pauseCount",
    "seekAwayCount" = "VideoSecondStats"."seekAwayCount" + EXCLUDED."seekAwayCount"
```

### 8.6 Late chunks

If a chunk arrives after the session was already finalized, the controller returns `410 Gone` and the client drops it. Consistency of aggregates wins over capturing a sub-second tail.

## 9. Read-side API and UI

### 9.1 `GET /videos/:id/analytics?from=&to=`

Authed (`VIDEOS_READ`). Returns:

- Overview (sessions, unique viewers, avg watch time, completion rate, errors).
- Retention curve — raw from `VideoSecondStats`.
- Recent sessions table.
- Device / geography / referrer breakdowns (via `LandingVisit` denorm).

Overview query reads `VideoPlaybackSession` filtered by `videoId` + date range. All breakdowns read aggregates — no trace scanning.

### 9.2 `GET /landings/:slug/visits/:visitId/playback`

Authed. Returns all `VideoPlaybackSession` rows for the visit, with `trace` decoded from tuples to objects via `decodeTrace` in `packages/shared`.

### 9.3 Video analytics dashboard

Page: `apps/web/src/app/(dashboard)/videos/[id]/analytics/page.tsx` (restored from the deletion in commit `f0f4255`, now reading the new schema).

Components:

- KPI cards.
- Retention chart (SVG): X = seconds, Y-left = `views`, Y-right (heat overlay) = `replays`. Vertical markers for top 5 `seekAwayCount` seconds. Dots for top 5 `pauseCount` seconds.
- Recent sessions table linking to drill-down.
- Device / geography / referrer breakdowns (reuse existing components).

### 9.4 Drill-down

Page: `apps/web/src/app/(dashboard)/analytics/[slug]/visits/[visitId]/page.tsx` (extended).

`<SessionTimeline>` renders two synchronized tracks:

1. **Video timeline** — position in video (0 → duration). Cell color encodes per-second play count within this session (1x = base, 2x = replayed, etc.).
2. **Real timeline** — wall-clock (`startedAt` → `endedAt`). Dark = play, light = pause, red = buffer, grey = visibility hidden.

Below: decoded event list with relative timestamps and icons.

The two tracks answer different questions: video timeline → "which segments held his attention"; real timeline → "how did he actually watch (in one sitting, over breaks, in the background)".

### 9.5 Typed API client

`packages/api-client` gains:

```typescript
export const videoAnalytics = {
  getAnalytics: (videoId, from?, to?) =>
    api.get<VideoAnalyticsData>(`/videos/${videoId}/analytics`, { from, to }),
  getVisitPlayback: (slug, visitId) =>
    api.get<VisitPlaybackData>(`/landings/${slug}/visits/${visitId}/playback`),
};
```

Types (`VideoAnalyticsData`, `VisitPlaybackData`, `DecodedEvent`, `EventCode`, `EventTuple`) live in `packages/shared/src/video-analytics.ts` alongside `encodeTrace` / `decodeTrace`.

## 10. Microsoft Clarity

One-line integration in `apps/web/src/app/l/[slug]/layout.tsx`, gated on `NEXT_PUBLIC_CLARITY_PROJECT_ID`. No DB integration. Used for page-level session replay, mouse heatmaps, and rage-click detection — complementary to the video tracker.

GDPR: Clarity respects `window.clarity('consent', false)` if the landing's cookie banner rejects tracking.

## 11. Rollout Plan

Eight deployable stages. Each stage is self-contained and revertable in isolation, except stage 6 (switchover) and stage 8 (destructive cleanup).

**Stage 1 — Schema.** Add new models, keep `VideoWatchEvent`. Run migration. Regenerate both Prisma clients.

**Stage 2 — Shared types.** Add `EventCode`, `EventTuple`, `encodeTrace`, `decodeTrace`, DTOs to `packages/shared`.

**Stage 3 — Backend ingestion.** New NestJS module with public endpoints, guards, rate limiting, CORS. Unit tests on guard, rate limit, append, dedup.

**Stage 4 — Finalize worker and reaper.** BullMQ queue, cron, `computeAggregates`, `computeSecondDeltas`. Unit tests on both compute functions are mandatory.

**Stage 5 — Read endpoints.** Rewrite `VideoAnalyticsService`, add visit playback endpoint. Still returns empty data because nothing writes yet.

**Stage 6 — Switchover (critical).** Ship `video-tracker.ts`, remove old event-collecting code from `landing-client.tsx`, delete legacy routes, wire Clarity. Manual smoke test required before merge:

- Desktop Chrome: play → pause → seek → close → verify session, trace, finalize, aggregates.
- iOS Safari (real device or BrowserStack): background → foreground → session survives.
- YouTube video path.
- Rate limit sanity check.

Create git tag `pre-video-analytics-switchover` before merging as a safety anchor.

**Stage 7 — UI.** Restore video analytics dashboard, extend drill-down with `SessionTimeline` and event list.

**Stage 8 — Destructive cleanup (1-2 days after stage 7).** Drop `VideoWatchEvent`, drop `VideoEventType` enum, remove any remaining references. Deliberately delayed so stages 6-7 can be observed in production first.

### 11.1 Rollback strategy

- Stages 1-5: plain `git revert`, zero user impact.
- Stage 6: `git revert` is painful because legacy routes are deleted in the same commit — prefer forward-fix. The `pre-video-analytics-switchover` tag exists as a last-resort hard reset anchor.
- Stage 7: forward-fix.
- Stage 8: irreversible. Only ship after stage 6-7 are confirmed stable.

### 11.2 `LandingVisit` migration

No migration needed for existing denormalized fields (`videoPlayed`, etc.). They retain old values; new visits get new values from the finalize worker.

## 12. Testing Strategy

### 12.1 Unit tests (Vitest)

Shared package:

- `encodeTrace` / `decodeTrace` round-trip.
- All `EventCode` values decoded without "unknown type".
- Decoder tolerates unexpected `extra` fields.

`computeAggregates` — the numbers people will trust. Tests on synthetic traces:

- Empty trace → zeros.
- Play without pause → counts to last tick.
- Play → pause → correct `durationWatched`.
- Seek backward → `replays` increment, `durationWatched` grows.
- Seek forward → `durationWatched` does **not** grow on skipped seconds.
- Buffer during play → `bufferTimeMs` grows, `durationWatched` does not.
- Visibility_hidden → visible → treated as pause, not play.
- Multiple play/pause cycles → `playCount` and `pauseCount` correct.
- Rate 2.0 → duration still accurate because `posDelta` already reflects the faster advance.
- `completionPercent` clipped to `[0, 1]`.
- `ENDED` behaves as pause for duration accounting.

`computeSecondDeltas`:

- Empty trace → empty arrays.
- Linear play 0→10s → `views=1` for seconds 0..9, `replays=0`.
- Play 0→5, seek 5→2, play 2→5 → `views=1` for all, `replays=1` for 2, 3, 4.
- Pause at second 3 → `pauses[3]=1`.
- Seek away from second 5 → `seekAways[5]=1`.
- `pos > videoDurationMs` (rounding slack) → no out-of-range writes.

`RateLimitService` via `ioredis-mock`:

- 120 requests in 60s all pass; 121st rejected.
- After 60s window, counter resets via sliding window.

### 12.2 Integration tests (real Postgres + Redis)

`VideoSessionsService`:

- Create session — row with empty trace.
- Create session idempotent — second call with same `(visitId, videoId, startedAt)` returns same id.
- Create rejects mismatched visit/landing.
- Create rejects video from a different company.
- Append chunk — JSONB concat works.
- Append chunk duplicate seq → 202, `chunksReceived` unchanged.
- Append chunk concurrent writes — both visible in trace.
- Append chunk `final: true` → sets `endedAt` and enqueues job.
- Append chunk to finalized session → 410.
- Append chunk validation (empty, >500 events, future `tMs`, out-of-range `pos`) → 400.
- Append chunk arriving with lower seq than the latest → still accepted (late retry).

`FinalizeWorker`:

- Empty session → `finalized = true`, zero aggregates, `VideoSecondStats` untouched.
- Normal session → aggregates set, `VideoSecondStats` incremented.
- Idempotent: double-run → no double-increment of `VideoSecondStats`.
- Two sessions of the same video → `VideoSecondStats` sums correctly.
- `LandingVisit` denormalized fields updated.
- Completion ≥ 0.95 → `videoCompleted = true`.

`ReaperCron`:

- Finds sessions older than 2 minutes.
- Ignores fresh sessions.
- Ignores finalized sessions.
- Sets `endReason = 'INCOMPLETE'` and enqueues job.
- Processes in batches of 100.

`VideoAnalyticsController` (read):

- Overview includes only finalized sessions.
- Retention curve correct for synthetic sessions with known shapes.
- Date range filter.
- Permission guard: 403 without `VIDEOS_READ`.
- Drill-down decodes trace correctly.
- Empty visit → empty array.
- 404 for missing slug / visitId.

### 12.3 Manual end-to-end tests (required before stage 6 merge)

**Desktop Chrome:**

- Play 30s → close tab → DB: `trace > 100` events, `finalized = true`, `durationWatchedMs ≈ 30000`.
- Play → pause 70s → automatic `PAUSED_LONG` close. New play → new session.
- Seek from 0:20 back to 0:05 → `VideoSecondStats` seconds 5..19 get `replays` increment.
- Seek from 0:10 forward to 1:00 → seconds 10..59 do not get `views`.
- 60 chunks in 30s → all accepted, no console errors.

**Desktop Firefox, Safari:** same 1-3 flows.

**iOS Safari (real device or BrowserStack):**

- Play → background Safari → return after 10s → continue → close. Trace contains `VISIBILITY_HIDDEN` → `VISIBILITY_VISIBLE`. Session survives. `durationWatchedMs` excludes the backgrounded interval.
- Play → force-close Safari (swipe up). Reaper marks as `INCOMPLETE` within 5 minutes; trace contains events delivered via `sendBeacon`.
- Airplane mode mid-play → reconnect → fetch retries flush buffered events.

**Android Chrome:**

- Play → switch apps → return. `freeze` event handled; session continues.

**YouTube video path:**

- Play → pause → seek → close. Trace populated. YouTube events are a subset of the HTML5 path (no VOLUME, no QUALITY on some clients) — that's expected.

**Rate limiting:**

- DevTools script sending 200 chunks in 10s → some return 429, client buffers and retries.

### 12.4 Post-rollout monitoring (first 24 hours)

API logs:

- 400 / 429 / 404 / 410 rate on `/public/video-sessions/*` — no spikes.
- BullMQ queue depth and processing time on `video-session-finalize` — processing < 1s.
- INCOMPLETE vs CLOSED ratio — expected 5–15% incomplete.

Database:

- `VideoPlaybackSession` row count and average trace size (expected 1–20 KB/session).

Client:

- `VideoTracker` exceptions in logs.
- `sendBeacon returned false` — indicates payload > 64 KB limit; investigate.

Sanity:

- Top videos by views match intuition.
- `retention[0]` near 100% (every play sees second 0). If noticeably lower, `computeSecondDeltas` has a bug.

### 12.5 Security and privacy checklist

- Public endpoints accept only IDs and numbers — no free-form strings except truncated error messages.
- Error messages in ERROR events truncated to 500 chars and sanitized.
- Rate limit per `visitId` enforced via Redis.
- `PublicLandingGuard` enforces the ownership chain `visit → landing → video → company`.
- Microsoft Clarity project ID from env, not hardcoded. Consent respected.

### 12.6 Known risks (accepted, not tested)

- No load test at 10k concurrent sessions. Current scale is far below this; will address if volume grows.
- CloudFront signed URL edge cases out of scope.
- Real-time live view deferred.
- YouTube iframe API quirks on iOS Safari covered only by manual E2E.

## 13. Deferred Work

- **Live view** (real-time "X is watching now") — requires Socket.IO pub/sub on chunk append. Designed separately when prioritized.
- **S3 cold storage of old traces** — triggered when `VideoPlaybackSession` table volume becomes a problem.
- **Per-landing video analytics page** — currently aggregates are per-video. A per-landing cut over sessions is a small follow-up that reuses `VideoSecondStats`.

## 14. Open Items

None. All design decisions approved during the brainstorming session of 2026-04-14.
