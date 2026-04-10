import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const VALID_EVENT_TYPES = [
  "PLAY", "PAUSE", "SEEK", "ENDED", "HEARTBEAT",
  "RATE_CHANGE", "QUALITY_CHANGE", "FULLSCREEN", "ERROR",
] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  interface VideoEvent {
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

  // Validate the landing visit belongs to this slug
  const visit = await prisma.landingVisit.findUnique({
    where: { id: landingVisitId },
    include: { landing: { select: { slug: true, companyId: true } } },
  });
  if (!visit || visit.landing.slug !== slug) {
    return NextResponse.json({ error: "Invalid visit" }, { status: 400 });
  }

  const validEvents = events.filter(
    (e) =>
      VALID_EVENT_TYPES.includes(e.eventType) &&
      typeof e.position === "number" &&
      e.clientTimestamp,
  );

  if (validEvents.length > 0) {
    await prisma.videoWatchEvent.createMany({
      data: validEvents.map((e) => ({
        landingVisitId,
        videoId,
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
    });
  }

  return NextResponse.json({ accepted: validEvents.length });
}
