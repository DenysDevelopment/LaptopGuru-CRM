import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitMessagingEvent } from "@/lib/messaging-events";
import { buildConversationSummary } from "@/lib/messaging/conversation-summary";
import fs from "fs";
import path from "path";

const AVATARS_DIR = path.join(process.cwd(), "public", "uploads", "avatars");

/**
 * Fetch Telegram user profile photo and save locally.
 */
async function fetchTelegramAvatar(
  botToken: string,
  userId: number,
  contactId: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${userId}&limit=1`,
    );
    const data = await res.json();
    if (!data.ok || !data.result?.photos?.length) return null;

    const photo = data.result.photos[0];
    // Get the largest size
    const fileInfo = photo[photo.length - 1];
    if (!fileInfo?.file_id) return null;

    const fileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileInfo.file_id}`,
    );
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result?.file_path) return null;

    const imageUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) return null;

    const buffer = Buffer.from(await imageRes.arrayBuffer());
    const ext = fileData.result.file_path.split(".").pop() || "jpg";
    const fileName = `${contactId}.${ext}`;

    fs.mkdirSync(AVATARS_DIR, { recursive: true });
    fs.writeFileSync(path.join(AVATARS_DIR, fileName), buffer);

    return `/uploads/avatars/${fileName}`;
  } catch (err) {
    console.error("[TG Avatar] Error:", err);
    return null;
  }
}

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
    let contactChannel = await prisma.contactChannel.findFirst({
      where: {
        channelType: "TELEGRAM",
        identifier: chatId,
        companyId: channel.companyId,
      },
    });

    const botToken = channel.config.find((c) => c.key === "bot_token")?.value;

    if (!contactChannel) {
      const newContact = await prisma.contact.create({
        data: {
          displayName: senderName,
          firstName: msg.from?.first_name || null,
          lastName: msg.from?.last_name || null,
          companyId: channel.companyId,
          channels: {
            create: {
              channelType: "TELEGRAM",
              identifier: chatId,
              displayName: msg.from?.username ? `@${msg.from.username}` : null,
              companyId: channel.companyId,
            },
          },
        },
      });

      // Fetch the avatar in the background. Avatar fetching does 3 sequential
      // Telegram API calls + a disk write; doing it inside the webhook
      // request path was the main reason Caddy returned 502 ("Wrong response
      // from the webhook") under load — Telegram retries piled up faster
      // than we could finish answering. Fire-and-forget keeps the request
      // tiny; the avatar appears on the next page load.
      if (botToken && msg.from?.id) {
        const fromId = msg.from.id;
        const newId = newContact.id;
        const tk = botToken;
        void fetchTelegramAvatar(tk, fromId, newId)
          .then((avatarUrl) => {
            if (!avatarUrl) return;
            return prisma.contact.update({
              where: { id: newId },
              data: { avatarUrl },
            });
          })
          .catch((err) => console.error("[TG Avatar] bg fetch failed:", err));
      }

      contactChannel = await prisma.contactChannel.findFirst({
        where: {
          channelType: "TELEGRAM",
          identifier: chatId,
          companyId: channel.companyId,
        },
      });
      if (!contactChannel) {
        return NextResponse.json({ ok: true });
      }
    } else {
      // Background avatar refresh for existing contacts that don't have one
      // yet — same reasoning as above, never block the response on it.
      const existingContact = await prisma.contact.findUnique({ where: { id: contactChannel.contactId } });
      if (existingContact && !existingContact.avatarUrl && botToken && msg.from?.id) {
        const fromId = msg.from.id;
        const cid = existingContact.id;
        const tk = botToken;
        void fetchTelegramAvatar(tk, fromId, cid)
          .then((avatarUrl) => {
            if (!avatarUrl) return;
            return prisma.contact.update({
              where: { id: cid },
              data: { avatarUrl },
            });
          })
          .catch((err) => console.error("[TG Avatar] bg fetch failed:", err));
      }
    }

    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactChannel.contactId } });

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
          companyId: channel.companyId,
        },
      });
      await prisma.conversationEvent.create({
        data: {
          conversationId: conversation.id,
          type: "CONVERSATION_CREATED",
          actorUserId: null,
          payload: { source: "telegram" },
          companyId: channel.companyId,
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
        companyId: channel.companyId,
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

    // Emit real-time event via SSE — clients append/prepend instead of
    // refetching the full conversation list / message thread.
    if (isNewConversation) {
      const summary = await buildConversationSummary(conversation.id);
      if (summary) {
        emitMessagingEvent({
          type: "new_conversation",
          conversationId: conversation.id,
          conversation: summary,
        });
      }
    } else {
      emitMessagingEvent({
        type: "new_message",
        conversationId: conversation.id,
        message: {
          id: message.id,
          conversationId: conversation.id,
          direction: "INBOUND",
          contentType,
          body: text ?? "",
          createdAt: message.createdAt.toISOString(),
          contact: {
            id: contact.id,
            name: contact.displayName,
            avatarUrl: contact.avatarUrl,
          },
          status: "DELIVERED",
        },
        conversationPatch: {
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: (text ?? "").slice(0, 120),
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[TG Webhook] Error:", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}
