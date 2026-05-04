import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { emitMessagingEvent } from "@/lib/messaging-events";
import { transitionConversationStatus } from "@/lib/messaging/transition-status";
import { formatSmtpFrom } from "@/lib/smtp";
import { sendViaAllegroDirect } from "@/lib/messaging/allegro-send";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CONVERSATIONS_READ);
  if (error) return error;

  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!conversation || conversation.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = request.nextUrl;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      senderUser: { select: { id: true, name: true, email: true } },
      contact: { select: { id: true, displayName: true, avatarUrl: true } },
      attachments: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          storageUrl: true,
        },
      },
      statuses: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { status: true, timestamp: true },
      },
    },
  });

  const items = messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    contentType: m.contentType,
    body: m.body,
    metadata: m.metadata,
    createdAt: m.createdAt,
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
    status: m.statuses[0]?.status || null,
  }));

  return NextResponse.json({ items });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_MESSAGES_SEND);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      channelId: true,
      contactId: true,
      companyId: true,
      externalId: true,
    },
  });

  if (!conversation || conversation.companyId !== (session.user!.companyId ?? "")) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Validate attachments shape — { fileName, mimeType, fileSize, storageKey, storageUrl }[]
  type AttachmentInput = {
    fileName: string;
    mimeType: string;
    fileSize: number;
    storageKey: string;
    storageUrl: string;
  };
  const attachmentsInput: AttachmentInput[] = Array.isArray(body.attachments)
    ? (body.attachments as AttachmentInput[]).filter(
        (a) => a && a.fileName && a.storageKey && a.storageUrl,
      )
    : [];

  if (!body.body?.trim() && attachmentsInput.length === 0) {
    return NextResponse.json(
      { error: "Message must have body or attachments" },
      { status: 400 },
    );
  }

  const message = await prisma.message.create({
    data: {
      conversationId: id,
      channelId: conversation.channelId,
      direction: "OUTBOUND",
      contentType: body.contentType || "TEXT",
      body: body.body,
      senderId: session.user!.id,
      contactId: conversation.contactId,
      companyId: session.user!.companyId ?? "",
    },
  });

  // Bind any uploaded attachments to this Message.
  if (attachmentsInput.length > 0) {
    await prisma.messageAttachment.createMany({
      data: attachmentsInput.map((a) => ({
        messageId: message.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        storageKey: a.storageKey,
        storageUrl: a.storageUrl,
      })),
    });
  }

  // Bump last-message timestamp; status moves through the audited
  // helper so the transition is logged in ConversationEvent.
  await prisma.conversation.update({
    where: { id },
    data: { lastMessageAt: new Date() },
  });
  await transitionConversationStatus({
    conversationId: id,
    toStatus: "WAITING_REPLY",
    actorUserId: session.user!.id,
    reason: "outbound-reply",
    requireFromStatus: ["NEW", "OPEN", "RESOLVED"],
  }).catch(() => {/* non-fatal */});

  // Send message through the actual channel
  const channel = await prisma.channel.findUnique({
    where: { id: conversation.channelId },
    include: { config: true },
  });

  // Hoisted so the final response can include them — the client uses these
  // to flip an optimistic "SENDING" bubble to SENT/FAILED.
  let finalDeliveryStatus: "SENT" | "FAILED" = "FAILED";
  let finalExternalId: string | undefined;

  if (channel) {
    const configMap = Object.fromEntries(
      channel.config.map((c) => [c.key, c.value]),
    );

    let deliveryStatus: "SENT" | "FAILED" = "FAILED";
    let externalId: string | undefined;

    try {
      if (channel.type === "TELEGRAM" && configMap.bot_token) {
        // Find recipient chat ID from contact channel
        const contactChannel = await prisma.contactChannel.findFirst({
          where: { contactId: conversation.contactId, channelType: "TELEGRAM" },
        });
        if (contactChannel) {
          const res = await fetch(
            `https://api.telegram.org/bot${configMap.bot_token}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: contactChannel.identifier,
                text: body.body,
              }),
            },
          );
          const result = await res.json();
          if (result.ok) {
            deliveryStatus = "SENT";
            externalId = String(result.result.message_id);
          } else {
            console.error("[TG Send] Error:", result);
          }

          // Send each attachment as a separate Telegram message — Bot API
          // doesn't multiplex media+text in one call. Telegram fetches the
          // file by URL, so APP_URL must be reachable from telegram.org.
          if (attachmentsInput.length > 0) {
            const appUrl = process.env.APP_URL || "http://localhost:3000";
            for (const a of attachmentsInput) {
              try {
                const isImg = a.mimeType.startsWith("image/");
                const tgMethod = isImg ? "sendPhoto" : "sendDocument";
                const tgField = isImg ? "photo" : "document";
                await fetch(
                  `https://api.telegram.org/bot${configMap.bot_token}/${tgMethod}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      chat_id: contactChannel.identifier,
                      [tgField]: `${appUrl}${a.storageUrl}`,
                    }),
                  },
                );
              } catch (err) {
                console.error(`[TG Attachment] ${a.fileName}:`, err);
              }
            }
          }
        }
      }
      if (channel.type === "EMAIL") {
        const contactChannel = await prisma.contactChannel.findFirst({
          where: { contactId: conversation.contactId, channelType: "EMAIL" },
        });
        if (contactChannel) {
          const nodemailer = await import("nodemailer");
          const smtpHost = configMap.smtp_host;
          const smtpPort = Number(configMap.smtp_port || "465");
          const smtpUser = configMap.smtp_user;
          const smtpPass = configMap.smtp_password;
          const smtpFrom = configMap.smtp_from || smtpUser;

          const transporter = nodemailer.default.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
          });

          // Get conversation subject
          const conv = await prisma.conversation.findUnique({
            where: { id },
            select: { subject: true, externalId: true },
          });

          // Resolve attachment file paths relative to public/ for nodemailer.
          const path = await import("path");
          const mailAttachments = attachmentsInput.map((a) => ({
            filename: a.fileName,
            path: path.join(process.cwd(), "public", a.storageKey),
            contentType: a.mimeType,
          }));

          const info = await transporter.sendMail({
            from: formatSmtpFrom(configMap.smtp_display_name, smtpFrom),
            to: contactChannel.identifier,
            subject: conv?.subject ? `Re: ${conv.subject}` : "Сообщение от LaptopGuru",
            text: body.body,
            html: `<div style="font-family:sans-serif;">${escapeHtml(body.body || "").replace(/\n/g, "<br/>")}</div>`,
            ...(mailAttachments.length > 0 ? { attachments: mailAttachments } : {}),
            ...(conv?.externalId ? { inReplyTo: conv.externalId, references: conv.externalId } : {}),
          });

          transporter.close();
          deliveryStatus = "SENT";
          externalId = info.messageId;
        }
      }
      if (channel.type === "ALLEGRO") {
        // Allegro discussion threads: conversation.externalId is the thread ID
        // we ingested from Allegro's polling API.
        if (!conversation.externalId) {
          console.error("[Allegro Send] Conversation has no externalId (threadId)");
        } else {
          const result = await sendViaAllegroDirect({
            companyId: conversation.companyId,
            threadId: conversation.externalId,
            text: body.body ?? "",
            attachments: attachmentsInput.map((a) => ({
              fileName: a.fileName,
              mimeType: a.mimeType,
              storageKey: a.storageKey,
            })),
          });
          if (result.ok) {
            deliveryStatus = "SENT";
            externalId = result.messageId;
            if (result.error) console.warn("[Allegro Send] Partial:", result.error);
          } else {
            console.error("[Allegro Send] Error:", result.error);
          }
        }
      }
    } catch (err) {
      console.error("[Send] Error:", err);
    }

    // Update message with external ID and status
    await prisma.message.update({
      where: { id: message.id },
      data: { externalId },
    });

    await prisma.messageStatusEvent.create({
      data: {
        messageId: message.id,
        status: deliveryStatus,
      },
    });

    finalDeliveryStatus = deliveryStatus;
    finalExternalId = externalId;
  }

  // Emit SSE event with the full message so connected clients can append it
  // directly to the open thread (no refetch).
  const senderUser = await prisma.user.findUnique({
    where: { id: session.user!.id },
    select: { id: true, name: true, email: true },
  });
  // Re-load attachments freshly so the SSE payload includes the persisted
  // ids/urls (createMany above doesn't return rows).
  const persistedAttachments =
    attachmentsInput.length > 0
      ? await prisma.messageAttachment.findMany({
          where: { messageId: message.id },
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            storageUrl: true,
          },
        })
      : [];

  emitMessagingEvent({
    type: "new_message",
    conversationId: id,
    message: {
      id: message.id,
      conversationId: id,
      direction: "OUTBOUND",
      contentType: message.contentType,
      body: message.body ?? "",
      createdAt: message.createdAt.toISOString(),
      sender: senderUser
        ? { id: senderUser.id, name: senderUser.name, email: senderUser.email }
        : null,
      attachments: persistedAttachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        url: a.storageUrl,
        size: a.fileSize,
      })),
      status: "SENT",
    },
    conversationPatch: {
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: (message.body ?? "").slice(0, 120),
    },
  });

  return NextResponse.json(
    {
      ...message,
      externalId: finalExternalId ?? null,
      deliveryStatus: finalDeliveryStatus,
    },
    { status: 201 },
  );
}
