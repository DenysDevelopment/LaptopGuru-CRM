import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authorize';
import { prisma } from '@/lib/db';
import { PERMISSIONS, decodeTrace, type EventTuple, type VisitPlaybackData } from '@laptopguru-crm/shared';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; visitId: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.ANALYTICS_READ);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 403 });

  const { slug, visitId } = await params;
  const visit = await prisma.landingVisit.findUnique({
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

  if (!visit || visit.landing.slug !== slug || visit.companyId !== companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const data: VisitPlaybackData = {
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

  return NextResponse.json(data);
}
