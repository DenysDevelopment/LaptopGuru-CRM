import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CONVERSATIONS_READ);
  if (error) return error;

  const url = request.nextUrl;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  const assigneeId = url.searchParams.get("assigneeId");
  const channelId = url.searchParams.get("channelId");
  const channelType = url.searchParams.get("channelType");
  const channelTypesParam = url.searchParams.get("channelTypes");
  const priorityParam = url.searchParams.get("priority");

  const where: Prisma.ConversationWhereInput = {
    companyId: session.user.companyId ?? "",
  };

  if (status) {
    where.status = status as Prisma.EnumConversationStatusFilter;
  }

  if (channelId) {
    where.channelId = channelId;
  }

  if (channelType) {
    // Allow filtering by channel TYPE (EMAIL / ALLEGRO / …) when no specific
    // channel id is given — used by the sidebar's "all channels of this type"
    // shortcuts.
    where.channel = {
      type: channelType as Prisma.EnumChannelTypeFilter,
    };
  }

  if (channelTypesParam) {
    // Multi-type filter for sidebar categories — e.g. "Мессенджеры" maps to
    // TELEGRAM,WHATSAPP,SMS,FACEBOOK_MESSENGER,INSTAGRAM_DIRECT.
    const types = channelTypesParam
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (types.length > 0) {
      where.channel = {
        ...(where.channel as object),
        type: { in: types as Prisma.EnumChannelTypeFilter[] as never },
      } as Prisma.ConversationWhereInput["channel"];
    }
  }

  if (priorityParam) {
    const priorities = priorityParam
      .split(",")
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);
    if (priorities.length > 0) {
      where.priority = { in: priorities as Prisma.EnumConversationPriorityFilter["in"] };
    }
  }

  if (assigneeId) {
    const userId = assigneeId === "me" ? session.user!.id : assigneeId;
    where.assignments = {
      some: { userId, isActive: true },
    };
  }

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { contact: { displayName: { contains: search, mode: "insensitive" } } },
      {
        contact: {
          channels: { some: { identifier: { contains: search, mode: "insensitive" } } },
        },
      },
    ];
  }

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      contact: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          channels: { select: { channelType: true, identifier: true } },
        },
      },
      channel: { select: { id: true, type: true, name: true } },
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
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, direction: true },
      },
    },
  });

  // Count unread messages per conversation (inbound messages without READ status)
  const conversationIds = conversations.map((c) => c.id);
  const unreadCounts = await prisma.message.groupBy({
    by: ["conversationId"],
    where: {
      conversationId: { in: conversationIds },
      direction: "INBOUND",
      statuses: { none: { status: "READ" } },
    },
    _count: true,
  });
  const unreadMap = new Map(unreadCounts.map((u) => [u.conversationId, u._count]));

  const items = conversations.map((c) => {
    const emailCh = c.contact?.channels.find((ch) => ch.channelType === "EMAIL");
    const phoneCh = c.contact?.channels.find((ch) =>
      ["SMS", "WHATSAPP", "TELEGRAM"].includes(ch.channelType),
    );

    return {
      id: c.id,
      status: c.status,
      priority: c.priority,
      channelType: c.channel.type,
      subject: c.subject,
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.messages[0]?.body?.slice(0, 120) || null,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
      contact: c.contact
        ? {
            id: c.contact.id,
            name: c.contact.displayName,
            email: emailCh?.identifier || null,
            phone: phoneCh?.identifier || null,
            avatarUrl: c.contact.avatarUrl,
          }
        : null,
      assignee: c.assignments[0]?.user || null,
      tags: c.tags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        color: ct.tag.color || "#6B7280",
      })),
      unreadCount: unreadMap.get(c.id) || 0,
    };
  });

  return NextResponse.json({ items });
}
