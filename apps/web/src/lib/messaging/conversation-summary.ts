import { prisma } from "@/lib/db";
import type { SsePayloadConversationSummary } from "@/lib/messaging-events";

/**
 * Build the ConversationSummary shape that the conversation list UI consumes.
 * Mirrors the projection in `GET /api/messaging/conversations` so that an
 * SSE-pushed `new_conversation` can be appended to the list without the
 * client refetching the whole page.
 */
export async function buildConversationSummary(
  conversationId: string,
): Promise<SsePayloadConversationSummary | null> {
  const c = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          channels: { select: { channelType: true, identifier: true } },
        },
      },
      channel: { select: { id: true, type: true } },
      assignments: {
        where: { isActive: true },
        select: { user: { select: { id: true, name: true, email: true } } },
        take: 1,
      },
      tags: { include: { tag: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, direction: true },
      },
    },
  });
  if (!c) return null;

  const emailCh = c.contact?.channels.find((ch) => ch.channelType === "EMAIL");
  const phoneCh = c.contact?.channels.find((ch) =>
    ["SMS", "WHATSAPP", "TELEGRAM"].includes(ch.channelType),
  );

  const unread = await prisma.message.count({
    where: {
      conversationId,
      direction: "INBOUND",
      statuses: { none: { status: "READ" } },
    },
  });

  return {
    id: c.id,
    status: c.status,
    priority: c.priority,
    channelType: c.channel.type,
    subject: c.subject,
    lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
    lastMessagePreview: c.messages[0]?.body?.slice(0, 120) ?? null,
    createdAt: c.createdAt.toISOString(),
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
    contact: c.contact
      ? {
          id: c.contact.id,
          name: c.contact.displayName,
          email: emailCh?.identifier ?? null,
          phone: phoneCh?.identifier ?? null,
          avatarUrl: c.contact.avatarUrl,
        }
      : null,
    assignee: c.assignments[0]?.user
      ? {
          id: c.assignments[0].user.id,
          name: c.assignments[0].user.name,
          email: c.assignments[0].user.email,
        }
      : null,
    tags: c.tags.map((ct) => ({
      id: ct.tag.id,
      name: ct.tag.name,
      color: ct.tag.color || "#6B7280",
    })),
    unreadCount: unread,
  };
}
