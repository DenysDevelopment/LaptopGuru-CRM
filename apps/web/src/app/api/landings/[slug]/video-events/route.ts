import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const VALID_EVENT_TYPES = [
  "PLAY", "PAUSE", "SEEK", "ENDED", "HEARTBEAT",
  "RATE_CHANGE", "QUALITY_CHANGE", "FULLSCREEN", "VOLUME_CHANGE", "ERROR", "BUFFERING",
] as const;

// In-memory per-visit rate limiter (single-instance; upgrade to Redis if scaling
// horizontally). Caps tampered clients at ~60 requests/min per visit — enough
// headroom for legit flush cadence (≤6/min from the 10s interval) but kills
// trivial curl-based inflation of watch metrics.
const videoEventsRateMap = new Map<string, { count: number; resetAt: number }>();
const MAX_VIDEO_EVENT_POSTS_PER_VISIT = 60;
const VIDEO_EVENT_WINDOW_MS = 60_000;

function isVideoEventsRateLimited(visitId: string): boolean {
  const now = Date.now();
  // Opportunistic sweep so the map doesn't grow unbounded.
  if (videoEventsRateMap.size > 10_000) {
    for (const [key, entry] of videoEventsRateMap) {
      if (now > entry.resetAt) videoEventsRateMap.delete(key);
    }
  }
  const entry = videoEventsRateMap.get(visitId);
  if (!entry || now > entry.resetAt) {
    videoEventsRateMap.set(visitId, { count: 1, resetAt: now + VIDEO_EVENT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_VIDEO_EVENT_POSTS_PER_VISIT;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  interface VideoEvent {
    clientEventId?: string;
    eventType: (typeof VALID_EVENT_TYPES)[number];
    position: number;
    seekFrom?: number | null;
    seekTo?: number | null;
    playbackRate?: number;
    volume?: number | null;
    isFullscreen?: boolean | null;
    errorMessage?: string | null;
    clientTimestamp: string;
  }

  let body: { videoId?: string; landingVisitId?: string; events?: VideoEvent[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { videoId, landingVisitId, events } = body;
  if (!videoId || !landingVisitId || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (events.length > 100) {
    return NextResponse.json({ error: "Too many events" }, { status: 400 });
  }

  if (isVideoEventsRateLimited(landingVisitId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Validate the landing visit belongs to this slug and videoId matches
  const visit = await prisma.landingVisit.findUnique({
    where: { id: landingVisitId },
    include: {
      landing: {
        select: {
          slug: true,
          companyId: true,
          videoId: true,
          video: { select: { durationSeconds: true } },
        },
      },
    },
  });
  if (!visit || visit.landing.slug !== slug) {
    return NextResponse.json({ error: "Invalid visit" }, { status: 400 });
  }
  if (visit.landing.videoId !== videoId) {
    return NextResponse.json({ error: "Video mismatch" }, { status: 400 });
  }

  const now = Date.now();
  const durationSeconds = visit.landing.video?.durationSeconds ?? 0;

  const validEvents = events.filter((e) => {
    if (!VALID_EVENT_TYPES.includes(e.eventType)) return false;
    if (typeof e.position !== "number" || e.position < 0) return false;
    // Reject positions far beyond video duration (10s buffer for timing drift)
    if (durationSeconds > 0 && e.position > durationSeconds + 10) return false;
    // Validate clientTimestamp: must be a valid date, not in future, not older than 24h
    const ts = new Date(e.clientTimestamp).getTime();
    if (isNaN(ts) || ts > now + 60_000 || now - ts > 24 * 3600_000) return false;
    return true;
  });

  if (validEvents.length > 0) {
    await prisma.videoWatchEvent.createMany({
      data: validEvents.map((e) => ({
        landingVisitId,
        videoId,
        // Fallback for older clients that don't send a UUID yet — server-generated
        // ID is still unique per-row and keeps the NOT NULL constraint satisfied.
        clientEventId: e.clientEventId || crypto.randomUUID(),
        eventType: e.eventType,
        position: e.position,
        seekFrom: e.seekFrom ?? null,
        seekTo: e.seekTo ?? null,
        playbackRate: e.playbackRate ?? 1,
        volume: e.volume ?? null,
        isFullscreen: e.isFullscreen ?? null,
        errorMessage: e.errorMessage ?? null,
        clientTimestamp: new Date(e.clientTimestamp),
        companyId: visit.landing.companyId,
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ accepted: validEvents.length });
}
