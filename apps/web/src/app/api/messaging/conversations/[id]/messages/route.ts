import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { emitMessagingEvent } from "@/lib/messaging-events";
import { formatSmtpFrom } from "@/lib/smtp";

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
    select: { id: true, channelId: true, contactId: true, companyId: true },
  });

  if (!conversation || conversation.companyId !== (session.user!.companyId ?? "")) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
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

  // Update conversation
  await prisma.conversation.update({
    where: { id },
    data: {
      lastMessageAt: new Date(),
      status: "WAITING_REPLY",
    },
  });

  // Send message through the actual channel
  const channel = await prisma.channel.findUnique({
    where: { id: conversation.channelId },
    include: { config: true },
  });

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

          const info = await transporter.sendMail({
            from: formatSmtpFrom(configMap.smtp_display_name, smtpFrom),
            to: contactChannel.identifier,
            subject: conv?.subject ? `Re: ${conv.subject}` : "Сообщение от LaptopGuru",
            text: body.body,
            html: `<div style="font-family:sans-serif;">${escapeHtml(body.body).replace(/\n/g, "<br/>")}</div>`,
            ...(conv?.externalId ? { inReplyTo: conv.externalId, references: conv.externalId } : {}),
          });

          transporter.close();
          deliveryStatus = "SENT";
          externalId = info.messageId;
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
  }

  // Emit SSE event
  emitMessagingEvent({
    type: "new_message",
    conversationId: id,
    data: { messageId: message.id, direction: "OUTBOUND" },
  });

  return NextResponse.json(message, { status: 201 });
}
