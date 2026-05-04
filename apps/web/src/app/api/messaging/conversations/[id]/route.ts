import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { transitionConversationStatus } from "@/lib/messaging/transition-status";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CONVERSATIONS_READ);
  if (error) return error;

  const { id } = await params;

  // Auto-transition: first time an admin of the same company looks at a NEW
  // conversation, flip to OPEN. Race-safe via requireFromStatus + a guard
  // against an existing viewed-by-admin event (concurrent GETs from React
  // StrictMode / fast-refresh would otherwise stamp it twice).
  const preview = await prisma.conversation.findUnique({
    where: { id },
    select: { companyId: true, status: true },
  });
  if (
    preview &&
    preview.companyId === (session.user.companyId ?? "") &&
    preview.status === "NEW"
  ) {
    const alreadyOpened = await prisma.conversationEvent.findFirst({
      where: {
        conversationId: id,
        type: "STATUS_CHANGED",
        payload: { path: ["reason"], equals: "viewed-by-admin" },
      },
      select: { id: true },
    });
    if (!alreadyOpened) {
      await transitionConversationStatus({
        conversationId: id,
        toStatus: "OPEN",
        actorUserId: session.user.id,
        reason: "viewed-by-admin",
        requireFromStatus: ["NEW"],
      }).catch(() => {/* non-fatal */});
    }
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          company: true,
          channels: {
            select: { channelType: true, identifier: true },
          },
        },
      },
      channel: { select: { type: true } },
      assignments: {
        where: { isActive: true },
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
        take: 1,
      },
      tags: {
        include: { tag: true },
      },
      lastStatusChangedBy: {
        select: { id: true, name: true, email: true },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!conversation || conversation.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Enrich LANDING_SENT events with live stats: visit count, first-visit time,
  // video plays + best completion. Bulk-fetched in 3 parallel queries to avoid
  // N+1 across the timeline.
  const landingIds = conversation.events
    .map((e) => (e.payload as { landingId?: string } | null)?.landingId)
    .filter((v): v is string => typeof v === "string");

  type LandingStats = {
    views: number;
    clicks: number;
    firstVisitAt: string | null;
    videoPlays: number;
    bestCompletionPercent: number | null;
  };
  const statsByLandingId = new Map<string, LandingStats>();

  if (landingIds.length > 0) {
    const [landings, visitAgg, sessions] = await Promise.all([
      prisma.landing.findMany({
        where: { id: { in: landingIds } },
        select: { id: true, clicks: true },
      }),
      prisma.landingVisit.groupBy({
        by: ["landingId"],
        where: { landingId: { in: landingIds } },
        _count: { _all: true },
        _min: { visitedAt: true },
      }),
      prisma.videoPlaybackSession.findMany({
        where: { visit: { landingId: { in: landingIds } } },
        select: {
          completionPercent: true,
          playCount: true,
          visit: { select: { landingId: true } },
        },
      }),
    ]);

    const clicksByLanding = new Map(landings.map((l) => [l.id, l.clicks]));
    const visitsByLanding = new Map(
      visitAgg.map((v) => [
        v.landingId,
        {
          count: v._count._all,
          firstVisitAt: v._min.visitedAt ? v._min.visitedAt.toISOString() : null,
        },
      ]),
    );

    const sessionsByLanding = new Map<
      string,
      { plays: number; bestCompletion: number | null }
    >();
    for (const s of sessions) {
      const lid = s.visit.landingId;
      const acc = sessionsByLanding.get(lid) ?? { plays: 0, bestCompletion: null };
      if ((s.playCount ?? 0) > 0) acc.plays += 1;
      if (
        s.completionPercent != null &&
        (acc.bestCompletion == null || s.completionPercent > acc.bestCompletion)
      ) {
        acc.bestCompletion = s.completionPercent;
      }
      sessionsByLanding.set(lid, acc);
    }

    for (const lid of landingIds) {
      const v = visitsByLanding.get(lid);
      const s = sessionsByLanding.get(lid);
      statsByLandingId.set(lid, {
        views: v?.count ?? 0,
        clicks: clicksByLanding.get(lid) ?? 0,
        firstVisitAt: v?.firstVisitAt ?? null,
        videoPlays: s?.plays ?? 0,
        bestCompletionPercent: s?.bestCompletion ?? null,
      });
    }
  }

  const contact = conversation.contact;
  const emailChannel = contact?.channels.find((ch) => ch.channelType === "EMAIL");
  const phoneChannel = contact?.channels.find(
    (ch) => ch.channelType === "SMS" || ch.channelType === "WHATSAPP",
  );

  return NextResponse.json({
    id: conversation.id,
    status: conversation.status,
    priority: conversation.priority,
    channelType: conversation.channel.type,
    subject: conversation.subject,
    createdAt: conversation.createdAt,
    closedAt: conversation.closedAt,
    lastStatusChangedAt: conversation.lastStatusChangedAt,
    lastStatusChangedBy: conversation.lastStatusChangedBy,
    contact: contact
      ? {
          id: contact.id,
          name: contact.displayName,
          email: emailChannel?.identifier || null,
          phone: phoneChannel?.identifier || null,
          avatarUrl: contact.avatarUrl,
          company: contact.company,
          channels: contact.channels.map((ch) => ({
            type: ch.channelType,
            externalId: ch.identifier,
          })),
        }
      : null,
    assignee: conversation.assignments[0]?.user || null,
    tags: conversation.tags.map((ct) => ({
      id: ct.tag.id,
      name: ct.tag.name,
      color: ct.tag.color || "#6B7280",
    })),
    // Timeline events (oldest first for direct rendering)
    events: conversation.events
      .slice()
      .reverse()
      .map((e) => {
        const landingId = (e.payload as { landingId?: string } | null)?.landingId;
        const stats = landingId ? statsByLandingId.get(landingId) ?? null : null;
        return {
          id: e.id,
          type: e.type,
          actor: e.actor,
          payload: e.payload,
          createdAt: e.createdAt,
          landingStats: stats,
        };
      }),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CONVERSATIONS_WRITE);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.conversation.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!existing || existing.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.priority) data.priority = body.priority;
  if (body.status === "CLOSED") data.closedAt = new Date();

  const updated = await prisma.conversation.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}
