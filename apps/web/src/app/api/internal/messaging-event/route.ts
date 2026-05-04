import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  emitMessagingEvent,
  type SsePayloadConversationSummary,
} from "@/lib/messaging-events";
import { buildConversationSummary } from "@/lib/messaging/conversation-summary";

/**
 * Internal SSE bridge endpoint.
 *
 * The NestJS API process (port 4000) hosts long-running jobs like the Allegro
 * polling cron. Those jobs can't push to the SSE in-memory bus that lives in
 * the Next.js Web process (port 3000). This endpoint accepts a lightweight
 * trigger (IDs only), resolves the full payload from the shared database, and
 * re-emits it on the Web SSE bus so connected clients see the update.
 *
 * Auth: shared secret in `x-internal-token` (NEXTAUTH_SECRET).
 *
 * Trigger shapes:
 *   { type: 'new_message',         conversationId, messageId }
 *   { type: 'new_conversation',    conversationId }
 *   { type: 'conversation_updated', conversationId, action?, patch? }
 */

interface NewMessageTrigger {
  type: "new_message";
  conversationId: string;
  messageId: string;
}
interface NewConversationTrigger {
  type: "new_conversation";
  conversationId: string;
}
interface ConversationUpdatedTrigger {
  type: "conversation_updated";
  conversationId: string;
  action?: string;
  patch?: Partial<SsePayloadConversationSummary>;
}
type Trigger =
  | NewMessageTrigger
  | NewConversationTrigger
  | ConversationUpdatedTrigger;

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-internal-token");
  const expected = process.env.NEXTAUTH_SECRET;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let trigger: Trigger;
  try {
    trigger = (await request.json()) as Trigger;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!trigger?.type || !trigger?.conversationId) {
    return NextResponse.json({ error: "Missing type or conversationId" }, { status: 400 });
  }

  if (trigger.type === "new_message") {
    const m = await prisma.message.findUnique({
      where: { id: trigger.messageId },
      include: {
        senderUser: { select: { id: true, name: true, email: true } },
        contact: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            storageUrl: true,
            fileSize: true,
          },
        },
      },
    });
    if (!m) return NextResponse.json({ ok: true, skipped: "message-not-found" });

    emitMessagingEvent({
      type: "new_message",
      conversationId: trigger.conversationId,
      message: {
        id: m.id,
        conversationId: trigger.conversationId,
        direction: m.direction,
        contentType: m.contentType,
        body: m.body ?? "",
        createdAt: m.createdAt.toISOString(),
        sender: m.senderUser
          ? { id: m.senderUser.id, name: m.senderUser.name, email: m.senderUser.email }
          : null,
        contact: m.contact
          ? { id: m.contact.id, name: m.contact.displayName, avatarUrl: m.contact.avatarUrl }
          : null,
        attachments: m.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          url: a.storageUrl,
          size: a.fileSize,
        })),
        metadata: m.metadata as Record<string, unknown> | null,
        status: m.direction === "OUTBOUND" ? "SENT" : "DELIVERED",
      },
      conversationPatch: {
        lastMessageAt: m.createdAt.toISOString(),
        lastMessagePreview: (m.body ?? "").slice(0, 120),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (trigger.type === "new_conversation") {
    const summary = await buildConversationSummary(trigger.conversationId);
    if (!summary) return NextResponse.json({ ok: true, skipped: "conversation-not-found" });
    emitMessagingEvent({
      type: "new_conversation",
      conversationId: trigger.conversationId,
      conversation: summary,
    });
    return NextResponse.json({ ok: true });
  }

  if (trigger.type === "conversation_updated") {
    emitMessagingEvent({
      type: "conversation_updated",
      conversationId: trigger.conversationId,
      action: trigger.action,
      patch: trigger.patch,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
}
