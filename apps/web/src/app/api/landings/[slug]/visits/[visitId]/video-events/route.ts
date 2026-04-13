import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; visitId: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.ANALYTICS_READ);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 403 });
  }

  const { slug, visitId } = await params;

  // Validate visit belongs to this landing and company
  const visit = await prisma.landingVisit.findUnique({
    where: { id: visitId },
    include: {
      landing: {
        select: {
          slug: true,
          companyId: true,
          video: { select: { id: true, durationSeconds: true } },
        },
      },
    },
  });

  if (
    !visit ||
    visit.landing.slug !== slug ||
    visit.landing.companyId !== companyId
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const videoId = visit.landing.video.id;
  const durationSeconds = visit.landing.video.durationSeconds ?? 0;
  const bucketSize = 5;
  const totalBuckets = durationSeconds > 0 ? Math.ceil(durationSeconds / bucketSize) : 0;

  // Segment strip: which 5-sec buckets were watched
  let segments: boolean[] = [];
  let watchPercentage = 0;

  if (totalBuckets > 0) {
    const bucketRows = await prisma.$queryRaw<{ bucket: number }[]>`
      SELECT DISTINCT FLOOR(position / ${bucketSize})::int AS bucket
      FROM "VideoWatchEvent"
      WHERE "landingVisitId" = ${visitId}
        AND "videoId" = ${videoId}
        AND "eventType" IN ('HEARTBEAT', 'PLAY')
    `;

    const watchedSet = new Set(bucketRows.map((r) => r.bucket));
    segments = Array.from({ length: totalBuckets }, (_, i) => watchedSet.has(i));
    watchPercentage = totalBuckets > 0
      ? Math.round((watchedSet.size / totalBuckets) * 100)
      : 0;
  }

  // Event timeline (exclude HEARTBEATs — they're only for segment computation)
  const events = await prisma.videoWatchEvent.findMany({
    where: {
      landingVisitId: visitId,
      videoId,
      eventType: { notIn: ["HEARTBEAT"] },
    },
    orderBy: { clientTimestamp: "asc" },
    select: {
      eventType: true,
      position: true,
      seekFrom: true,
      seekTo: true,
      playbackRate: true,
      clientTimestamp: true,
    },
  });

  return NextResponse.json({
    segments,
    durationSeconds,
    watchPercentage,
    events: events.map((e) => ({
      eventType: e.eventType,
      position: e.position,
      seekFrom: e.seekFrom,
      seekTo: e.seekTo,
      playbackRate: e.playbackRate,
      clientTimestamp: e.clientTimestamp.toISOString(),
    })),
  });
}
