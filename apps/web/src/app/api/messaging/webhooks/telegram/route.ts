import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitMessagingEvent } from "@/lib/messaging-events";

/**
 * POST /api/messaging/webhooks/telegram
 * Receives Telegram Bot API updates.
 * Validated via x-telegram-bot-api-secret-token header.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract message from update
    const msg = body.message || body.edited_message;
    if (!msg) {
      return NextResponse.json({ ok: true }); // ignore non-message updates
    }

    const chatId = String(msg.chat.id);
    const senderName =
      [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") ||
      msg.from?.username ||
      "Telegram User";
    const text = msg.text || msg.caption || "";

    // Find the Telegram channel
    const channel = await prisma.channel.findFirst({
      where: { type: "TELEGRAM", isActive: true },
      include: { config: true },
    });

    if (!channel) {
      console.error("[TG Webhook] No active Telegram channel found");
      return NextResponse.json({ ok: true });
    }

    // Validate webhook secret token if configured
    const configSecret = channel.config.find((c) => c.key === "webhook_secret")?.value;
    if (configSecret) {
      const secretToken = request.headers.get("x-telegram-bot-api-secret-token");
      if (secretToken !== configSecret) {
        return NextResponse.json({ error: "Invalid secret token" }, { status: 403 });
      }
    }

    // Find or create contact
    let contactChannel = await prisma.contactChannel.findUnique({
      where: {
        channelType_identifier: {
          channelType: "TELEGRAM",
          identifier: chatId,
        },
      },
      include: { contact: true },
    });

    if (!contactChannel) {
      await prisma.contact.create({
        data: {
          displayName: senderName,
          firstName: msg.from?.first_name || null,
          lastName: msg.from?.last_name || null,
          channels: {
            create: {
              channelType: "TELEGRAM",
              identifier: chatId,
              displayName: msg.from?.username ? `@${msg.from.username}` : null,
            },
          },
        },
      });
      contactChannel = await prisma.contactChannel.findUnique({
        where: {
          channelType_identifier: {
            channelType: "TELEGRAM",
            identifier: chatId,
          },
        },
        include: { contact: true },
      });
      if (!contactChannel) {
        return NextResponse.json({ ok: true });
      }
    }

    const contact = contactChannel.contact;

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        contactId: contact.id,
        channelId: channel.id,
        status: { notIn: ["CLOSED", "SPAM"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          channelId: channel.id,
          status: "NEW",
          priority: "NORMAL",
          externalId: chatId,
        },
      });
    }

    // Determine content type
    let contentType: "TEXT" | "IMAGE" | "VIDEO" | "VOICE" | "FILE" | "STICKER" | "GEOLOCATION" = "TEXT";
    if (msg.photo) contentType = "IMAGE";
    else if (msg.video) contentType = "VIDEO";
    else if (msg.voice || msg.audio) contentType = "VOICE";
    else if (msg.document) contentType = "FILE";
    else if (msg.sticker) contentType = "STICKER";
    else if (msg.location) contentType = "GEOLOCATION";

    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        channelId: channel.id,
        direction: "INBOUND",
        contentType,
        body: text || null,
        externalId: String(msg.message_id),
        contactId: contact.id,
        ...(msg.location
          ? {
              geolocation: {
                create: {
                  latitude: msg.location.latitude,
                  longitude: msg.location.longitude,
                },
              },
            }
          : {}),
      },
    });

    // Create status event
    await prisma.messageStatusEvent.create({
      data: {
        messageId: message.id,
        status: "DELIVERED",
      },
    });

    // Update conversation
    const isNewConversation = conversation.status === "NEW" && !conversation.lastMessageAt;
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        status: conversation.status === "WAITING_REPLY" ? "OPEN" : conversation.status === "CLOSED" ? "NEW" : undefined,
      },
    });

    // Emit real-time event via SSE
    emitMessagingEvent({
      type: isNewConversation ? "new_conversation" : "new_message",
      conversationId: conversation.id,
      data: {
        messageId: message.id,
        body: text,
        senderName,
        channelType: "TELEGRAM",
        contactId: contact.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[TG Webhook] Error:", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}
